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

// standardAnnualSpend is a transparent, conservative Canadian household
// distribution (~$24k/yr) used ONLY when the user has not logged enough real
// spend. Keyed by category slug so it lines up with card_multipliers. The
// total and the split are deliberately modest so an un-personalised estimate
// never over-promises.
var standardAnnualSpend = map[string]float64{
	"groceries":         6000,
	"dining":            3600,
	"gas-transit":       2400,
	"travel":            2400,
	"recurring-bills":   3000,
	"online-shopping":   2400,
	"streaming-digital":  600,
	"pharmacy":          1200,
	"entertainment":     1200,
	"everything-else":   1200,
}

// annualSpendByCategory returns the user's logged spend per category slug,
// annualised (scaled by 12 / distinct-months-logged so a 3-month logger isn't
// undercounted 4×). The bool is true only when the user has logged a
// non-trivial amount — otherwise callers fall back to standardAnnualSpend.
func (r *CardValueRepo) annualSpendByCategory(ctx context.Context, userID string) (map[string]float64, bool) {
	rows, err := r.db.Query(ctx, `
		SELECT cat.slug,
		       COALESCE(SUM(ums.total_spend), 0)                  AS spend,
		       GREATEST(COUNT(DISTINCT ums.month), 1)             AS months
		FROM user_monthly_spend ums
		JOIN categories cat ON cat.id = ums.category_id
		WHERE ums.user_id = $1
		  AND ums.month >= (CURRENT_DATE - INTERVAL '12 months')
		GROUP BY cat.slug
	`, userID)
	if err != nil {
		return nil, false
	}
	defer rows.Close()
	out := map[string]float64{}
	var total float64
	for rows.Next() {
		var slug string
		var spend float64
		var months int
		if err := rows.Scan(&slug, &spend, &months); err != nil {
			return nil, false
		}
		if months < 1 {
			months = 1
		}
		annual := spend * 12.0 / float64(months)
		out[slug] = annual
		total += annual
	}
	// < $1,000/yr logged is treated as "not enough signal" — use the
	// transparent standard basket instead of a misleading near-zero.
	return out, total >= 1000
}

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

	// Spend basket for the earning-power estimate: real logged spend
	// (annualised) if the user has enough signal, else the transparent
	// standard Canadian basket. Computed once, reused for every card.
	spendBasket, realSpend := r.annualSpendByCategory(ctx, userID)
	if !realSpend {
		spendBasket = standardAnnualSpend
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

		// Earning value was MISSING for EVERY card: the 98 uncurated cards
		// had no components at all, and the 6 curated cards carry only perk
		// components (insurance/lounge/credit_bundle/concierge/fx_savings) —
		// never an earning row. So Amex Cobalt showed just its $150 insurance
		// and none of its ~$1k/yr 5x-category earning → the founder-reported
		// under-valuation. Fix: ALWAYS add a category-aware earning component
		// (the card's real per-category multipliers × the user's logged spend
		// annualised, or a transparent standard basket) ON TOP of any curated
		// perks. Skip only if a multiplier component already exists so we
		// never double-count.
		hasEarnComponent := false
		for _, c := range s.Components {
			if c.ComponentType == "multiplier" {
				hasEarnComponent = true
				break
			}
		}
		if !hasEarnComponent {
			var baseCPP float64
			var globalType string
			if err := r.db.QueryRow(ctx, `
				SELECT COALESCE(lp.base_cpp, 1.0),
				       COALESCE((SELECT cm.earn_type FROM card_multipliers cm
				                 JOIN categories cat ON cat.id = cm.category_id
				                 WHERE cm.card_id = c.id AND cat.slug = 'everything-else'
				                   AND cm.effective_to IS NULL LIMIT 1), 'points')
				FROM cards c
				JOIN loyalty_programs lp ON lp.id = c.loyalty_program_id
				WHERE c.id = $1
			`, k.id).Scan(&baseCPP, &globalType); err != nil {
				baseCPP, globalType = 1.0, "points"
			}

			rateBySlug := map[string]float64{}
			typeBySlug := map[string]string{}
			if mrows, err := r.db.Query(ctx, `
				SELECT cat.slug, cm.earn_rate, cm.earn_type
				FROM card_multipliers cm
				JOIN categories cat ON cat.id = cm.category_id
				WHERE cm.card_id = $1 AND cm.effective_to IS NULL
			`, k.id); err == nil {
				for mrows.Next() {
					var slug, et string
					var rate float64
					if err := mrows.Scan(&slug, &rate, &et); err == nil {
						rateBySlug[slug] = rate
						typeBySlug[slug] = et
					}
				}
				mrows.Close()
			}
			baseRate := rateBySlug["everything-else"]
			if baseRate == 0 {
				baseRate = 1.0
			}

			var ev float64
			for slug, spend := range spendBasket {
				rate, ok := rateBySlug[slug]
				if !ok {
					rate = baseRate // category not boosted → card's base rate
				}
				et := typeBySlug[slug]
				if et == "" {
					et = globalType
				}
				if et == "cashback_pct" {
					ev += spend * rate / 100
				} else {
					ev += spend * rate * (baseCPP / 100)
				}
			}
			ev = float64(int(ev*100+0.5)) / 100 // round to cents

			basis := "a transparent standard ~$24k/yr Canadian basket"
			if realSpend {
				basis = "your logged spend (annualised)"
			}
			s.Components = append(s.Components, model.CardValueComponent{
				ComponentType: "multiplier",
				AnnualEVCAD:   ev,
				Description:   "Estimated category rewards on " + basis + " — insurance/lounge/credits not yet modelled for this card",
				SortOrder:     0,
			})
			s.TotalEVCAD += ev
		}

		s.NetEVCAD = s.TotalEVCAD - s.AnnualFee
		s.IsPositive = s.NetEVCAD >= 0
		out = append(out, s)
	}
	return out, nil
}
