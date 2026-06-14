package service

import (
	"context"
	"fmt"
	"math"
	"sort"

	"maplerewards/internal/model"
	"maplerewards/internal/repo"
)

// transferSweetSpotNote is the honesty disclaimer surfaced with every report:
// CPP here is a single program-level base value (not redemption-specific) and
// the transfer-partner table is sparse, so results are directional estimates.
const transferSweetSpotNote = "Directional estimates based on each program's base cents-per-point, not a specific award redemption. The transfer-partner table is sparse, so a higher-value transfer may exist that we don't yet track. Always confirm award availability before transferring — transfers are usually irreversible."

// Repo dependencies are interfaces (DI per .claude/rules/go-service.md).

type sweetSpotWalletRepo interface {
	GetUserBySession(ctx context.Context, sessionID string) (*model.User, error)
	GetUserCards(ctx context.Context, userID string) ([]model.UserCard, error)
}

type sweetSpotLoyaltyRepo interface {
	ListByUser(ctx context.Context, userID string) ([]model.LoyaltyAccount, error)
}

type sweetSpotProgramRepo interface {
	ListPrograms(ctx context.Context) ([]model.LoyaltyProgram, error)
}

type sweetSpotTransferRepo interface {
	GetTransferRoutes(ctx context.Context, fromProgramID string) ([]model.TransferPartner, error)
}

// sweetSpotBonusRepo reads the live transfer-bonus log (scraped by
// promo_sentinel into transfer_bonus_events). The sweet-spot engine consults it
// per route so a running "+30% MR → Aeroplan" promo flips the keep/transfer
// call instead of being stranded on a read-only list page.
type sweetSpotBonusRepo interface {
	ActiveBonusForRoute(ctx context.Context, fromSlug, toSlug string) (*repo.TransferBonusEvent, error)
}

// TransferSweetSpotService finds, for each program the user holds points in, the
// transfer-partner move that most increases value over keeping the points where
// they are — using each program's base CPP as the value yardstick.
type TransferSweetSpotService struct {
	wallet   sweetSpotWalletRepo
	loyalty  sweetSpotLoyaltyRepo
	program  sweetSpotProgramRepo
	transfer sweetSpotTransferRepo
	bonus    sweetSpotBonusRepo // optional — nil disables live-bonus surfacing
	userCPP  UserCPPLookup      // optional — nil disables per-user CPP overrides (AU-5)
}

func NewTransferSweetSpotService(
	wallet sweetSpotWalletRepo,
	loyalty sweetSpotLoyaltyRepo,
	program sweetSpotProgramRepo,
	transfer sweetSpotTransferRepo,
) *TransferSweetSpotService {
	return &TransferSweetSpotService{wallet: wallet, loyalty: loyalty, program: program, transfer: transfer}
}

// WithBonusRepo enables live transfer-bonus surfacing by wiring the
// transfer_bonus_events read path (scraped by promo_sentinel). Optional and
// additive — left unset, the engine prices on base ratios exactly as before.
// Returns the receiver so it can be chained at construction.
func (s *TransferSweetSpotService) WithBonusRepo(bonus sweetSpotBonusRepo) *TransferSweetSpotService {
	s.bonus = bonus
	return s
}

// WithUserCPP enables per-user CPP overrides (AU-5): keep/transfer value is
// priced on the wallet owner's own cents-per-point where they have set one, and
// the seeded program base otherwise. Optional and additive — left unset, the
// engine prices on base CPP exactly as before. Returns the receiver for chaining.
func (s *TransferSweetSpotService) WithUserCPP(lookup UserCPPLookup) *TransferSweetSpotService {
	s.userCPP = lookup
	return s
}

// progPoints accumulates a user's total points in one source program along with
// the program's identity and base CPP, so transfer math can run per program.
type progPoints struct {
	id      string
	slug    string
	name    string
	baseCPP float64
	points  int64
}

