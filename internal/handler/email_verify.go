package handler

import (
	"encoding/json"
	"net/http"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/service"
)

type EmailVerifyHandler struct {
	svc *service.EmailVerifyService
}

func NewEmailVerifyHandler(svc *service.EmailVerifyService) *EmailVerifyHandler {
	return &EmailVerifyHandler{svc: svc}
}

// SendVerification handles POST /auth/verify-email/send (auth required).
// Idempotent — calling again just refreshes the in-flight token.
func (h *EmailVerifyHandler) SendVerification(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonErrorCode(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
		return
	}
	if err := h.svc.IssueAndSend(r.Context(), userID); err != nil {
		// Mask: IssueAndSend wraps repo errors with %w, so passing err.Error()
		// through leaked pgx/schema text. The genuine user-actionable states
		// (already verified / no email) are non-blocking; a generic message
		// is acceptable and the full error is logged for triage.
		jsonMaskedError(w, "email_verify.issue", err, "could not send the verification email — try again shortly", http.StatusBadRequest)
		return
	}
	jsonOK(w, map[string]string{"message": "verification email sent"})
}

// Verify handles POST /auth/verify-email — anonymous endpoint because the
// link arrives from the user's inbox where they may not be logged in.
type verifyReq struct {
	UID   string `json:"uid"`
	Token string `json:"token"`
}

func (h *EmailVerifyHandler) Verify(w http.ResponseWriter, r *http.Request) {
	var req verifyReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := h.svc.Verify(r.Context(), req.UID, req.Token); err != nil {
		jsonMaskedError(w, "email_verify.verify", err, "this verification link is invalid or has expired", http.StatusBadRequest)
		return
	}
	jsonOK(w, map[string]string{"message": "email verified"})
}
