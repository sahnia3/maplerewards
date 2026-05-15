package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/service"
)

// CSVImportHandler exposes a two-step import: /preview (parse + return
// preview, no DB write) and /commit (parse again + write to spend_entries).
// Splitting the steps lets the frontend confirm the parsed shape before
// any irreversible insert hits the DB.
type CSVImportHandler struct {
	svc *service.CSVImportService
}

func NewCSVImportHandler(svc *service.CSVImportService) *CSVImportHandler {
	return &CSVImportHandler{svc: svc}
}

// Preview handles POST /wallet/{sessionID}/spend/import/preview
// Body: { "csv": "date,description,amount\n..." }
type previewReq struct {
	CSV string `json:"csv"`
}

func (h *CSVImportHandler) Preview(w http.ResponseWriter, r *http.Request) {
	var req previewReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.CSV) == "" {
		jsonError(w, "csv body required", http.StatusBadRequest)
		return
	}
	preview, _, err := h.svc.Parse(strings.NewReader(req.CSV))
	if err != nil {
		jsonMaskedError(w, "csv_import.preview", err, "could not parse CSV — check the header row and try again", http.StatusUnprocessableEntity)
		return
	}
	jsonOK(w, preview)
}

// Commit handles POST /wallet/{sessionID}/spend/import/commit
// Body: { "csv": "...", "card_id": "...", "fallback_category_slug": "..." }
//
// fallback_category_slug is optional — only used when a row's auto-detected
// category is empty. Each parsed row carries its own category from
// CategorizeMerchant; the fallback handles the rare unmatched case (defaults
// to "everything_else" server-side when omitted).
type commitReq struct {
	CSV                  string `json:"csv"`
	CardID               string `json:"card_id"`
	FallbackCategorySlug string `json:"fallback_category_slug,omitempty"`
}

func (h *CSVImportHandler) Commit(w http.ResponseWriter, r *http.Request) {
	sid := chi.URLParam(r, "sessionID")
	var req commitReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.CardID == "" {
		jsonError(w, "card_id required", http.StatusBadRequest)
		return
	}
	_, txns, err := h.svc.Parse(strings.NewReader(req.CSV))
	if err != nil {
		jsonMaskedError(w, "csv_import.commit_parse", err, "could not parse CSV — check the header row and try again", http.StatusUnprocessableEntity)
		return
	}
	created, err := h.svc.Commit(r.Context(), sid, req.CardID, req.FallbackCategorySlug, txns)
	if err != nil {
		// IDOR fix: card-not-in-wallet must be 403, not 200-with-error.
		// Otherwise an attacker could brute-force card IDs to map them to
		// wallets via timing differences in the response.
		if errors.Is(err, service.ErrCardNotInWallet) {
			jsonErrorCode(w, "FORBIDDEN", "the supplied card is not in your wallet", http.StatusForbidden)
			return
		}
		// Partial success — report how many made it before the failure.
		jsonOK(w, map[string]any{
			"created": created,
			"error":   err.Error(),
		})
		return
	}
	jsonOK(w, map[string]any{"created": created})
}
