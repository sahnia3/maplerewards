package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DevaluationAlert is one persisted per-user devaluation-alert subscription. A
// row exists for each program the user toggled "Set devaluation alert" on; the
// row is deleted when the toggle is cleared. Mirrors the user_cpp design, minus
// the segment dimension.
type DevaluationAlert struct {
	ID          string
	UserID      string
	ProgramSlug string
	CreatedAt   time.Time
}

type DevaluationAlertRepo struct {
	pool *pgxpool.Pool
}

func NewDevaluationAlertRepo(pool *pgxpool.Pool) *DevaluationAlertRepo {
	return &DevaluationAlertRepo{pool: pool}
}

// ListByUser returns every program the user subscribed to alerts for.
func (r *DevaluationAlertRepo) ListByUser(ctx context.Context, userID string) ([]DevaluationAlert, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, program_slug, created_at
		FROM devaluation_alerts WHERE user_id = $1 ORDER BY program_slug`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DevaluationAlert
	for rows.Next() {
		var a DevaluationAlert
		if err := rows.Scan(&a.ID, &a.UserID, &a.ProgramSlug, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// Upsert subscribes the user to a program's devaluation alerts (idempotent).
func (r *DevaluationAlertRepo) Upsert(ctx context.Context, userID, programSlug string) (*DevaluationAlert, error) {
	var a DevaluationAlert
	err := r.pool.QueryRow(ctx, `
		INSERT INTO devaluation_alerts (user_id, program_slug)
		VALUES ($1, $2)
		ON CONFLICT (user_id, program_slug) DO UPDATE SET program_slug = EXCLUDED.program_slug
		RETURNING id, user_id, program_slug, created_at`, userID, programSlug).
		Scan(&a.ID, &a.UserID, &a.ProgramSlug, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// Delete clears the user's alert subscription for one program. Scoped to the
// owning user so a forged program_slug can never touch another user's row.
func (r *DevaluationAlertRepo) Delete(ctx context.Context, userID, programSlug string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM devaluation_alerts WHERE user_id = $1 AND program_slug = $2`, userID, programSlug)
	return err
}
