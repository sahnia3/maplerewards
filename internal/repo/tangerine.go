package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type TangerineRepo struct {
	db *pgxpool.Pool
}

func NewTangerineRepo(db *pgxpool.Pool) *TangerineRepo { return &TangerineRepo{db: db} }

func (r *TangerineRepo) ListCategories(ctx context.Context) ([]model.TangerineCategory, error) {
	rows, err := r.db.Query(ctx, `SELECT slug, display_name, mcc_codes, COALESCE(description,'') FROM tangerine_categories ORDER BY display_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.TangerineCategory
	for rows.Next() {
		var t model.TangerineCategory
		if err := rows.Scan(&t.Slug, &t.DisplayName, &t.MCCCodes, &t.Description); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
