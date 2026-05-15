package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"

	"maplerewards/internal/middleware"
	"maplerewards/internal/repo"
	"maplerewards/internal/service"
)

// PushHandler owns the three browser-facing push endpoints:
//   - POST   /api/v1/push/subscribe   — register or refresh a browser subscription
//   - DELETE /api/v1/push/subscribe   — remove a subscription
//   - POST   /api/v1/push/test        — self-send a test push (debug/onboarding)
//
// Subscribe is open to any authenticated user. Test is Pro-gated to keep the
// surface from being a free-tier abuse vector for poking other people's
// push services.
type PushHandler struct {
	pushRepo *repo.PushRepo
	pusher   service.Pusher
}

func NewPushHandler(pushRepo *repo.PushRepo, pusher service.Pusher) *PushHandler {
	return &PushHandler{pushRepo: pushRepo, pusher: pusher}
}

// subscribeRequest mirrors the JSON the browser's PushSubscription sends when
// you call .toJSON() on it, plus the user_agent for debugging.
type subscribeRequest struct {
	Endpoint  string `json:"endpoint"`
	Keys      struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
	UserAgent string `json:"user_agent,omitempty"`
}

// Subscribe upserts a push subscription for the authenticated user. POSTed
// payload is the standard W3C PushSubscription.toJSON() shape plus an
// optional user_agent string the frontend can include for debugging.
func (h *PushHandler) Subscribe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		jsonError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	var req subscribeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Endpoint == "" || req.Keys.P256dh == "" || req.Keys.Auth == "" {
		jsonError(w, "endpoint and keys are required", http.StatusBadRequest)
		return
	}
	err := h.pushRepo.Upsert(r.Context(), repo.PushSubscription{
		UserID:    userID,
		Endpoint:  req.Endpoint,
		P256dh:    req.Keys.P256dh,
		Auth:      req.Keys.Auth,
		UserAgent: req.UserAgent,
	})
	if err != nil {
		jsonMaskedError(w, "push.subscribe", err, "could not save subscription", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"ok": true})
}

// Unsubscribe removes a subscription by endpoint. Endpoint is sent in the
// JSON body rather than a URL param because endpoint URLs contain "/" and
// query-string-encoding them is ugly.
func (h *PushHandler) Unsubscribe(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		jsonError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	var req struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if err := h.pushRepo.DeleteByEndpoint(r.Context(), userID, req.Endpoint); err != nil {
		jsonMaskedError(w, "push.unsubscribe", err, "could not remove subscription", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"ok": true})
}

// Test fires a synthetic push to every subscription owned by the
// authenticated user. Pro-gated. Returns counts so the frontend can confirm
// at least one device received the message.
func (h *PushHandler) Test(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	if userID == "" {
		jsonError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	subs, err := h.pushRepo.ListForUser(r.Context(), userID)
	if err != nil {
		jsonMaskedError(w, "push.test_list", err, "could not list subscriptions", http.StatusInternalServerError)
		return
	}
	payload := service.PushPayload{
		Title: "Maple — push test",
		Body:  "If you're seeing this, push notifications are wired up correctly.",
		Tag:   "push-test",
		URL:   "/settings",
	}
	sent := 0
	pruned := 0
	for _, s := range subs {
		err := h.pusher.Send(r.Context(), s, payload)
		if errors.Is(err, service.ErrSubscriptionGone) {
			_ = h.pushRepo.DeleteByEndpoint(r.Context(), userID, s.Endpoint)
			pruned++
			continue
		}
		if err == nil {
			_ = h.pushRepo.MarkUsed(r.Context(), s.Endpoint)
			sent++
		}
	}
	jsonOK(w, map[string]any{
		"sent":     sent,
		"pruned":   pruned,
		"attempts": len(subs),
	})
}

// PublicVAPIDKey exposes the VAPID public key the browser needs when it
// calls PushManager.subscribe(). Intentionally unauthenticated — the
// public key is public. Frontend treats an empty string as "push disabled".
func (h *PushHandler) PublicVAPIDKey(w http.ResponseWriter, r *http.Request) {
	jsonOK(w, map[string]string{
		"public_key": os.Getenv("VAPID_PUBLIC_KEY"),
	})
}
