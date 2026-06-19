package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"maplerewards/internal/model"
)

// SQCRepository abstracts the SQC data access layer.
type SQCRepository interface {
	GetUserSQCContext(ctx context.Context, userID string, year int) ([]model.SQCCardContribution, []model.SQCTier, error)
}

// SQCService projects a user's Aeroplan elite-status under the 2026 SQC rules.
// SQC is earned across cobranded card spend (year-to-date) + flights/partners
// (out of scope for v1; we only model card-spend SQC since that's what we have).
type SQCService struct {
	walletRepo WalletRepository
	sqcRepo    SQCRepository
}

func NewSQCService(walletRepo WalletRepository, sqcRepo SQCRepository) *SQCService {
	return &SQCService{walletRepo: walletRepo, sqcRepo: sqcRepo}
}

// SQCFlightInputs carries the OPTIONAL self-reported flight figures. The zero
// value (both 0) reproduces the legacy card-spend-only projection exactly, so
// existing callers can pass an empty struct.
type SQCFlightInputs struct {
	FlightSQC      int     // SQC earned on flights/partners (not tracked by Maple)
	FlightSpendCAD float64 // flight revenue in CAD for the year
	TargetTier     string  // OPTIONAL status_level the user is targeting ("25K"|"35K"|"50K"|...); "" ⇒ no target recompute
}

func (s *SQCService) Project(ctx context.Context, sessionID string, flights SQCFlightInputs) (*model.SQCProjection, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	// pgx returns (nil, nil) for "no row matches" — without this guard a
	// deleted/unknown session panics the API process when dereferencing
	// user.ID below. Mirrors optimizer.go:88 / missed_rewards.go:73.
	if user == nil {
		return nil, ErrSessionNotFound
	}
	year := time.Now().Year()
	cards, tiers, err := s.sqcRepo.GetUserSQCContext(ctx, user.ID, year)
	if err != nil {
		return nil, err
	}

	out := &model.SQCProjection{
		Year:             year,
		Cards:            cards,
		Tiers:            tiers,
		WalletHasNoCards: len(cards) == 0,
		FlightSQC:        flights.FlightSQC,
		FlightSpendCAD:   flights.FlightSpendCAD,
	}
	for _, c := range cards {
		out.TotalSQCEarned += c.SQCEarned
	}
	// Flight SQC the user self-reports folds into the running total so the
	// current/next-tier math (below) reflects card + flight credits. With the
	// default flights.FlightSQC == 0 this is a no-op and the projection is
	// identical to the card-spend-only behaviour.
	out.TotalSQCEarned += flights.FlightSQC

	// Determine current and next tier. The current/next logic below assumes
	// tiers ascend by SQCRequired; GetUserSQCContext does not guarantee order
	// (docs/OPTIMIZER-CAP-AUDIT.md sibling lead). Sort defensively so the
	// projection is correct regardless of repo/query ordering. Sorting the
	// slice in place also fixes the order surfaced in out.Tiers.
	sort.SliceStable(tiers, func(i, j int) bool {
		return tiers[i].SQCRequired < tiers[j].SQCRequired
	})

	if len(tiers) > 0 {
		var currentTierRevFloor, nextTierRevFloor float64
		for _, t := range tiers {
			if out.TotalSQCEarned >= t.SQCRequired {
				out.CurrentTier = t.StatusLevel
				currentTierRevFloor = t.MinRevenueCAD
			} else if out.NextTier == "" {
				out.NextTier = t.StatusLevel
				out.SQCToNextTier = t.SQCRequired - out.TotalSQCEarned
				nextTierRevFloor = t.MinRevenueCAD
			}
		}
		// Aeroplan status requires BOTH the SQC threshold and a minimum
		// flight-revenue floor for most tiers. We only model SQC (card
		// spend), not flight revenue, so a tier shown as "cleared" is
		// cleared on SQC ALONE. Disclose this instead of silently implying
		// full qualification (previously the floor was ignored entirely).
		if currentTierRevFloor > 0 {
			out.RevenueFloorNote = fmt.Sprintf(
				"%s also requires ~$%.0f minimum flight revenue, which this projection does not track — SQC requirement shown only.",
				out.CurrentTier, currentTierRevFloor)
		} else if nextTierRevFloor > 0 {
			out.RevenueFloorNote = fmt.Sprintf(
				"%s also requires ~$%.0f minimum flight revenue in addition to the SQC shown.",
				out.NextTier, nextTierRevFloor)
		}

		// QualifiedTier: the TRUE tier — highest one where BOTH the SQC total
		// (card + flight) clears sqc_required AND reported flight revenue clears
		// min_revenue_cad. This can trail CurrentTier when the SQC is there but
		// the flight-revenue floor isn't. Tiers are already sorted ascending.
		for _, t := range tiers {
			if out.TotalSQCEarned >= t.SQCRequired && out.FlightSpendCAD >= t.MinRevenueCAD {
				out.QualifiedTier = t.StatusLevel
			}
		}

		// RevenueFloorCAD targets the next tier the user is climbing toward
		// (NextTier when present, else the current tier they've reached on SQC).
		out.RevenueFloorCAD = nextTierRevFloor
		if out.NextTier == "" {
			out.RevenueFloorCAD = currentTierRevFloor
		}
		out.RevenueFloorMet = out.FlightSpendCAD >= out.RevenueFloorCAD
		if !out.RevenueFloorMet {
			out.RevenueFloorGapCAD = out.RevenueFloorCAD - out.FlightSpendCAD
		}
	}

	// Compute "spend at best card rate" needed to clear the gap.
	if out.SQCToNextTier > 0 && len(cards) > 0 {
		// Best card = lowest dollars_per_sqc (fewest dollars per SQC point).
		bestRate := math.MaxInt32
		bestName := ""
		for _, c := range cards {
			if c.DollarsPerSQC > 0 && c.DollarsPerSQC < bestRate {
				bestRate = c.DollarsPerSQC
				bestName = c.CardName
			}
		}
		if bestRate > 0 && bestRate < math.MaxInt32 {
			out.SpendToNextTier = float64(out.SQCToNextTier * bestRate)
			out.BestCardForGap = bestName
		}
	}

	// ── Optional target-tier recompute. Independent of NextTier; lets the
	// Status tile project the gap toward a user-chosen tier (25K/35K/50K).
	// Unknown/blank target ⇒ no-op (fields stay zero, omitted via omitempty).
	if flights.TargetTier != "" {
		for _, t := range tiers {
			if t.StatusLevel != flights.TargetTier {
				continue
			}
			out.TargetTier = t.StatusLevel
			out.TargetSQCRequired = t.SQCRequired
			if out.TotalSQCEarned >= t.SQCRequired {
				out.TargetTierAlreadyMet = true
				break
			}
			out.SQCToTargetTier = t.SQCRequired - out.TotalSQCEarned
			if len(cards) > 0 {
				bestRate := math.MaxInt32
				bestName := ""
				for _, c := range cards {
					if c.DollarsPerSQC > 0 && c.DollarsPerSQC < bestRate {
						bestRate = c.DollarsPerSQC
						bestName = c.CardName
					}
				}
				if bestRate > 0 && bestRate < math.MaxInt32 {
					out.SpendToTargetTier = float64(out.SQCToTargetTier * bestRate)
					out.BestCardForTarget = bestName
				}
			}
			break
		}
	}

	return out, nil
}
