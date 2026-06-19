package service

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"maplerewards/internal/model"
)

// maxTransferOptionsPerAward caps how many funding paths we surface per award
// row so a user holding many transferable currencies doesn't flood the prompt.
const maxTransferOptionsPerAward = 3

// awardTransferOption is one pre-computed source→award-currency top-up path for
// a single award row.
type awardTransferOption struct {
	FromProgram     string  // source currency display name, e.g. "Amex MR"
	Ratio           float64 // 1.0 = 1:1 (destination points per 1 source point)
	Increment       int     // source-side transfer increment (>=1; DB 0 == no constraint)
	Minimum         int     // source-side minimum transfer
	SourceToMove    int64   // EXACT source pts to transfer = ceilToIncrement(ceil(award/ratio), inc)
	SourceBalance   int64   // user's balance in the source currency
	CanCover        bool    // SourceBalance >= SourceToMove && SourceToMove >= Minimum
	SourceShortfall int64   // max(0, SourceToMove - SourceBalance)
}

// awardFact is the fully-resolved, pre-computed fact set for one award program row.
type awardFact struct {
	ProgramName     string
	Cabin           string
	PointsCost      int64
	LiveCashCAD     float64 // cheapest cash used for CPP; 0 when neither live nor benchmark cash known
	CashIsLive      bool    // true when LiveCashCAD came from live flights, false when it's the row benchmark
	CPPLive         float64 // computeCPP(netCashCAD(cash, taxes), points); rendered at 2dp
	DirectBalance   int64
	DirectCanAfford bool
	DirectShortfall int64
	Transfers       []awardTransferOption
}

// ceilToIncrement rounds n UP to the next multiple of inc. An inc <= 1 means "no
// increment constraint" (the DB COALESCEs transfer_increment to 0), so the value
// passes through as a multiple of 1.
func ceilToIncrement(n int64, inc int) int64 {
	if inc <= 1 {
		return n
	}
	i := int64(inc)
	if n%i == 0 {
		return n
	}
	return ((n / i) + 1) * i
}

// sourcePointsToMove returns how many SOURCE points to transfer so that, after
// applying the ratio, you hold at least awardCost destination points — rounded
// UP to the source increment. ratio is destination-per-1-source (1.0 = 1:1).
// Returns 0 for a non-positive ratio or award cost (invalid / no-op route).
func sourcePointsToMove(awardCost int64, ratio float64, inc int) int64 {
	if ratio <= 0 || awardCost <= 0 {
		return 0
	}
	raw := int64(math.Ceil(float64(awardCost) / ratio))
	return ceilToIncrement(raw, inc)
}

