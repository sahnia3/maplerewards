package service

import (
	"context"
	"fmt"
	"sort"
	"time"

	"maplerewards/internal/model"
)

// OptimizerForMissed is the subset of OptimizerService used by MissedRewardsService.
// Defined as an interface for testability (mock in unit tests).
type OptimizerForMissed interface {
	GetBestCard(ctx context.Context, req model.OptimizeRequest) ([]model.CardRecommendation, error)
}

// MissedRewardsService computes "you should have used card X instead of Y" gaps
// against the user's CURRENT wallet snapshot. Historical wallet state is not
// preserved, so the report assumes the user held all current cards at spend time.
// This is disclosed in the response (WalletSnapshot field) so the UI can caveat.
type MissedRewardsService struct {
	walletRepo WalletRepository
	spendRepo  SpendRepository
	optimizer  OptimizerForMissed
}

func NewMissedRewardsService(
	walletRepo WalletRepository,
	spendRepo SpendRepository,
	optimizer OptimizerForMissed,
) *MissedRewardsService {
	return &MissedRewardsService{
		walletRepo: walletRepo,
		spendRepo:  spendRepo,
		optimizer:  optimizer,
	}
}

// ComputeMissedRewards re-ranks each spend entry against the current wallet,
// using the optimizer (which considers cap blending, transfer partners, MCC fallback).
// sinceDays bounds how far back to look (0 → defaults to 180 days).
// topN bounds the per-entry list returned in TopMissed (0 → 10).
//
// The scan is hard-capped to maxEntries to prevent O(N) optimizer fan-out on
// large histories. The optimizer call per entry is the hot path; a CSV-imported
// 5K-entry wallet was previously triggering 5K optimizer passes per request.
func (s *MissedRewardsService) ComputeMissedRewards(
	ctx context.Context,
	sessionID string,
	sinceDays int,
	topN int,
) (*model.MissedRewardsReport, error) {
	if topN <= 0 {
		topN = 10
	}
	// Bound the lookback even when caller passes 0 ("all"). Without this, a
	// long-tenured user's full history blows up the optimizer fan-out below.
	if sinceDays <= 0 {
		sinceDays = 180
	}
	const maxEntries = 1000

	// Verify session.
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, fmt.Errorf("session not found: %w", err)
	}
	// GetUserBySession returns (nil,nil) for an unknown/scrubbed session.
	// The digest worker calls this directly with stored session IDs; if a
	// recipient's row was hard-deleted between the recipient query and here,
	// dereferencing user.ID below would panic and kill the whole sweep.
	if user == nil {
		return nil, nil
	}

	// Pull spend history (paginated). Break early once we hit maxEntries —
	// repo returns rows ordered most-recent-first, so the cap keeps the
	// freshest behaviour.
	const pageSize = 500
	// Window floor first: entries come back most-recent-first (spent_at DESC),
	// so collect only rows within the since-days window and stop as soon as a
	// page drops below the floor. Applying the maxEntries cap to in-window rows
	// (rather than capping raw rows and then filtering) means a heavy logger
	// with >maxEntries lifetime entries no longer has in-window history
	// silently dropped behind a wall of older rows.
	floor := time.Now().AddDate(0, 0, -sinceDays).Format("2006-01-02")
	sinceISO := floor
	var allEntries []model.SpendEntry
