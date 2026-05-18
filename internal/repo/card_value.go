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

		// P0.4 (docs/LAUNCH-ISSUES.md): only 6/104 cards have hand-curated
		// card_value_components, so 98 cards rendered a misleading
		// "$0–$0 modeled on insurance + lounge + multipliers + credits".
		// When no curated components exist, surface a real, trusted baseline
		// instead of $0: the card's base (everything-else) earn rate × program
		// CPP over a transparent, conservative standard annual spend. Uses only
		// already-verified multiplier/CPP data — no fabricated insurance/lounge
		// values. Hand-curated component backfill for the remaining cards is a
		// tracked follow-up; this stops the page from looking broken.
		if len(s.Components) == 0 {
			const stdAnnualSpend = 24000.0 // ~$2,000/mo typical everyday spend
			var earnRate, baseCPP float64
			var earnType string
			qerr := r.db.QueryRow(ctx, `
				SELECT COALESCE(cm.earn_rate, 1.0),
				       COALESCE(cm.earn_type, 'points'),
				       COALESCE(lp.base_cpp, 1.0)
				FROM cards c
				JOIN loyalty_programs lp ON lp.id = c.loyalty_program_id
				LEFT JOIN categories cat ON cat.slug = 'everything-else'
				LEFT JOIN card_multipliers cm
				       ON cm.card_id = c.id AND cm.category_id = cat.id
				      AND cm.effective_to IS NULL
				WHERE c.id = $1
				LIMIT 1
			`, k.id).Scan(&earnRate, &earnType, &baseCPP)
			if qerr == nil {
				var ev float64
				if earnType == "cashback_pct" {
					ev = stdAnnualSpend * earnRate / 100
				} else {
					ev = stdAnnualSpend * earnRate * (baseCPP / 100)
				}
				ev = float64(int(ev*100+0.5)) / 100 // round to cents
				s.Components = append(s.Components, model.CardValueComponent{
					ComponentType: "multiplier",
					AnnualEVCAD:   ev,
					Description:   "Estimated base rewards on ~$24,000/yr typical spend (insurance/lounge/credits not yet modelled for this card)",
					SortOrder:     0,
				})
				s.TotalEVCAD += ev
			}
		}

		s.NetEVCAD = s.TotalEVCAD - s.AnnualFee
		s.IsPositive = s.NetEVCAD >= 0
		out = append(out, s)
	}
	return out, nil
}
