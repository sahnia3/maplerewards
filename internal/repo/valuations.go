package repo

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ValuationRepo struct {
	db *pgxpool.Pool
}

func NewValuationRepo(db *pgxpool.Pool) *ValuationRepo {
	return &ValuationRepo{db: db}
}

// GetCPP returns the most recent CPP (cents per point) for a program+segment.
// segment is typically "base"; use "business" or "economy" for flight-class splits.
func (r *ValuationRepo) GetCPP(ctx context.Context, programSlug, segment string) (float64, error) {
	var cpp float64
	err := r.db.QueryRow(ctx, `
		SELECT pv.cpp
		FROM point_valuations pv
		JOIN loyalty_programs lp ON lp.id = pv.loyalty_program_id
		WHERE lp.slug = $1 AND pv.segment = $2
		ORDER BY pv.effective_date DESC
		LIMIT 1
	`, programSlug, segment).Scan(&cpp)
	return cpp, err
}

// GetValuationAsOf returns when the program's base-segment CPP was last
// refreshed (point_valuations.recorded_at, added in migration 000033). This is
// the real provenance timestamp the frontend renders as "valuations as of
// <Mon YYYY>". Returns the zero time + pgx.ErrNoRows if the program has no
// base valuation row.
func (r *ValuationRepo) GetValuationAsOf(ctx context.Context, programSlug string) (time.Time, error) {
	var asOf time.Time
	err := r.db.QueryRow(ctx, `
		SELECT pv.recorded_at
		FROM point_valuations pv
		JOIN loyalty_programs lp ON lp.id = pv.loyalty_program_id
		WHERE lp.slug = $1 AND pv.segment = 'base'
		ORDER BY pv.recorded_at DESC
		LIMIT 1
	`, programSlug).Scan(&asOf)
	return asOf, err
}

// GetCatalogValuationAsOf returns the most recent recorded_at across all
// point_valuations rows — a single catalog-level "valuations last updated"
// date. Used by surfaces that don't fetch a specific program (wallet gauge,
// optimizer) so they can show provenance without per-program plumbing.
func (r *ValuationRepo) GetCatalogValuationAsOf(ctx context.Context) (time.Time, error) {
	var asOf time.Time
	err := r.db.QueryRow(ctx, `
		SELECT MAX(recorded_at) FROM point_valuations
	`).Scan(&asOf)
	return asOf, err
}

// UpsertValuation writes (or refreshes) the active CPP for a (program, segment).
// effective_date defaults to today so a same-day re-push updates the row in
// place via the (loyalty_program_id, segment, effective_date) unique key.
// recorded_at is bumped on every call so the staleness chip resets.
func (r *ValuationRepo) UpsertValuation(
	ctx context.Context,
	programSlug, segment string,
	cppCents float64,
	source string,
) error {
	if programSlug == "" || segment == "" {
		return fmt.Errorf("program slug and segment required")
	}
	if source == "" {
		source = "manual"
	}
	tag, err := r.db.Exec(ctx, `
		INSERT INTO point_valuations
			(loyalty_program_id, segment, cpp, source, effective_date, recorded_at)
		SELECT lp.id, $2, $3, $4, CURRENT_DATE, now()
		FROM loyalty_programs lp
		WHERE lp.slug = $1
		ON CONFLICT (loyalty_program_id, segment, effective_date)
		DO UPDATE SET
			cpp         = EXCLUDED.cpp,
			source      = EXCLUDED.source,
			recorded_at = now()
	`, programSlug, segment, cppCents, source)
	if err != nil {
		return fmt.Errorf("upsert valuation: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("unknown program slug: %s", programSlug)
	}
	return nil
}

// InsertHistory appends one observation to point_valuation_history.
// Append-only — never UPDATE; the table is the audit log used by the
// /refresh-valuations job and any future trend-line chart.
func (r *ValuationRepo) InsertHistory(
	ctx context.Context,
	programSlug, segment string,
	cppCents float64,
	source string,
) error {
	if programSlug == "" || segment == "" {
		return fmt.Errorf("program slug and segment required")
	}
	if source == "" {
		source = "manual"
	}
	_, err := r.db.Exec(ctx, `
		INSERT INTO point_valuation_history
			(program_slug, segment, cpp_cents, source, recorded_at)
		VALUES ($1, $2, $3, $4, now())
	`, programSlug, segment, cppCents, source)
	if err != nil {
		return fmt.Errorf("insert history: %w", err)
	}
	return nil
}
