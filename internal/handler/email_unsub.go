package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"maplerewards/internal/repo"
	"maplerewards/internal/service"
)

// EmailHandler serves the public, token-authenticated email-unsubscribe
// endpoint. No JWT/CSRF: the request arrives from a one-click footer link in
// an email (often a different browser/client), so auth is the HMAC token in
// the link itself — CASL requires the opt-out to be low-friction.
type EmailHandler struct {
	authRepo *repo.AuthRepo
}

func NewEmailHandler(authRepo *repo.AuthRepo) *EmailHandler {
	return &EmailHandler{authRepo: authRepo}
}

// Unsubscribe handles POST /email/unsubscribe. Body: {"u": userID, "t": token}.
func (h *EmailHandler) Unsubscribe(w http.ResponseWriter, r *http.Request) {
	var body struct {
		U string `json:"u"`
		E string `json:"e"`
		T string `json:"t"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if !service.VerifyUnsubToken(body.U, body.E, body.T) {
		// Constant-time verify already done; don't leak whether the user
		// exists — just reject the bad signature.
		jsonErrorCode(w, "INVALID_TOKEN", "invalid or expired unsubscribe link", http.StatusBadRequest)
		return
	}
	if err := h.authRepo.SetEmailUnsubscribed(r.Context(), body.U); err != nil {
		slog.Error("email unsubscribe failed", "err", err, "user_id", body.U)
		jsonError(w, "could not process unsubscribe", http.StatusInternalServerError)
		return
	}
	slog.Info("email unsubscribed", "user_id", body.U)
	jsonOK(w, map[string]string{"status": "unsubscribed"})
}
