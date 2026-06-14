package handler

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/model"
)

// Report producers the export endpoint flattens to CSV. Each is a narrow
// interface satisfied by the existing Pro service (DI per .claude/rules/
// go-service.md) — the export handler invents no data, it streams the
// already-computed server-side analysis the matching Pro tile already renders.
type exportOptimizer interface {
	GetBestCard(ctx context.Context, req model.OptimizeRequest) ([]model.CardRecommendation, error)
}
type exportChurn interface {
	Plan(ctx context.Context, sessionID string) (*model.ChurnPlan, error)
}
type exportHousehold interface {
	Analyze(ctx context.Context, sessionID string, partnerCardIDs []string) (*model.HouseholdReport, error)
}
type exportSweetSpots interface {
	Find(ctx context.Context, sessionID string) (*model.TransferSweetSpotReport, error)
}
type exportMissedRewards interface {
	ComputeMissedRewards(ctx context.Context, sessionID string, sinceDays, topN int) (*model.MissedRewardsReport, error)
}

// ExportHandler streams a Pro computed-analysis report as a CSV download —
// the structural answer to "why does the spreadsheet survive": the user can
// take the optimizer ranking, churn plan, household coverage, transfer
// sweet-spots, or missed-rewards forensics out of the app. CSV cells are run
// through csvSafe (shared with spend.go) to neutralize formula injection.
type ExportHandler struct {
	optimizer exportOptimizer
	churn     exportChurn
	household exportHousehold
	sweet     exportSweetSpots
	missed    exportMissedRewards
}

func NewExportHandler(
	optimizer exportOptimizer,
	churn exportChurn,
	household exportHousehold,
	sweet exportSweetSpots,
	missed exportMissedRewards,
) *ExportHandler {
	return &ExportHandler{
		optimizer: optimizer,
		churn:     churn,
		household: household,
		sweet:     sweet,
		missed:    missed,
	}
}

