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

func (s *SQCService) Project(ctx context.Context, sessionID string) (*model.SQCProjection, error) {
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
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
	}
	for _, c := range cards {
		out.TotalSQCEarned += c.SQCEarned
	}

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

	return out, nil
}
