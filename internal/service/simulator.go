package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strings"

	"maplerewards/internal/model"
)

// Repo dependencies are interfaces (DI per .claude/rules/go-service.md).
type simulatorWalletRepo interface {
	GetUserBySession(ctx context.Context, sessionID string) (*model.User, error)
	GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error)
}

type simulatorSpendRepo interface {
	GetSpendStats(ctx context.Context, userID string) (*model.SpendStats, error)
}

type simulatorCardRepo interface {
	GetCard(ctx context.Context, id string) (*model.Card, error)
	ListCategories(ctx context.Context) ([]model.Category, error)
	ListPrograms(ctx context.Context) ([]model.LoyaltyProgram, error)
	// ListMultipliersForCard returns a card's full active multiplier set in ONE
	// query, so a request scores every (card × category) pair from memory with
	// zero per-pair DB round-trips.
	ListMultipliersForCard(ctx context.Context, cardID string) ([]model.MultiplierRow, error)
}

// simulatorMaxCards bounds each of the add / drop arrays. Keeps the per-category
// scan (cards × categories × multiplier lookups) cheap and rejects a payload
// that tries to score the entire catalog.
const simulatorMaxCards = 10

// ErrSimulatorTooManyCards is returned when an add/drop array exceeds the bound.
var ErrSimulatorTooManyCards = fmt.Errorf("at most %d cards may be added or dropped per simulation", simulatorMaxCards)

// simulatorNote is stamped on every result so the UI can be honest about the
// model: it values logged spend at each card's category rate and deliberately
// ignores monthly caps, so a capped accelerator may read slightly high.
const simulatorNote = "Estimate based on your logged spend, valued at each card's category earn rate. Monthly category caps are ignored, so a capped accelerator card may read slightly high."

// SimulatorService computes the net annual-value impact of adding and/or
// dropping cards: it re-prices the user's logged spend (by category) against
// the best-earning card in the baseline wallet vs. a hypothetical wallet, and
// nets the change in annual fees. Read-only over the wallet, spend history, and
// the card catalog.
type SimulatorService struct {
	wallet  simulatorWalletRepo
	spend   simulatorSpendRepo
	card    simulatorCardRepo
	userCPP UserCPPLookup // optional — nil disables per-user CPP overrides (AU-5)
}

func NewSimulatorService(wallet simulatorWalletRepo, spend simulatorSpendRepo, card simulatorCardRepo) *SimulatorService {
	return &SimulatorService{wallet: wallet, spend: spend, card: card}
}

// WithUserCPP enables per-user CPP overrides (AU-5): the points → dollars
// conversion uses the wallet owner's own cents-per-point where they have set
// one, and the seeded program base otherwise. Optional and additive — left
// unset, pricing is unchanged. Returns the receiver for chaining.
func (s *SimulatorService) WithUserCPP(lookup UserCPPLookup) *SimulatorService {
	s.userCPP = lookup
	return s
}

// scoredCategory is the best card + dollar value for one spend category under a
// given card set, used to diff baseline against simulated.
type scoredCategory struct {
	cardName string
	value    float64
}

