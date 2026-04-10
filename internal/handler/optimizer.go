package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

// Optimizer defines the interface for the optimization service.
type Optimizer interface {
	GetBestCard(ctx context.Context, req model.OptimizeRequest) ([]model.CardRecommendation, error)
}

type OptimizerHandler struct {
	svc Optimizer
}

func NewOptimizerHandler(svc Optimizer) *OptimizerHandler {
	return &OptimizerHandler{svc: svc}
}

func (h *OptimizerHandler) GetBestCard(w http.ResponseWriter, r *http.Request) {
	var req model.OptimizeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Validation
	if req.SessionID == "" || !isValidSessionID(req.SessionID) {
		jsonError(w, "valid session_id is required (32 hex chars)", http.StatusBadRequest)
		return
	}
	if !isValidSpendAmount(req.SpendAmount) {
		jsonError(w, "spend_amount must be between $0.01 and $1,000,000", http.StatusBadRequest)
		return
	}
	if req.CategorySlug == "" && req.MCCCode == nil {
		jsonError(w, "provide category_slug or mcc_code", http.StatusBadRequest)
		return
	}
	if req.CategorySlug != "" && !isValidSlug(req.CategorySlug) {
		jsonError(w, "invalid category_slug format", http.StatusBadRequest)
		return
	}
	if req.RedemptionSegment != "" && req.RedemptionSegment != "base" && req.RedemptionSegment != "business" {
		jsonError(w, "redemption_segment must be 'base' or 'business'", http.StatusBadRequest)
		return
	}

	recs, err := h.svc.GetBestCard(r.Context(), req)
	if err != nil {
		if errors.Is(err, service.ErrSessionNotFound) || strings.Contains(err.Error(), "session not found") {
			jsonErrorCode(w, "SESSION_NOT_FOUND", "session not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, service.ErrWalletEmpty) || strings.Contains(err.Error(), "wallet is empty") {
			jsonErrorCode(w, "WALLET_EMPTY", err.Error(), http.StatusBadRequest)
			return
		}
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	jsonOK(w, recs)
}