scanLoop:
	for offset := 0; ; offset += pageSize {
		batch, err := s.spendRepo.ListSpendEntries(ctx, user.ID, pageSize, offset)
		if err != nil {
			return nil, fmt.Errorf("listing spend entries: %w", err)
		}
		if len(batch) == 0 {
			break
		}
		for _, e := range batch {
			if e.SpentAt < floor {
				break scanLoop // all remaining rows are older (DESC order)
			}
			allEntries = append(allEntries, e)
			if len(allEntries) >= maxEntries {
				break scanLoop
			}
		}
		if len(batch) < pageSize {
			break
		}
	}

	report := &model.MissedRewardsReport{
		Since:          sinceISO,
		WalletSnapshot: "current",
		ByCategory:     []model.CategoryMissed{},
		TopMissed:      []model.MissedRewardEntry{},
	}
	if len(allEntries) == 0 {
		return report, nil
	}

	// Aggregate per category as we go to avoid two passes.
	type catAgg struct {
		slug         string
		name         string
		spend        float64
		actualValue  float64
		optimalValue float64
		optimalCards map[string]int // card name → frequency as optimal
		entryCount   int
		missedCount  int
	}
	catMap := make(map[string]*catAgg)
	var missedEntries []model.MissedRewardEntry

	for _, e := range allEntries {
		// Re-rank against current wallet.
		recs, err := s.optimizer.GetBestCard(ctx, model.OptimizeRequest{
			SessionID:    sessionID,
			CategorySlug: e.CategorySlug,
			SpendAmount:  e.Amount,
			// Score each historical purchase independently. Using the
			// current live month's running cap state for a months-old
			// transaction made the "$X left" total wrong + non-deterministic.
			PerPurchase: true,
		})
		if err != nil || len(recs) == 0 {
			// Skip entries we can't score (e.g. category not resolved).
			continue
		}
		best := recs[0]
		// Value the actually-used card under the SAME optimizer model (caps,
		// segment, transfer partners) by reading its score from this ranking,
		// rather than the stored e.DollarValue (computed with a different
		// uncapped / base-CPP / no-transfer formula). This keeps both sides of
		// the gap comparable. Falls back to the stored value if the card is no
		// longer in the wallet (absent from recs).
		actualValue := e.DollarValue
		for _, rc := range recs {
			if rc.CardID == e.CardID {
				actualValue = rc.DollarValue
				break
			}
		}

		report.TotalSpend += e.Amount
		report.TotalActual += actualValue
		report.TotalOptimal += best.DollarValue
		report.EntryCount++

		ca, ok := catMap[e.CategorySlug]
		if !ok {
			ca = &catAgg{
				slug:         e.CategorySlug,
				name:         e.CategoryName,
				optimalCards: map[string]int{},
			}
			catMap[e.CategorySlug] = ca
		}
		ca.spend += e.Amount
		ca.actualValue += actualValue
		ca.optimalValue += best.DollarValue
		ca.entryCount++
		ca.optimalCards[best.CardName]++

		gap := best.DollarValue - actualValue
		if gap > 0.01 && best.CardID != e.CardID {
			ca.missedCount++
			report.MissedCount++
			missedEntries = append(missedEntries, model.MissedRewardEntry{
				SpendEntryID:    e.ID,
				SpentAt:         e.SpentAt,
				Description:     e.Note,
				CategorySlug:    e.CategorySlug,
				CategoryName:    e.CategoryName,
				Amount:          e.Amount,
				ActualCardID:    e.CardID,
				ActualCardName:  e.CardName,
				ActualValue:     round2(actualValue),
				OptimalCardID:   best.CardID,
				OptimalCardName: best.CardName,
				OptimalValue:    round2(best.DollarValue),
				Gap:             round2(gap),
			})
		}
	}

	report.TotalGap = report.TotalOptimal - report.TotalActual
	report.TotalSpend = round2(report.TotalSpend)
	report.TotalActual = round2(report.TotalActual)
	report.TotalOptimal = round2(report.TotalOptimal)
	report.TotalGap = round2(report.TotalGap)

	// Build by-category list, sorted by gap descending.
	for _, ca := range catMap {
		// Pick most-frequent optimal card for this category.
		var topCard string
		var topCount int
		for name, count := range ca.optimalCards {
			if count > topCount {
				topCount = count
				topCard = name
			}
		}
		report.ByCategory = append(report.ByCategory, model.CategoryMissed{
			CategorySlug:    ca.slug,
			CategoryName:    ca.name,
			TotalSpend:      round2(ca.spend),
			ActualValue:     round2(ca.actualValue),
			OptimalValue:    round2(ca.optimalValue),
			Gap:             round2(ca.optimalValue - ca.actualValue),
			OptimalCardName: topCard,
			EntryCount:      ca.entryCount,
			MissedCount:     ca.missedCount,
		})
	}
	sort.Slice(report.ByCategory, func(i, j int) bool {
		return report.ByCategory[i].Gap > report.ByCategory[j].Gap
	})

	// Top missed entries by gap.
	sort.Slice(missedEntries, func(i, j int) bool {
		return missedEntries[i].Gap > missedEntries[j].Gap
	})
	if len(missedEntries) > topN {
		missedEntries = missedEntries[:topN]
	}
	report.TopMissed = missedEntries

	return report, nil
}

func round2(v float64) float64 {
	// Delegates to the shared rounder. The old int(v*100+0.5) truncated
	// toward zero, so NEGATIVE values rounded the wrong way (-2.345 → -2.34);
	// Gap can be negative when program CPP dropped since the entry was logged.
	return roundMoney(v)
}