// Simulate prices the user's logged spend against the baseline wallet and the
// wallet after applying addIDs / dropIDs, and returns the value, fee, and
// per-category deltas.
func (s *SimulatorService) Simulate(ctx context.Context, sessionID string, addIDs, dropIDs []string) (*model.SimulationResult, error) {
	out := &model.SimulationResult{
		Added:              []model.SimulatorCardRef{},
		Dropped:            []model.SimulatorCardRef{},
		CategoryChanges:    []model.SimulatorCategoryChange{},
		IgnoredAlreadyHeld: []string{},
		IgnoredNotHeld:     []string{},
		Note:               simulatorNote,
	}

	// De-dupe + reject blank/garbage ids up front, then bound the arrays.
	addIDs = cleanIDs(addIDs)
	dropIDs = cleanIDs(dropIDs)
	if len(addIDs) > simulatorMaxCards || len(dropIDs) > simulatorMaxCards {
		return nil, ErrSimulatorTooManyCards
	}

	user, err := s.wallet.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("simulator: lookup user: %w", err)
	}
	if user == nil {
		return out, nil
	}

	held, err := s.wallet.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("simulator: load held cards: %w", err)
	}
	stats, err := s.spend.GetSpendStats(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("simulator: load spend: %w", err)
	}
	programs, err := s.card.ListPrograms(ctx)
	if err != nil {
		return nil, fmt.Errorf("simulator: load programs: %w", err)
	}
	categories, err := s.card.ListCategories(ctx)
	if err != nil {
		return nil, fmt.Errorf("simulator: load categories: %w", err)
	}

	// program_id → cpp (cents per point). Source of truth for the points →
	// dollars conversion, mirroring portfolio/churn. AU-5: prefer the user's own
	// CPP for a program (keyed by slug) over the seeded base where they've set
	// one, so the simulation values logged spend on the number they believe.
	cppByProgram := make(map[string]float64, len(programs))
	for _, p := range programs {
		cpp := p.BaseCPP
		if uc, ok := UserCPP(ctx, s.userCPP, user.ID, p.Slug, "base"); ok {
			cpp = uc
		}
		cppByProgram[p.ID] = cpp
	}
	// category_name → category (we need the ID to look up multipliers; spend
	// stats only carry the name). Mirrors how portfolio.computeDollarGap maps
	// categories. Case-insensitive to be resilient to display-name casing.
	catByName := make(map[string]model.Category, len(categories))
	for _, c := range categories {
		catByName[strings.ToLower(c.Name)] = c
	}

	// cardID → *Card for everything we may score: held cards (Card already
	// loaded) plus added candidates (loaded + validated via GetCard).
	cardByID := make(map[string]*model.Card)
	heldIDs := make(map[string]bool, len(held))
	for _, uc := range held {
		if uc.Card == nil {
			continue
		}
		heldIDs[uc.CardID] = true
		cardByID[uc.CardID] = uc.Card
	}

	// Validate + resolve adds. Existing-but-already-held → flagged no-op.
	// Unknown / inactive → hard error (the client sent a bad id).
	addedSet := make(map[string]bool)
	for _, id := range addIDs {
		c, err := s.card.GetCard(ctx, id)
		if err != nil || c == nil {
			return nil, fmt.Errorf("simulator: add card %q: %w", id, errOrNotFound(err))
		}
		if !c.IsActive {
			return nil, fmt.Errorf("simulator: add card %q is not active", id)
		}
		if heldIDs[c.ID] || addedSet[c.ID] {
			out.IgnoredAlreadyHeld = append(out.IgnoredAlreadyHeld, c.ID)
			continue
		}
		addedSet[c.ID] = true
		cardByID[c.ID] = c
		out.Added = append(out.Added, model.SimulatorCardRef{
			CardID: c.ID, CardName: c.Name, AnnualFee: simRound(c.AnnualFee),
		})
	}

	// Validate + resolve drops. Not-held → flagged no-op. Unknown id → hard
	// error so a typo doesn't silently price nothing.
	droppedSet := make(map[string]bool)
	for _, id := range dropIDs {
		if !heldIDs[id] {
			// Confirm the id is at least a real card before flagging; an
			// unknown id is a client error, a known-but-not-held id is a no-op.
			c, err := s.card.GetCard(ctx, id)
			if err != nil || c == nil {
				return nil, fmt.Errorf("simulator: drop card %q: %w", id, errOrNotFound(err))
			}
			out.IgnoredNotHeld = append(out.IgnoredNotHeld, c.ID)
			continue
		}
		if droppedSet[id] {
			continue
		}
		droppedSet[id] = true
		c := cardByID[id]
		out.Dropped = append(out.Dropped, model.SimulatorCardRef{
			CardID: c.ID, CardName: c.Name, AnnualFee: simRound(c.AnnualFee),
		})
	}

	// Baseline card set = everything held today. Simulated = held − dropped +
	// added.
	baselineIDs := make([]string, 0, len(heldIDs))
	for id := range heldIDs {
		baselineIDs = append(baselineIDs, id)
	}
	simulatedIDs := make([]string, 0, len(heldIDs)+len(addedSet))
	for id := range heldIDs {
		if !droppedSet[id] {
			simulatedIDs = append(simulatedIDs, id)
		}
	}
	for id := range addedSet {
		simulatedIDs = append(simulatedIDs, id)
	}

	// Load each involved card's FULL multiplier set ONCE (one query per card
	// instead of two per card × category), so the per-category scan below does
	// zero DB work. A real DB error here is propagated — never silently $0.
	rateTables, err := buildRateTables(ctx, s.card, cardByID, cppByProgram)
	if err != nil {
		return nil, fmt.Errorf("simulator: load multipliers: %w", err)
	}

	// Price every spend category against both sets and accumulate the deltas.
	var baselineTotal, simulatedTotal float64
	if stats != nil {
		for _, cs := range stats.ByCategory {
			annualSpend := cs.TotalSpend
			if annualSpend <= 0 {
				continue
			}
			// Resolve the spend category to its catalog slug once; "" (unknown
			// category) makes every card fall back to everything-else.
			catSlug := ""
			if cat, ok := catByName[strings.ToLower(cs.CategoryName)]; ok {
				catSlug = cat.Slug
			}

			base := bestForCategory(baselineIDs, rateTables, catSlug, annualSpend)
			sim := bestForCategory(simulatedIDs, rateTables, catSlug, annualSpend)

			baselineTotal += base.value
			simulatedTotal += sim.value

			if base.cardName != sim.cardName || math.Abs(sim.value-base.value) > 0.005 {
				out.CategoryChanges = append(out.CategoryChanges, model.SimulatorCategoryChange{
					CategoryName: cs.CategoryName,
					AnnualSpend:  simRound(annualSpend),
					BeforeCard:   base.cardName,
					BeforeValue:  simRound(base.value),
					AfterCard:    sim.cardName,
					AfterValue:   simRound(sim.value),
					DeltaCAD:     simRound(sim.value - base.value),
				})
			}
		}
	}

	// Biggest swing first so the UI leads with the categories that moved most.
	sort.SliceStable(out.CategoryChanges, func(i, j int) bool {
		return out.CategoryChanges[i].DeltaCAD > out.CategoryChanges[j].DeltaCAD
	})

	var addedFees, droppedFees float64
	for _, a := range out.Added {
		addedFees += a.AnnualFee
	}
	for _, d := range out.Dropped {
		droppedFees += d.AnnualFee
	}

	valueDelta := simulatedTotal - baselineTotal
	feeDelta := addedFees - droppedFees

	out.BaselineAnnualValue = simRound(baselineTotal)
	out.SimulatedAnnualValue = simRound(simulatedTotal)
	out.ValueDeltaCAD = simRound(valueDelta)
	out.FeeDeltaCAD = simRound(feeDelta)
	out.NetDeltaAfterFeesCAD = simRound(valueDelta - feeDelta)
	return out, nil
}

