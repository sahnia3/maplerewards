package repo

import (
	"context"
	"fmt"
	"math"

	"github.com/jackc/pgx/v5/pgxpool"
	"maplerewards/internal/model"
)

// defaultUnverifiedAnnualCapCAD bounds an accelerated bonus category that has
// no published cap, mirroring the optimizer's guardrail of the same value so
// the card-value EV can't over-project unbounded accelerated earn.
const defaultUnverifiedAnnualCapCAD = 20000.0

type CardValueRepo struct {
	db *pgxpool.Pool
}

func NewCardValueRepo(db *pgxpool.Pool) *CardValueRepo { return &CardValueRepo{db: db} }

// cappedRateUnits returns rate-weighted spend (spend×rate) blended against an
// annual-equivalent cap: spend up to the cap earns the bonus rate, the
// remainder earns the fallback rate. annualCap<=0 means uncapped. Mirrors the
// optimizer's calculateBlendedRate. Caller applies the cpp/100 or /100 factor.
func cappedRateUnits(spend, bonusRate, fallbackRate, annualCap float64) float64 {
	if annualCap <= 0 || spend <= annualCap {
		return spend * bonusRate
	}
	return annualCap*bonusRate + (spend-annualCap)*fallbackRate
}

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

	if len(cards) == 0 {
		return nil, nil
	}

	// Bulk lookups — 3 constant ANY($1) queries instead of 3 per card
	// (MR-006 N+1). The per-card EV math below is untouched; the loop just
	// indexes into these maps instead of re-querying.
	ids := make([]string, len(cards))
	for i, k := range cards {
		ids[i] = k.id
	}

	compsByCard := map[string][]model.CardValueComponent{}
	{
		rows, err := r.db.Query(ctx, `
			SELECT card_id, component_type, annual_ev_cad, COALESCE(description,''), sort_order
			FROM card_value_components WHERE card_id = ANY($1) ORDER BY card_id, sort_order
		`, ids)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var cardID string
			var c model.CardValueComponent
			if err := rows.Scan(&cardID, &c.ComponentType, &c.AnnualEVCAD, &c.Description, &c.SortOrder); err != nil {
				rows.Close()
				return nil, err
			}
			compsByCard[cardID] = append(compsByCard[cardID], c)
		}
		rowsErr := rows.Err()
		rows.Close()
		if rowsErr != nil {
			return nil, fmt.Errorf("card-value components: %w", rowsErr)
		}
	}

	type baseInfo struct {
		cpp        float64
		globalType string
	}
	baseByCard := map[string]baseInfo{}
	{
		rows, err := r.db.Query(ctx, `
			SELECT c.id, COALESCE(lp.base_cpp, 1.0),
			       COALESCE((SELECT cm.earn_type FROM card_multipliers cm
			                 JOIN categories cat ON cat.id = cm.category_id
			                 WHERE cm.card_id = c.id AND cat.slug = 'everything-else'
			                   AND cm.effective_to IS NULL LIMIT 1), 'points')
			FROM cards c
			JOIN loyalty_programs lp ON lp.id = c.loyalty_program_id
			WHERE c.id = ANY($1)
		`, ids)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var id string
			var bi baseInfo
			if err := rows.Scan(&id, &bi.cpp, &bi.globalType); err != nil {
				rows.Close()
				return nil, err
			}
			baseByCard[id] = bi
		}
		rowsErr := rows.Err()
		rows.Close()
		if rowsErr != nil {
			return nil, fmt.Errorf("card-value base cpp: %w", rowsErr)
		}
	}

	type multRow struct {
		rate, fallback, annualCap float64
		earnType                  string
	}
	multsByCard := map[string]map[string]multRow{}
	{
		rows, err := r.db.Query(ctx, `
			SELECT cm.card_id, cat.slug, cm.earn_rate, cm.earn_type,
			       COALESCE(cm.fallback_earn_rate, 1.0), cm.cap_amount, cm.cap_period
			FROM card_multipliers cm
			JOIN categories cat ON cat.id = cm.category_id
			WHERE cm.card_id = ANY($1) AND cm.effective_to IS NULL
		`, ids)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var cardID, slug, et string
			var rate, fallback float64
			var capAmount *float64
			var capPeriod *string
			if err := rows.Scan(&cardID, &slug, &rate, &et, &fallback, &capAmount, &capPeriod); err != nil {
				rows.Close()
				return nil, err
			}
			annualCap := 0.0
			if capAmount != nil && *capAmount > 0 {
				annualCap = *capAmount
				if capPeriod != nil && *capPeriod == "monthly" {
					annualCap *= 12
				}
			}
			if multsByCard[cardID] == nil {
				multsByCard[cardID] = map[string]multRow{}
			}
			multsByCard[cardID][slug] = multRow{rate: rate, fallback: fallback, annualCap: annualCap, earnType: et}
		}
		rowsErr := rows.Err()
		rows.Close()
		if rowsErr != nil {
			return nil, fmt.Errorf("card-value multipliers: %w", rowsErr)
		}
	}

	var out []model.CardValueSummary
	for _, k := range cards {
		s := model.CardValueSummary{CardID: k.id, CardName: k.name, AnnualFee: k.fee, Components: []model.CardValueComponent{}}
		for _, c := range compsByCard[k.id] {
			s.Components = append(s.Components, c)
			s.TotalEVCAD += c.AnnualEVCAD
		}

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
			// Missing-id fallback mirrors the old per-card QueryRow error path:
			// default values, no error.
			bi, ok := baseByCard[k.id]
			if !ok {
				bi = baseInfo{cpp: 1.0, globalType: "points"}
			}
			baseCPP, globalType := bi.cpp, bi.globalType

			rateBySlug := map[string]float64{}
			typeBySlug := map[string]string{}
			fallbackBySlug := map[string]float64{}
			capBySlug := map[string]float64{} // annual-equivalent cap in CAD spend; 0 = none
			for slug, m := range multsByCard[k.id] {
				rateBySlug[slug] = m.rate
				typeBySlug[slug] = m.earnType
				fallbackBySlug[slug] = m.fallback
				capBySlug[slug] = m.annualCap
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
				fallback := fallbackBySlug[slug]
				if fallback <= 0 {
					fallback = 1.0
				}
				// Cap-bound the bonus so a lumpy annualised spend can't project
				// an accelerated rate on the full amount (the over-projection
				// the optimizer was remediated to prevent). Published per-mult
				// caps apply directly; an explicit bonus category with no cap is
				// bounded by the same default guardrail the optimizer uses. The
				// card's flat base/everything-else rate is never capped here.
				annualCap := capBySlug[slug]
				if annualCap <= 0 && ok && slug != "everything-else" && rate > fallback {
					annualCap = defaultUnverifiedAnnualCapCAD
				}
				units := cappedRateUnits(spend, rate, fallback, annualCap)
				if et == "cashback_pct" {
					ev += units / 100
				} else {
					ev += units * baseCPP / 100
				}
			}
			ev = math.Round(ev*100) / 100 // round to cents

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
