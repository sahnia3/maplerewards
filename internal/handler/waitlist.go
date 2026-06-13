package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"maplerewards/internal/service"
)

type WaitlistHandler struct {
	svc *service.WaitlistService
}

func NewWaitlistHandler(svc *service.WaitlistService) *WaitlistHandler {
	return &WaitlistHandler{svc: svc}
}

// waitlistResponse is the success payload for both the fresh-signup (201)
// and idempotent-repeat (200) cases — identical shape so the frontend
// renders one success state.
type waitlistResponse struct {
	Position      int    `json:"position"`
	ReferralCode  string `json:"referral_code"`
	ReferralCount int    `json:"referral_count"`
	Total         int    `json:"total"`
}

// Join handles POST /api/v1/waitlist {email, ref?, source?}. Anonymous,
// idempotent: a brand-new email gets 201, a repeat email gets 200 with the
// same payload it got the first time.
func (h *WaitlistHandler) Join(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email  string `json:"email"`
		Ref    string `json:"ref"`
		Source string `json:"source"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" {
		jsonError(w, "email is required", http.StatusBadRequest)
		return
	}

	res, err := h.svc.Join(r.Context(), body.Email, body.Ref, body.Source)
	if err != nil {
		if errors.Is(err, service.ErrInvalidWaitlistEmail) {
			jsonMaskedError(w, "waitlist.join", err, "please enter a valid email address", http.StatusBadRequest)
			return
		}
		jsonMaskedError(w, "waitlist.join", err, "could not join the waitlist — try again shortly", http.StatusInternalServerError)
		return
	}

	status := http.StatusOK
	if res.Created {
		status = http.StatusCreated
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(waitlistResponse{ //nolint:errcheck
		Position:      res.Position,
		ReferralCode:  res.ReferralCode,
		ReferralCount: res.ReferralCount,
		Total:         res.Total,
	})
}