// bestForCategory returns the highest-earning card (by annual dollar value) in
// the given set for one category's annual spend, scoring from the pre-loaded
// rate tables (zero DB calls). Caps are intentionally not applied — this is a
// hypothetical estimate (see simulatorNote).
func bestForCategory(
	cardIDs []string,
	rateTables map[string]*cardRateTable,
	categorySlug string,
	annualSpend float64,
) scoredCategory {
	best := scoredCategory{cardName: "—", value: 0}
	for _, id := range cardIDs {
		t := rateTables[id]
		if t == nil {
			continue
		}
		val := annualSpend * t.effectiveReturn(categorySlug)
		if val > best.value {
			best = scoredCategory{cardName: t.name, value: val}
		}
	}
	return best
}

// cleanIDs trims, drops blanks, and de-duplicates a list of card ids while
// preserving first-seen order.
func cleanIDs(ids []string) []string {
	seen := make(map[string]bool, len(ids))
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}

// errOrNotFound returns err when non-nil, else a generic not-found error so a
// nil card (GetCard returning (nil,nil) is not expected, but be safe) still
// surfaces as a client error.
func errOrNotFound(err error) error {
	if err != nil {
		return err
	}
	return fmt.Errorf("card not found")
}

func simRound(v float64) float64 { return math.Round(v*100) / 100 }
