package repo

import (
	"context"
	"time"

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
		       is_active, last_checked_at, last_min_points, created_at
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
		var lastChecked *time.Time
		if err := rows.Scan(&w.ID, &w.UserID, &w.Origin, &w.Destination, &depart, &w.FlexDays,
			&w.Cabin, &w.MaxPoints, &w.ProgramSlug, &w.IsActive, &lastChecked, &w.LastMinPoints, &w.CreatedAt); err != nil {
			return nil, err
		}
		w.DepartDate = depart.Format("2006-01-02")
		if lastChecked != nil {
			s := lastChecked.Format(time.RFC3339)
			w.LastCheckedAt = &s
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (r *AwardWatchRepo) Delete(ctx context.Context, userID, watchID string) error {
	_, err := r.db.Exec(ctx, `DELETE FROM award_watch WHERE id = $1 AND user_id = $2`, watchID, userID)
	return err
}
