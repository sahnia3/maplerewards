package handler

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type SpendHandler struct {
	svc *service.WalletService
}

func NewSpendHandler(svc *service.WalletService) *SpendHandler {
	return &SpendHandler{svc: svc}
}

// RecordSpend logs a manual spend entry and updates monthly spend tracking.
func (h *SpendHandler) RecordSpend(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}

	var req model.SpendLogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.CardID == "" || req.CategorySlug == "" || req.Amount <= 0 {
		jsonError(w, "card_id, category_slug, and amount > 0 are required", http.StatusBadRequest)
		return
	}

	entry, err := h.svc.LogSpend(r.Context(), sessionID, req)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, entry)
}

// ListSpendHistory returns paginated spend entries for a user.
func (h *SpendHandler) ListSpendHistory(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}

	limit := 50
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 500 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	entries, err := h.svc.GetSpendHistory(r.Context(), sessionID, limit, offset)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	if entries == nil {
		entries = []model.SpendEntry{}
	}
	jsonOK(w, entries)
}

// ExportSpend streams the user's full spend history as a CSV download.
// PIPEDA "data portability" — anyone can take their own data out of the
// service. The endpoint pages through the whole history; cap at 10k rows
// to keep memory + bandwidth predictable.
func (h *SpendHandler) ExportSpend(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}
	entries, err := h.svc.GetSpendHistory(r.Context(), sessionID, 10000, 0)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}

	stamp := time.Now().UTC().Format("20060102")
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="maplerewards_spend_%s.csv"`, stamp))

	cw := csv.NewWriter(w)
	defer cw.Flush()
	_ = cw.Write([]string{"spent_at", "card_name", "category", "amount_cad", "points_earned", "dollar_value_cad", "note"})
	for _, e := range entries {
		_ = cw.Write([]string{
			e.SpentAt,
			e.CardName,
			e.CategoryName,
			strconv.FormatFloat(e.Amount, 'f', 2, 64),
			strconv.FormatFloat(e.PointsEarned, 'f', 2, 64),
			strconv.FormatFloat(e.DollarValue, 'f', 2, 64),
			e.Note,
		})
	}
}

// GetSpendStats returns aggregated spend statistics.
func (h *SpendHandler) GetSpendStats(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}

	stats, err := h.svc.GetSpendStats(r.Context(), sessionID)
	if err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, stats)
}
