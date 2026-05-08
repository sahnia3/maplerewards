package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type BuyPromoRepo struct {
	db *pgxpool.Pool
}

func NewBuyPromoRepo(db *pgxpool.Pool) *BuyPromoRepo { return &BuyPromoRepo{db: db} }

// CurrentPromos returns the most recent active promo per program.
func (r *BuyPromoRepo) CurrentPromos(ctx context.Context) ([]model.BuyPromo, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT ON (program_slug)
		  program_slug, promo_label, base_cents_per_point, promo_cents_per_point,
		  valid_from, valid_to, COALESCE(source_url, '')
		FROM buy_promo_pricing
		WHERE valid_to IS NULL OR valid_to >= CURRENT_DATE
		ORDER BY program_slug, valid_from DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.BuyPromo
	for rows.Next() {
		var p model.BuyPromo
		if err := rows.Scan(&p.ProgramSlug, &p.PromoLabel, &p.BaseCentsPerPoint, &p.PromoCentsPerPoint,
			&p.ValidFrom, &p.ValidTo, &p.SourceURL); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
