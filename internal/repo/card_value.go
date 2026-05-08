package repo

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

type CardValueRepo struct {
	db *pgxpool.Pool
}

func NewCardValueRepo(db *pgxpool.Pool) *CardValueRepo { return &CardValueRepo{db: db} }

// SummaryForUserCards returns annual-value breakdown per wallet card.
func (r *CardValueRepo) SummaryForUserCards(ctx context.Context, userID string) ([]model.CardValueSummary, error) {
	cardRows, err := r.db.Query(ctx, `
		SELECT c.id, c.name, c.annual_fee
		FROM user_cards uc
		JOIN cards c ON c.id = uc.card_id
		WHERE uc.user_id = $1
		ORDER BY c.annual_fee DESC, c.name
	`, userID)
	if err != nil {
		return nil, err
	}
	defer cardRows.Close()

	type cardKey struct {
		id   string
		name string
		fee  float64
	}
	var cards []cardKey
	for cardRows.Next() {
		var k cardKey
		if err := cardRows.Scan(&k.id, &k.name, &k.fee); err != nil {
			return nil, err
		}
		cards = append(cards, k)
	}

	var out []model.CardValueSummary
	for _, k := range cards {
		s := model.CardValueSummary{CardID: k.id, CardName: k.name, AnnualFee: k.fee, Components: []model.CardValueComponent{}}
		compRows, err := r.db.Query(ctx, `
			SELECT component_type, annual_ev_cad, COALESCE(description,''), sort_order
			FROM card_value_components WHERE card_id = $1 ORDER BY sort_order
		`, k.id)
		if err != nil {
			return nil, err
		}
		for compRows.Next() {
			var c model.CardValueComponent
			if err := compRows.Scan(&c.ComponentType, &c.AnnualEVCAD, &c.Description, &c.SortOrder); err != nil {
				compRows.Close()
				return nil, err
			}
			s.Components = append(s.Components, c)
			s.TotalEVCAD += c.AnnualEVCAD
		}
		compRows.Close()
		s.NetEVCAD = s.TotalEVCAD - s.AnnualFee
		s.IsPositive = s.NetEVCAD >= 0
		out = append(out, s)
	}
	return out, nil
}