// Export handles GET /pro/export/{report}?format=csv&... for {sessionID}.
// Pro + session ownership are enforced by middleware (same group as the tiles).
func (h *ExportHandler) Export(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session id required", http.StatusBadRequest)
		return
	}
	report := chi.URLParam(r, "report")

	// Only CSV is offered today; reject anything else explicitly rather than
	// silently emitting CSV under a wrong Content-Type.
	if f := r.URL.Query().Get("format"); f != "" && f != "csv" {
		jsonError(w, "only format=csv is supported", http.StatusBadRequest)
		return
	}

	header, rows, err := h.build(r.Context(), report, sessionID, r)
	if err != nil {
		jsonMaskedError(w, "export."+report, err, "could not build this export", http.StatusBadRequest)
		return
	}
	if header == nil {
		jsonError(w, "unknown report — expected one of: optimizer, churn, household, sweet-spots, missed-rewards", http.StatusBadRequest)
		return
	}

	stamp := time.Now().UTC().Format("20060102")
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="maplerewards_%s_%s.csv"`, report, stamp))

	cw := csv.NewWriter(w)
	defer cw.Flush()
	_ = cw.Write(header)
	for _, row := range rows {
		_ = cw.Write(row)
	}
}

// build dispatches to the per-report flattener. Returns (nil, nil, nil) for an
// unknown report so the caller can answer 400 with the valid set.
func (h *ExportHandler) build(ctx context.Context, report, sessionID string, r *http.Request) ([]string, [][]string, error) {
	switch report {
	case "optimizer":
		return h.optimizerRows(ctx, sessionID, r)
	case "churn":
		return h.churnRows(ctx, sessionID)
	case "household":
		return h.householdRows(ctx, sessionID, r)
	case "sweet-spots":
		return h.sweetSpotRows(ctx, sessionID)
	case "missed-rewards":
		return h.missedRewardsRows(ctx, sessionID, r)
	}
	return nil, nil, nil
}

// optimizerRows exports the ranked card recommendation for a single
// category+amount query (the optimizer is per-query, not a standing report),
// so category and amount come from the query string.
func (h *ExportHandler) optimizerRows(ctx context.Context, sessionID string, r *http.Request) ([]string, [][]string, error) {
	category := r.URL.Query().Get("category")
	if category == "" {
		category = r.URL.Query().Get("category_slug")
	}
	if category == "" || !isValidSlug(category) {
		return nil, nil, fmt.Errorf("optimizer export needs a valid category query param")
	}
	amount := 100.0
	if v := r.URL.Query().Get("amount"); v != "" {
		if n, perr := strconv.ParseFloat(v, 64); perr == nil && n > 0 {
			amount = n
		}
	}
	recs, err := h.optimizer.GetBestCard(ctx, model.OptimizeRequest{
		SessionID:    sessionID,
		CategorySlug: category,
		SpendAmount:  amount,
	})
	if err != nil {
		return nil, nil, err
	}
	header := []string{"rank", "card_name", "program", "earn_rate", "effective_return_pct", "points_earned", "dollar_value_cad", "cap_hit", "transfer_partner", "note"}
	rows := make([][]string, 0, len(recs))
	for i, rc := range recs {
		rows = append(rows, []string{
			strconv.Itoa(i + 1),
			csvSafe(rc.CardName),
			csvSafe(rc.ProgramName),
			strconv.FormatFloat(rc.EarnRate, 'f', 2, 64),
			strconv.FormatFloat(rc.EffectiveReturn, 'f', 2, 64),
			strconv.FormatFloat(rc.PointsEarned, 'f', 2, 64),
			strconv.FormatFloat(rc.DollarValue, 'f', 2, 64),
			strconv.FormatBool(rc.IsCapHit),
			csvSafe(rc.TransferPartner),
			csvSafe(rc.Note),
		})
	}
	return header, rows, nil
}

func (h *ExportHandler) churnRows(ctx context.Context, sessionID string) ([]string, [][]string, error) {
	plan, err := h.churn.Plan(ctx, sessionID)
	if err != nil {
		return nil, nil, err
	}
	header := []string{"status", "card_name", "issuer", "program", "welcome_bonus_points", "welcome_bonus_value_cad", "annual_fee_cad", "net_first_year_value_cad", "min_spend_cad", "min_spend_months", "monthly_spend_needed_cad", "min_spend_feasible", "eligible", "block_reason", "earliest_eligible_date"}
	var rows [][]string
	if plan != nil {
		appendChurn := func(status string, cands []model.ChurnCandidate) {
			for _, c := range cands {
				earliest := ""
				if c.EarliestEligibleDate != nil {
					earliest = *c.EarliestEligibleDate
				}
				rows = append(rows, []string{
					status,
					csvSafe(c.CardName),
					csvSafe(c.Issuer),
					csvSafe(c.ProgramName),
					strconv.Itoa(c.WelcomeBonusPoints),
					strconv.FormatFloat(c.WelcomeBonusValueCAD, 'f', 2, 64),
					strconv.FormatFloat(c.AnnualFee, 'f', 2, 64),
					strconv.FormatFloat(c.NetFirstYearValueCAD, 'f', 2, 64),
					strconv.FormatFloat(c.MinSpend, 'f', 2, 64),
					strconv.Itoa(c.MinSpendMonths),
					strconv.FormatFloat(c.MonthlySpendNeededCAD, 'f', 2, 64),
					strconv.FormatBool(c.MinSpendFeasible),
					strconv.FormatBool(c.Eligible),
					csvSafe(c.BlockReason),
					earliest,
				})
			}
		}
		appendChurn("recommended", plan.Recommendations)
		appendChurn("blocked", plan.Blocked)
	}
	return header, rows, nil
}

// householdRows exports the household coverage + cancel candidates. The
// partner cards normally come from the POST body; for the GET export they
// come from repeatable ?partner= query params so the CSV matches the analysis
// the user ran in the tile.
func (h *ExportHandler) householdRows(ctx context.Context, sessionID string, r *http.Request) ([]string, [][]string, error) {
	partners := r.URL.Query()["partner"]
	rep, err := h.household.Analyze(ctx, sessionID, partners)
	if err != nil {
		return nil, nil, err
	}
	header := []string{"section", "category_or_card", "best_card_or_owner", "owner", "effective_value_or_fee_cad", "reason"}
	var rows [][]string
	if rep != nil {
		for _, cov := range rep.CategoryCoverage {
			rows = append(rows, []string{
				"coverage",
				csvSafe(cov.CategoryName),
				csvSafe(cov.BestCardName),
				csvSafe(cov.Owner),
				strconv.FormatFloat(cov.EffectiveValue, 'f', 2, 64),
				"",
			})
		}
		for _, cc := range rep.CancelCandidates {
			rows = append(rows, []string{
				"cancel_candidate",
				csvSafe(cc.CardName),
				"",
				csvSafe(cc.Owner),
				strconv.FormatFloat(cc.AnnualFee, 'f', 2, 64),
				csvSafe(cc.Reason),
			})
		}
	}
	return header, rows, nil
}

func (h *ExportHandler) sweetSpotRows(ctx context.Context, sessionID string) ([]string, [][]string, error) {
	rep, err := h.sweet.Find(ctx, sessionID)
	if err != nil {
		return nil, nil, err
	}
	header := []string{"source_program", "points", "keep_value_cad", "to_program", "transfer_ratio", "transferred_points", "transfer_value_cad", "uplift_cad", "bonus_percent", "bonus_label", "eligible"}
	var rows [][]string
	if rep != nil {
		for _, src := range rep.Sources {
			for _, opt := range src.AllTransfers {
				rows = append(rows, []string{
					csvSafe(src.ProgramName),
					strconv.FormatInt(src.Points, 10),
					strconv.FormatFloat(src.KeepValueCAD, 'f', 2, 64),
					csvSafe(opt.ToProgramName),
					strconv.FormatFloat(opt.TransferRatio, 'f', 4, 64),
					strconv.FormatInt(opt.TransferredPoints, 10),
					strconv.FormatFloat(opt.TransferValueCAD, 'f', 2, 64),
					strconv.FormatFloat(opt.UpliftCAD, 'f', 2, 64),
					strconv.FormatFloat(opt.BonusPercent, 'f', 0, 64),
					csvSafe(opt.BonusLabel),
					strconv.FormatBool(opt.Eligible),
				})
			}
		}
	}
	return header, rows, nil
}

// missedRewardsRows exports the per-entry missed-rewards forensics. sinceDays
// and topN are bounded by the service; the export raises topN so the user gets
// the full forensics they paid for, not just the tile's preview rows.
func (h *ExportHandler) missedRewardsRows(ctx context.Context, sessionID string, r *http.Request) ([]string, [][]string, error) {
	sinceDays := 0
	if v := r.URL.Query().Get("since_days"); v != "" {
		if n, perr := strconv.Atoi(v); perr == nil && n > 0 {
			sinceDays = n
		}
	}
	rep, err := h.missed.ComputeMissedRewards(ctx, sessionID, sinceDays, 1000)
	if err != nil {
		return nil, nil, err
	}
	header := []string{"spent_at", "description", "category", "amount_cad", "actual_card", "actual_value_cad", "optimal_card", "optimal_value_cad", "gap_cad"}
	var rows [][]string
	if rep != nil {
		for _, e := range rep.TopMissed {
			rows = append(rows, []string{
				e.SpentAt,
				csvSafe(e.Description),
				csvSafe(e.CategoryName),
				strconv.FormatFloat(e.Amount, 'f', 2, 64),
				csvSafe(e.ActualCardName),
				strconv.FormatFloat(e.ActualValue, 'f', 2, 64),
				csvSafe(e.OptimalCardName),
				strconv.FormatFloat(e.OptimalValue, 'f', 2, 64),
				strconv.FormatFloat(e.Gap, 'f', 2, 64),
			})
		}
	}
	return header, rows, nil
}
