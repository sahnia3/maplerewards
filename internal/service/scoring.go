package service

import (
	"context"

	"maplerewards/internal/model"
)

// scoringCardRepo is the minimal card-repo surface the batched scorer needs.
// Both simulatorCardRepo and householdCardRepo satisfy it, so the shared helper
// can load every card's full multiplier set in ONE query per card instead of a
// per-(card, category) round-trip.
type scoringCardRepo interface {
	ListMultipliersForCard(ctx context.Context, cardID string) ([]model.MultiplierRow, error)
}

// everythingElseSlug is the catch-all category slug. A card with no
// category-specific multiplier for a spend category earns at this rate.
const everythingElseSlug = "everything-else"

// cardRateTable holds one card's pre-loaded scoring inputs: every category
// multiplier keyed by category slug, the card's everything-else fallback, and
// the program cpp (cents per point) used for the points → dollars conversion.
// Built ONCE per card per request so the inner (card × category) loop does zero
// DB work.
type cardRateTable struct {
	name           string // card display name, for naming the winner per category
	bySlug         map[string]model.MultiplierRow
	everythingElse model.MultiplierRow // always populated (1x points absolute fallback)
	cpp            float64
}

// buildRateTables loads the full multiplier set for each distinct card ONCE and
// returns a table keyed by card id, ready for in-memory scoring. cppByProgram is
// the program_id → base_cpp map the caller already assembled from ListPrograms;
// a card whose program is missing there falls back to the program embedded on
// the card (mirrors the previous per-card cpp resolution exactly).
//
// A real DB error from any card's multiplier load is propagated — scoring must
// never silently treat a card as $0, which would corrupt best-card selection
// (simulator) or wrongly flag a card as redundant (household).
func buildRateTables(
	ctx context.Context,
	repo scoringCardRepo,
	cards map[string]*model.Card,
	cppByProgram map[string]float64,
) (map[string]*cardRateTable, error) {
	tables := make(map[string]*cardRateTable, len(cards))
	for id, c := range cards {
		if c == nil {
			continue
		}
		rows, err := repo.ListMultipliersForCard(ctx, id)
		if err != nil {
			return nil, err
		}

		t := &cardRateTable{
			name:   c.Name,
			bySlug: make(map[string]model.MultiplierRow, len(rows)),
			// Absolute fallback matches GetEverythingElseMultiplier: a card with
			// no everything-else row still earns 1x points.
			everythingElse: model.MultiplierRow{EarnRate: 1.0, EarnType: "points"},
		}
		for i := range rows {
			t.bySlug[rows[i].CategorySlug] = rows[i]
			if rows[i].CategorySlug == everythingElseSlug {
				t.everythingElse = rows[i]
			}
		}

		cpp := cppByProgram[c.LoyaltyProgramID]
		if cpp == 0 && c.LoyaltyProgram != nil {
			// Fall back to the program embedded on the card if it wasn't in the
			// ListPrograms map (e.g. a freshly-added program).
			cpp = c.LoyaltyProgram.BaseCPP
		}
		t.cpp = cpp

		tables[id] = t
	}
	return tables, nil
}

// effectiveReturn is a card's decimal return rate for a category (e.g. 0.04 =
// 4%). It is the single scoring helper shared by the simulator and household
// services. Cashback uses the percentage directly; points/miles/dollars convert
// the earn rate through the program's base_cpp. Falls back to the card's
// everything-else rate when no category-specific multiplier exists. categorySlug
// is "" when the spend category isn't in the catalog → everything-else applies.
func (t *cardRateTable) effectiveReturn(categorySlug string) float64 {
	mult, ok := t.bySlug[categorySlug]
	if categorySlug == "" || !ok {
		mult = t.everythingElse
	}
	if mult.EarnType == "cashback_pct" {
		return mult.EarnRate / 100
	}
	// points / miles / dollars: earn_rate × base_cpp / 100.
	return mult.EarnRate * t.cpp / 100
}
