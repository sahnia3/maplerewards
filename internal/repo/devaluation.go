package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type DevaluationRepo struct {
	db *pgxpool.Pool
}

func NewDevaluationRepo(db *pgxpool.Pool) *DevaluationRepo { return &DevaluationRepo{db: db} }

// ListUpcoming returns events with effective_date >= today - 90d (recent past + future).
// If userPrograms is non-nil, sets UserHolds=true on matching events.
func (r *DevaluationRepo) ListUpcoming(ctx context.Context, userPrograms map[string]bool) ([]model.DevaluationEvent, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, program_slug, title, COALESCE(description,''), severity, effective_date, posted_at, COALESCE(source_url, '')
		FROM devaluation_events
		WHERE effective_date >= CURRENT_DATE - INTERVAL '90 days'
		ORDER BY effective_date ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	now := time.Now()
	var out []model.DevaluationEvent
	for rows.Next() {
		var e model.DevaluationEvent
		var eff, posted time.Time
		if err := rows.Scan(&e.ID, &e.ProgramSlug, &e.Title, &e.Description, &e.Severity, &eff, &posted, &e.SourceURL); err != nil {
			return nil, err
		}
		e.EffectiveDate = eff.Format("2006-01-02")
		e.PostedAt = posted.Format("2006-01-02")
		e.DaysUntil = int(eff.Sub(now).Hours() / 24)
		if userPrograms != nil {
			e.UserHolds = userPrograms[e.ProgramSlug]
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
