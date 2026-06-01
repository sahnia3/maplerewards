package handler

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/service"
)

// Sane upper bounds for the self-reported flight inputs. Aeroplan's top tier
// needs ~125K SQC and ~$20K flight revenue; these caps sit comfortably above
// any real figure while rejecting garbage/overflow input.
const (
	maxFlightSQC      = 1_000_000
	maxFlightSpendCAD = 10_000_000
)

type SQCHandler struct {
	svc *service.SQCService
}

func NewSQCHandler(svc *service.SQCService) *SQCHandler {
	return &SQCHandler{svc: svc}
}

// GetProjection handles
// GET /api/v1/wallet/{sessionID}/sqc-projection?flight_sqc=&flight_spend_cad=
//
// flight_sqc and flight_spend_cad are OPTIONAL. Absent (or invalid) ⇒ both 0,
// which reproduces the legacy card-spend-only projection. Negative values are
// rejected (treated as 0); each is capped at a sane maximum.
func (h *SQCHandler) GetProjection(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "sessionID")
	if sessionID == "" {
		jsonError(w, "session_id required", http.StatusBadRequest)
		return
	}

	var flights service.SQCFlightInputs
	if v := r.URL.Query().Get("flight_sqc"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 && n <= maxFlightSQC {
			flights.FlightSQC = n
		}
	}
	if v := r.URL.Query().Get("flight_spend_cad"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil && f >= 0 && f <= maxFlightSpendCAD {
			flights.FlightSpendCAD = f
		}
	}

	out, err := h.svc.Project(r.Context(), sessionID, flights)
	if err != nil {
		jsonMaskedError(w, "sqc.project", err, "could not compute SQC projection", http.StatusBadRequest)
		return
	}
	jsonOK(w, out)
}
