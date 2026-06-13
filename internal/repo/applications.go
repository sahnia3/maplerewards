package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ApplicationRepo struct {
	db *pgxpool.Pool
}

func NewApplicationRepo(db *pgxpool.Pool) *ApplicationRepo {
	return &ApplicationRepo{db: db}
}

// CardApplication is one user-recorded credit-card application. Status is
// user-maintained (we don't have approval/decline events from issuers).
type CardApplication struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	CardID     string    `json:"card_id"`
	CardName   string    `json:"card_name,omitempty"`
	Issuer     string    `json:"issuer,omitempty"`
	AppliedAt  string    `json:"applied_at"` // ISO date
	Status     string    `json:"status"`     // pending | approved | declined
	Notes      string    `json:"notes,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// IssuerRule is one cooldown / max-per-year rule. The CheckEligibility
// service consults these to warn before a user records a new application.
type IssuerRule struct {
	Issuer    string `json:"issuer"`
	RuleType  string `json:"rule_type"` // cooldown_days | max_per_year
	Value     int    `json:"value"`
	Notes     string `json:"notes,omitempty"`
}

func (r *ApplicationRepo) List(ctx context.Context, userID string) ([]CardApplication, error) {
	rows, err := r.db.Query(ctx, `
		SELECT a.id, a.user_id, a.card_id, c.name, c.issuer,
		       to_char(a.applied_at, 'YYYY-MM-DD'),
		       a.status, COALESCE(a.notes, ''), a.created_at
		FROM card_applications a
		JOIN cards c ON c.id = a.card_id
		WHERE a.user_id = $1
		ORDER BY a.applied_at DESC, a.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list applications: %w", err)
	}
	defer rows.Close()
	var out []CardApplication
	for rows.Next() {
		var a CardApplication
		if err := rows.Scan(&a.ID, &a.UserID, &a.CardID, &a.CardName, &a.Issuer,
			&a.AppliedAt, &a.Status, &a.Notes, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *ApplicationRepo) Create(ctx context.Context, userID, cardID, appliedAt, status, notes string) (*CardApplication, error) {
	if status == "" {
		status = "pending"
	}
	row := r.db.QueryRow(ctx, `
		INSERT INTO card_applications (user_id, card_id, applied_at, status, notes)
		VALUES ($1, $2, $3::date, $4, NULLIF($5, ''))
		RETURNING id, created_at
	`, userID, cardID, appliedAt, status, notes)
	var a CardApplication
	a.UserID = userID
	a.CardID = cardID
	a.AppliedAt = appliedAt
	a.Status = status
	a.Notes = notes
	if err := row.Scan(&a.ID, &a.CreatedAt); err != nil {
		return nil, fmt.Errorf("create application: %w", err)
	}
	return &a, nil
}

// UpdateStatus sets the user-maintained status on one application row. The
// user_id predicate scopes the write to the owner (same shape as Delete).
func (r *ApplicationRepo) UpdateStatus(ctx context.Context, userID, applicationID, status string) (*CardApplication, error) {
	row := r.db.QueryRow(ctx, `
		UPDATE card_applications a
		SET status = $3
		FROM cards c
		WHERE a.id = $1 AND a.user_id = $2 AND c.id = a.card_id
		RETURNING a.id, a.user_id, a.card_id, c.name, c.issuer,
		          to_char(a.applied_at, 'YYYY-MM-DD'),
		          a.status, COALESCE(a.notes, ''), a.created_at
	`, applicationID, userID, status)
	var a CardApplication
	if err := row.Scan(&a.ID, &a.UserID, &a.CardID, &a.CardName, &a.Issuer,
		&a.AppliedAt, &a.Status, &a.Notes, &a.CreatedAt); err != nil {
		return nil, fmt.Errorf("update application status: %w", err)
	}
	return &a, nil
}

func (r *ApplicationRepo) Delete(ctx context.Context, userID, applicationID string) error {
	_, err := r.db.Exec(ctx, `
		DELETE FROM card_applications WHERE id = $1 AND user_id = $2
	`, applicationID, userID)
	if err != nil {
		return fmt.Errorf("delete application: %w", err)
	}
	return nil
}

// ListIssuerRules returns all configured rules. Small table, no filter.
func (r *ApplicationRepo) ListIssuerRules(ctx context.Context) ([]IssuerRule, error) {
	rows, err := r.db.Query(ctx, `
		SELECT issuer, rule_type, value, COALESCE(notes, '')
		FROM issuer_rules
		ORDER BY issuer
	`)
	if err != nil {
		return nil, fmt.Errorf("list issuer rules: %w", err)
	}
	defer rows.Close()
	var out []IssuerRule
	for rows.Next() {
		var rule IssuerRule
		if err := rows.Scan(&rule.Issuer, &rule.RuleType, &rule.Value, &rule.Notes); err != nil {
			return nil, err
		}
		out = append(out, rule)
	}
	return out, rows.Err()
}

// LastApplicationForIssuer returns the most recent application date for a user
// against a specific issuer. Used by CheckEligibility to evaluate cooldown.
// Returns zero time when no prior application exists (MAX() over empty set
// returns NULL, which we scan into a nullable pointer).
func (r *ApplicationRepo) LastApplicationForIssuer(ctx context.Context, userID, issuer string) (time.Time, error) {
	var t *time.Time
	err := r.db.QueryRow(ctx, `
		SELECT MAX(a.applied_at)
		FROM card_applications a
		JOIN cards c ON c.id = a.card_id
		WHERE a.user_id = $1 AND c.issuer = $2
	`, userID, issuer).Scan(&t)
	if err != nil {
		return time.Time{}, fmt.Errorf("last application for issuer: %w", err)
	}
	if t == nil {
		return time.Time{}, nil
	}
	return *t, nil
}

// CountApplicationsForIssuerSince counts a user's applications to an issuer on
// or after `since`. Used by CheckEligibility to evaluate max_per_year rules.
func (r *ApplicationRepo) CountApplicationsForIssuerSince(ctx context.Context, userID, issuer string, since time.Time) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM card_applications a
		JOIN cards c ON c.id = a.card_id
		WHERE a.user_id = $1 AND c.issuer = $2 AND a.applied_at >= $3::date
	`, userID, issuer, since.Format("2006-01-02")).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("count applications for issuer since: %w", err)
	}
	return n, nil
}