// computeAwardFacts is PURE — it performs no repo calls. The caller resolves
// transferRoutes (keyed by award issuer key, i.e. AwardSearchResult.Program →
// the inbound routes whose FromProgram is set to the user's source currency)
// and walletBySlug (source program slug → aggregated balance). Each returned
// awardFact carries every number the model needs so it never recomputes.
func computeAwardFacts(
	results []model.AwardSearchResult,
	liveCheapestCashCAD float64, // flights[0].Price, or 0 when no live flights
	walletBySlug map[string]int64,
	transferRoutes map[string][]model.TransferPartner,
) []awardFact {
	facts := make([]awardFact, 0, len(results))
	for _, r := range results {
		cash := liveCheapestCashCAD
		live := cash > 0
		if !live {
			cash = r.CashPriceCAD // fall back to the row's route/cabin benchmark
		}
		pts := int64(r.PointsCost)

		f := awardFact{
			ProgramName:     r.ProgramName,
			Cabin:           r.Cabin,
			PointsCost:      pts,
			LiveCashCAD:     cash,
			CashIsLive:      live,
			CPPLive:         computeCPP(netCashCAD(cash, r.TaxesCash), r.PointsCost),
			DirectBalance:   r.PointsAvailable,
			DirectCanAfford: r.PointsAvailable >= pts,
		}
		if !f.DirectCanAfford {
			f.DirectShortfall = pts - r.PointsAvailable
		}

		for _, tp := range transferRoutes[r.Program] {
			if tp.FromProgram == nil || !tp.IsActive {
				continue
			}
			bal := walletBySlug[tp.FromProgram.Slug]
			if bal <= 0 {
				continue // only surface paths the user can actually fund
			}
			move := sourcePointsToMove(pts, tp.TransferRatio, tp.TransferIncrement)
			if move <= 0 {
				continue // invalid route (ratio <= 0)
			}
			opt := awardTransferOption{
				FromProgram:   tp.FromProgram.Name,
				Ratio:         tp.TransferRatio,
				Increment:     tp.TransferIncrement,
				Minimum:       tp.MinimumTransfer,
				SourceToMove:  move,
				SourceBalance: bal,
				CanCover:      bal >= move && move >= int64(tp.MinimumTransfer),
			}
			if bal < move {
				opt.SourceShortfall = move - bal
			}
			f.Transfers = append(f.Transfers, opt)
		}

		// Cheapest funding path first; cap so many currencies don't flood the prompt.
		sort.SliceStable(f.Transfers, func(i, j int) bool {
			return f.Transfers[i].SourceToMove < f.Transfers[j].SourceToMove
		})
		if len(f.Transfers) > maxTransferOptionsPerAward {
			f.Transfers = f.Transfers[:maxTransferOptionsPerAward]
		}

		facts = append(facts, f)
	}
	return facts
}

// renderAwardFactsBlock emits the prompt-injected, pre-computed FACTS block. The
// header forbids recomputation so the model narrates rather than calculates.
func renderAwardFactsBlock(facts []awardFact) string {
	if len(facts) == 0 {
		return ""
	}
	var sb strings.Builder
	sb.WriteString("\n## ✅ PRE-COMPUTED FACTS (authoritative — quote verbatim, DO NOT recalculate)\n")
	for _, f := range facts {
		cashTag := "estimated cash"
		if f.CashIsLive {
			cashTag = "live cash"
		}
		fmt.Fprintf(&sb, "\n### %s (%s)\n", f.ProgramName, f.Cabin)
		fmt.Fprintf(&sb, "- Points cost: %s pts\n", formatPoints(f.PointsCost))
		if f.LiveCashCAD > 0 {
			fmt.Fprintf(&sb, "- CPP: %.2f¢/pt (%s $%.0f CAD)\n", f.CPPLive, cashTag, f.LiveCashCAD)
		}
		if f.DirectCanAfford {
			fmt.Fprintf(&sb, "- You have %s pts in %s — enough (direct).\n",
				formatPoints(f.DirectBalance), f.ProgramName)
		} else if f.DirectBalance > 0 {
			fmt.Fprintf(&sb, "- You have %s pts in %s — short %s pts to book directly.\n",
				formatPoints(f.DirectBalance), f.ProgramName, formatPoints(f.DirectShortfall))
		}
		for _, t := range f.Transfers {
			ratioStr := strings.TrimSuffix(strings.TrimSuffix(fmt.Sprintf("%.2f", t.Ratio), "0"), "0")
			ratioStr = strings.TrimSuffix(ratioStr, ".")
			verb := "✅ enough"
			if !t.CanCover {
				verb = fmt.Sprintf("❌ short %s %s pts", formatPoints(t.SourceShortfall), t.FromProgram)
			}
			fmt.Fprintf(&sb, "- Transfer %s pts from %s (ratio %s:1, %s increments) → covers this award. You hold %s %s — %s.\n",
				formatPoints(t.SourceToMove), t.FromProgram, ratioStr, formatPoints(int64(normalizeIncrement(t.Increment))),
				formatPoints(t.SourceBalance), t.FromProgram, verb)
		}
	}
	sb.WriteString("\n")
	return sb.String()
}

// normalizeIncrement maps a DB increment (0 == no constraint) to a renderable
// increment of at least 1.
func normalizeIncrement(i int) int {
	if i <= 0 {
		return 1
	}
	return i
}
