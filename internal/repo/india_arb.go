package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type IndiaArbRepo struct {
	db *pgxpool.Pool
}

func NewIndiaArbRepo(db *pgxpool.Pool) *IndiaArbRepo { return &IndiaArbRepo{db: db} }

// ListWithUserBalances joins arbitrage properties with the user's program balances.
// Programs without any wallet card mapped to them get UserBalance=0.
func (r *IndiaArbRepo) ListWithUserBalances(ctx context.Context, userID string) ([]model.IndiaArbitrageProperty, error) {
	// Pull all properties.
	rows, err := r.db.Query(ctx, `
		SELECT program_slug, property_name, city, points_per_night,
		       cash_rate_inr, cash_rate_cad, value_cad_per_point,
		       COALESCE(notes,''), COALESCE(source_url,'')
		FROM india_hotel_arbitrage
		ORDER BY value_cad_per_point DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var props []model.IndiaArbitrageProperty
	for rows.Next() {
		var p model.IndiaArbitrageProperty
		if err := rows.Scan(&p.ProgramSlug, &p.PropertyName, &p.City, &p.PointsPerNight,
			&p.CashRateINR, &p.CashRateCAD, &p.ValueCADPerPoint, &p.Notes, &p.SourceURL); err != nil {
			return nil, err
		}
		props = append(props, p)
	}

	// Per-program user balance: sum of point_balance across wallet cards on that program.
	balRows, err := r.db.Query(ctx, `
		SELECT lp.slug, COALESCE(SUM(uc.point_balance), 0)
		FROM user_cards uc
		JOIN cards c ON c.id = uc.card_id
		JOIN loyalty_programs lp ON lp.id = c.loyalty_program_id
		WHERE uc.user_id = $1
		GROUP BY lp.slug
	`, userID)
	if err != nil {
		return props, nil // return what we have
	}
	defer balRows.Close()
	balByProgram := map[string]int{}
	for balRows.Next() {
		var slug string
		var bal int
		if err := balRows.Scan(&slug, &bal); err != nil {
			continue
		}
		balByProgram[slug] = bal
	}

	for i := range props {
		bal := balByProgram[props[i].ProgramSlug]
		props[i].UserBalance = bal
		if props[i].PointsPerNight > 0 {
			props[i].NightsAffordable = bal / props[i].PointsPerNight
		}
		props[i].TotalSavingsCAD = float64(props[i].NightsAffordable) * props[i].CashRateCAD
	}
	return props, nil
}
