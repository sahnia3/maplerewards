package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"

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
	// SSRF guard: the server later POSTs to this endpoint (push/test + the
	// notify worker), so reject anything that isn't a public https push URL.
	if err := validatePushEndpoint(req.Endpoint); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
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

// validatePushEndpoint defends against SSRF via the Web Push endpoint. The
// server POSTs to this URL later (push/test + the notify worker), so an
// attacker-supplied endpoint aimed at an internal host would turn the push
// pipeline into a private-network probe. Real push services (FCM, Mozilla
// autopush, WNS, Apple) are always https on public hosts. IP-literal hosts in
// private/loopback/link-local ranges are rejected; hostnames that resolve to
// private IPs at send time are a deeper (DNS-rebinding) concern best closed
// with a dial-time guard in the pusher transport.
func validatePushEndpoint(raw string) error {
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid endpoint URL")
	}
	if u.Scheme != "https" {
		return fmt.Errorf("endpoint must be an https URL")
	}
	host := u.Hostname()
	if host == "" {
		return fmt.Errorf("endpoint host is required")
	}
	if strings.EqualFold(host, "localhost") {
		return fmt.Errorf("endpoint host is not allowed")
	}
	if ip := net.ParseIP(host); ip != nil {
		if !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() ||
			ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return fmt.Errorf("endpoint host is not allowed")
		}
	}
	return nil
}
