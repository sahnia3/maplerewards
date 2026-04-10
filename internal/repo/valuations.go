package repo

import (
	"context"

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