// Find builds the transfer sweet-spot report for the wallet behind sessionID.
func (s *TransferSweetSpotService) Find(ctx context.Context, sessionID string) (*model.TransferSweetSpotReport, error) {
	report := &model.TransferSweetSpotReport{Sources: []model.TransferSweetSpotSource{}, Note: transferSweetSpotNote}

	user, err := s.wallet.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("sweetspot: lookup user: %w", err)
	}
	if user == nil {
		return report, nil
	}

	// Program catalog lets us map loyalty_accounts (keyed by slug) onto the
	// canonical program id used by the transfer table, and is the source of
	// truth for base CPP + display name regardless of points origin.
	programs, err := s.program.ListPrograms(ctx)
	if err != nil {
		return nil, fmt.Errorf("sweetspot: list programs: %w", err)
	}
	bySlug := make(map[string]model.LoyaltyProgram, len(programs))
	for _, p := range programs {
		bySlug[p.Slug] = p
	}

	cards, err := s.wallet.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("sweetspot: load cards: %w", err)
	}
	accounts, err := s.loyalty.ListByUser(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("sweetspot: load loyalty accounts: %w", err)
	}

	// Aggregate points per program (keyed by canonical program id). Card point
	// balances map via Card.LoyaltyProgram; standalone loyalty_accounts map by
	// program_slug through the catalog.
	totals := make(map[string]*progPoints)
	addPoints := func(id, slug, name string, baseCPP float64, pts int64) {
		if id == "" || pts <= 0 {
			return
		}
		agg := totals[id]
		if agg == nil {
			agg = &progPoints{id: id, slug: slug, name: name, baseCPP: baseCPP}
			totals[id] = agg
		}
		agg.points += pts
	}

	for _, uc := range cards {
		if uc.Card == nil || uc.Card.LoyaltyProgram == nil {
			continue
		}
		lp := uc.Card.LoyaltyProgram
		addPoints(lp.ID, lp.Slug, lp.Name, lp.BaseCPP, uc.PointBalance)
	}
	for _, la := range accounts {
		p, ok := bySlug[la.ProgramSlug]
		if !ok {
			continue // program not in active catalog → can't price or transfer it
		}
		addPoints(p.ID, p.Slug, p.Name, p.BaseCPP, la.Balance)
	}

	// Evaluate transfer options for each source program with a positive balance.
	for _, agg := range totals {
		if agg.points <= 0 {
			continue
		}
		routes, rerr := s.transfer.GetTransferRoutes(ctx, agg.id)
		if rerr != nil {
			return nil, fmt.Errorf("sweetspot: transfer routes for %s: %w", agg.slug, rerr)
		}
		if len(routes) == 0 {
			continue // only include programs that HAVE at least one transfer partner
		}

		// Prefer the user's own CPP for the SOURCE program (AU-5); fall back to
		// the seeded base. Sweet-spot prices on the "base" segment yardstick.
		sourceCPP := agg.baseCPP
		if uc, ok := UserCPP(ctx, s.userCPP, user.ID, agg.slug, "base"); ok {
			sourceCPP = uc
		}
		keepValue := sweetSpotRound(float64(agg.points) * sourceCPP / 100)

		options := make([]model.TransferOption, 0, len(routes))
		for _, tp := range routes {
			if tp.ToProgram == nil {
				continue
			}
			dest := tp.ToProgram

			// Fold any live transfer bonus on THIS route into the effective
			// ratio. We read it from transfer_bonus_events (scraped, not
			// invented); when none is live the effective ratio equals the base
			// ratio and no bonus fields are set. A bonus-lookup failure is
			// non-fatal — the base-ratio sweet spot is still useful, so we
			// degrade gracefully rather than fail the whole report.
			effectiveRatio := tp.TransferRatio
			var bonusPercent float64
			var bonusLabel, bonusExpires string
			if s.bonus != nil {
				if ev, berr := s.bonus.ActiveBonusForRoute(ctx, agg.slug, dest.Slug); berr == nil && ev != nil && ev.BonusPercent > 0 {
					bonusPercent = ev.BonusPercent
					effectiveRatio = tp.TransferRatio * (1 + bonusPercent/100)
					if ev.ExpiresAt != nil {
						bonusExpires = ev.ExpiresAt.Format("2006-01-02")
						bonusLabel = fmt.Sprintf("BONUS LIVE: +%g%% through %s", bonusPercent, bonusExpires)
					} else {
						bonusLabel = fmt.Sprintf("BONUS LIVE: +%g%%", bonusPercent)
					}
				}
			}

			// Prefer the user's own CPP for the DESTINATION program (AU-5).
			destCPP := dest.BaseCPP
			if uc, ok := UserCPP(ctx, s.userCPP, user.ID, dest.Slug, "base"); ok {
				destCPP = uc
			}
			transferred := int64(math.Floor(float64(agg.points) * effectiveRatio))
			transferValue := sweetSpotRound(float64(transferred) * destCPP / 100)
			uplift := sweetSpotRound(transferValue - keepValue)
			eligible := agg.points >= int64(tp.MinimumTransfer)
			opt := model.TransferOption{
				ToProgramSlug:     dest.Slug,
				ToProgramName:     dest.Name,
				TransferRatio:     tp.TransferRatio,
				TransferredPoints: transferred,
				TransferValueCAD:  transferValue,
				UpliftCAD:         uplift,
				MinTransfer:       tp.MinimumTransfer,
				Eligible:          eligible,
			}
			if bonusPercent > 0 {
				opt.BonusPercent = bonusPercent
				opt.BonusLabel = bonusLabel
				opt.BonusExpiresAt = bonusExpires
				opt.EffectiveRatio = effectiveRatio
			}
			options = append(options, opt)
		}
		if len(options) == 0 {
			continue
		}

		// Rank by uplift desc; ties broken by destination name for determinism.
		sort.SliceStable(options, func(i, j int) bool {
			if options[i].UpliftCAD != options[j].UpliftCAD {
				return options[i].UpliftCAD > options[j].UpliftCAD
			}
			return options[i].ToProgramName < options[j].ToProgramName
		})

		// Best = highest positive uplift among eligible edges (a true sweet spot).
		var best *model.TransferOption
		for i := range options {
			if options[i].Eligible && options[i].UpliftCAD > 0 {
				o := options[i]
				best = &o
				break
			}
		}

		report.Sources = append(report.Sources, model.TransferSweetSpotSource{
			ProgramSlug:  agg.slug,
			ProgramName:  agg.name,
			Points:       agg.points,
			KeepValueCAD: keepValue,
			// Surface the CPP actually used to price keepValue, so a user-derived
			// override is reflected rather than a base value we didn't apply.
			BaseCPP:      sourceCPP,
			BestTransfer: best,
			AllTransfers: options,
		})
		if best != nil {
			report.TotalPotentialUpliftCAD += best.UpliftCAD
		}
	}

	// Stable output ordering: programs with a real sweet spot first (by uplift),
	// then the rest by points held.
	sort.SliceStable(report.Sources, func(i, j int) bool {
		bi, bj := report.Sources[i].BestTransfer, report.Sources[j].BestTransfer
		switch {
		case bi != nil && bj != nil:
			return bi.UpliftCAD > bj.UpliftCAD
		case bi != nil:
			return true
		case bj != nil:
			return false
		default:
			return report.Sources[i].Points > report.Sources[j].Points
		}
	})

	report.TotalPotentialUpliftCAD = sweetSpotRound(report.TotalPotentialUpliftCAD)
	return report, nil
}

func sweetSpotRound(v float64) float64 { return math.Round(v*100) / 100 }
