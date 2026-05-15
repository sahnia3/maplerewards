package handler

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/service"
)

// AccountExportHandler implements GET /api/v1/account/export — the PIPEDA +
// GDPR right-to-access endpoint. Returns the user's full data as a pretty-
// printed JSON file with a Content-Disposition header so the browser
// downloads it instead of rendering inline.
type AccountExportHandler struct {
	svc *service.DataExportService
}

func NewAccountExportHandler(svc *service.DataExportService) *AccountExportHandler {
	return &AccountExportHandler{svc: svc}
}

// Export handles GET /api/v1/account/export
func (h *AccountExportHandler) Export(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonErrorCode(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
		return
	}

	payload, err := h.svc.Export(r.Context(), userID)
	if err != nil {
		slog.Error("data export failed", "err", err, "user_id", userID)
		jsonInternalError(w, "data export failed", err)
		return
	}

	body, err := payload.MarshalIndent()
	if err != nil {
		slog.Error("data export marshal failed", "err", err, "user_id", userID)
		jsonInternalError(w, "data export marshal failed", err)
		return
	}

	// Content-Disposition forces a download; the filename includes a date so
	// users can keep multiple exports.
	filename := fmt.Sprintf("maplerewards-export-%s.json", time.Now().UTC().Format("2006-01-02"))
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
