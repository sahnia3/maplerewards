package repo

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type AwardWatchRepo struct {
	db *pgxpool.Pool
}

func NewAwardWatchRepo(db *pgxpool.Pool) *AwardWatchRepo { return &AwardWatchRepo{db: db} }

func (r *AwardWatchRepo) Create(ctx context.Context, w model.AwardWatch) (*model.AwardWatch, error) {
	depart, _ := time.Parse("2006-01-02", w.DepartDate)
	err := r.db.QueryRow(ctx, `
		INSERT INTO award_watch (user_id, origin, destination, depart_date, flex_days, cabin, max_points, program_slug)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		RETURNING id, created_at
	`, w.UserID, w.Origin, w.Destination, depart, w.FlexDays, w.Cabin, w.MaxPoints, w.ProgramSlug).Scan(&w.ID, &w.CreatedAt)
	w.IsActive = true
	return &w, err
}

func (r *AwardWatchRepo) ListByUser(ctx context.Context, userID string) ([]model.AwardWatch, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, user_id, origin, destination, depart_date, flex_days, cabin, max_points, program_slug,
		       is_active, last_checked_at, last_min_points, last_alert_at, last_alert_message, created_at
		FROM award_watch WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.AwardWatch
	for rows.Next() {
		var w model.AwardWatch
		var depart time.Time
		var lastChecked, lastAlertAt *time.Time
		if err := rows.Scan(&w.ID, &w.UserID, &w.Origin, &w.Destination, &depart, &w.FlexDays,
			&w.Cabin, &w.MaxPoints, &w.ProgramSlug, &w.IsActive, &lastChecked, &w.LastMinPoints,
			&lastAlertAt, &w.LastAlertMessage, &w.CreatedAt); err != nil {
			return nil, err
		}
		w.DepartDate = depart.Format("2006-01-02")
		if lastChecked != nil {
			s := lastChecked.Format(time.RFC3339)
			w.LastCheckedAt = &s
		}
		if lastAlertAt != nil {
			s := lastAlertAt.Format(time.RFC3339)
			w.LastAlertAt = &s
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (r *AwardWatchRepo) Delete(ctx context.Context, userID, watchID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM award_watch WHERE id = $1 AND user_id = $2`, watchID, userID)
	return err
}

// ListActive returns every active watch in the system, oldest-checked-first.
// Used by the cron worker to fan out availability checks. Skips watches whose
// depart_date is already in the past — keeping a tickled query instead of a
// global table scan saves Apify cost on dead watches.
func (r *AwardWatchRepo) ListActive(ctx context.Context, limit int) ([]model.AwardWatch, error) {
	if limit <= 0 {
		limit = 100
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, user_id, origin, destination, depart_date, flex_days, cabin, max_points, program_slug,
		       is_active, last_checked_at, last_min_points, last_alert_at, last_alert_message, created_at
		FROM award_watch
		WHERE is_active = true AND depart_date >= CURRENT_DATE
		ORDER BY last_checked_at NULLS FIRST
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.AwardWatch
	for rows.Next() {
		var w model.AwardWatch
		var depart time.Time
		var lastChecked, lastAlertAt *time.Time
		if err := rows.Scan(&w.ID, &w.UserID, &w.Origin, &w.Destination, &depart, &w.FlexDays,
			&w.Cabin, &w.MaxPoints, &w.ProgramSlug, &w.IsActive, &lastChecked, &w.LastMinPoints,
			&lastAlertAt, &w.LastAlertMessage, &w.CreatedAt); err != nil {
			return nil, err
		}
		w.DepartDate = depart.Format("2006-01-02")
		if lastChecked != nil {
			s := lastChecked.Format(time.RFC3339)
			w.LastCheckedAt = &s
		}
		if lastAlertAt != nil {
			s := lastAlertAt.Format(time.RFC3339)
			w.LastAlertAt = &s
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

// RecordCheck stores the most recent point cost observed for a watch. Called
// by the cron worker after each Apify probe; nil minPoints means the probe
// returned no availability.
func (r *AwardWatchRepo) RecordCheck(ctx context.Context, watchID string, minPoints *int) error {
	_, err := r.db.Exec(ctx, `
		UPDATE award_watch
		SET last_checked_at = NOW(),
		    last_min_points = $2
		WHERE id = $1
	`, watchID, minPoints)
	return err
}

// RecordAlert stamps last_alert_at + last_alert_message when the cron worker
// has decided a watch's current state is alert-worthy (within max_points or
// significantly improved over prior check).
func (r *AwardWatchRepo) RecordAlert(ctx context.Context, watchID, message string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE award_watch
		SET last_alert_at      = NOW(),
		    last_alert_message = $2
		WHERE id = $1
	`, watchID, message)
	return err
}

// RecordCheckFailure increments the failure counter; the worker can disable
// chronically failing watches once the counter passes a threshold.
func (r *AwardWatchRepo) RecordCheckFailure(ctx context.Context, watchID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE award_watch
		SET check_failures = check_failures + 1,
		    last_checked_at = NOW()
		WHERE id = $1
	`, watchID)
	return err
}

// AlertRecipient holds the data the notification rail needs to deliver an
// alert for a watch. `Email` is the live address on file; `EmailVerified` is
// informational (the worker may choose to skip unverified addresses, but the
// user explicitly opted in by creating the watch, so v1 sends to either).
// `Found` is false when the watch is missing or its owner has been soft-deleted.
type AlertRecipient struct {
	Email         string
	EmailVerified bool
	Found         bool
}

// GetAlertRecipient looks up the email of the user who owns a watch. Soft-
// deleted users (deleted_at IS NOT NULL) are excluded because their email is
// scrambled on delete — sending there would land in someone else's inbox if
// the address has been reused.
func (r *AwardWatchRepo) GetAlertRecipient(ctx context.Context, watchID string) (AlertRecipient, error) {
	var rec AlertRecipient
	var verifiedAt *time.Time
	err := r.db.QueryRow(ctx, `
		SELECT u.email, u.email_verified_at
		FROM award_watch w
		JOIN users u ON u.id = w.user_id
		WHERE w.id = $1 AND u.deleted_at IS NULL
	`, watchID).Scan(&rec.Email, &verifiedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AlertRecipient{}, nil
		}
		return AlertRecipient{}, err
	}
	rec.EmailVerified = verifiedAt != nil
	rec.Found = rec.Email != ""
	return rec, nil
}
