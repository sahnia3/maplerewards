package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

type BillingHandler struct {
	svc *service.BillingService
}

func NewBillingHandler(svc *service.BillingService) *BillingHandler {
	return &BillingHandler{svc: svc}
}

// CreateCheckout handles POST /billing/checkout (requires auth).
// Creates a Stripe Checkout session and returns the redirect URL.
func (h *BillingHandler) CreateCheckout(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonErrorCode(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
		return
	}

	var req model.CreateCheckoutRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Interval == "" {
		req.Interval = "monthly"
	}

	session, err := h.svc.CreateCheckoutSession(r.Context(), userID, req.Interval)
	if err != nil {
		slog.Error("checkout session creation failed", "err", err, "user_id", userID)
		switch {
		case strings.Contains(err.Error(), "stripe not configured"):
			jsonErrorCode(w, "SERVICE_UNAVAILABLE", "billing is not configured", http.StatusServiceUnavailable)
		case strings.Contains(err.Error(), "user not found"):
			jsonErrorCode(w, "NOT_FOUND", "user not found", http.StatusNotFound)
		default:
			jsonError(w, "failed to create checkout session", http.StatusInternalServerError)
		}
		return
	}

	jsonOK(w, session)
}

// CreatePortal handles POST /billing/portal (requires auth).
// Returns a Stripe Customer Portal URL where the user can cancel or manage
// their subscription, update the card, and view invoices.
func (h *BillingHandler) CreatePortal(w http.ResponseWriter, r *http.Request) {
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonErrorCode(w, "UNAUTHORIZED", "authentication required", http.StatusUnauthorized)
		return
	}

	// ?flow=cancel returns the user to /goodbye after the portal so a
	// completed cancellation lands on the post-cancel page.
	cancelFlow := r.URL.Query().Get("flow") == "cancel"
	session, err := h.svc.CreatePortalSession(r.Context(), userID, cancelFlow)
	if err != nil {
		slog.Error("portal session creation failed", "err", err, "user_id", userID)
		switch {
		case strings.Contains(err.Error(), "stripe not configured"):
			jsonErrorCode(w, "SERVICE_UNAVAILABLE", "billing is not configured", http.StatusServiceUnavailable)
		case strings.Contains(err.Error(), "no billing account"):
			jsonErrorCode(w, "NO_BILLING_ACCOUNT", "no billing account on file — you haven't subscribed yet", http.StatusBadRequest)
		case strings.Contains(err.Error(), "user not found"):
			jsonErrorCode(w, "NOT_FOUND", "user not found", http.StatusNotFound)
		default:
			jsonError(w, "failed to create portal session", http.StatusInternalServerError)
		}
		return
	}

	jsonOK(w, session)
}

// Webhook handles POST /billing/webhook (public, no auth).
// Receives Stripe webhook events and updates user Pro status.
func (h *BillingHandler) Webhook(w http.ResponseWriter, r *http.Request) {
	// Read body (Stripe recommends max 65536 bytes)
	body, err := io.ReadAll(io.LimitReader(r.Body, 65536))
	if err != nil {
		jsonError(w, "failed to read body", http.StatusBadRequest)
		return
	}

	// Verify Stripe webhook signature. Fail CLOSED: an empty secret used to
	// skip verification entirely, which (if STRIPE_WEBHOOK_SECRET were ever
	// unset) turned this into an unauthenticated free-Pro grant for any
	// user ID. Production is boot-gated to require the secret; here we
	// additionally refuse to process any webhook we cannot authenticate.
	webhookSecret := h.svc.GetWebhookSecret()
	if webhookSecret == "" {
		slog.Error("stripe webhook rejected: STRIPE_WEBHOOK_SECRET not configured — refusing to process unsigned webhook")
		jsonError(w, "webhook not configured", http.StatusInternalServerError)
		return
	}
	if !verifyStripeSignature(body, r.Header.Get("Stripe-Signature"), webhookSecret) {
		slog.Warn("stripe webhook signature verification failed")
		jsonErrorCode(w, "UNAUTHORIZED", "invalid signature", http.StatusUnauthorized)
		return
	}

	// Parse the event
	var event struct {
		ID   string `json:"id"`
		Type string `json:"type"`
		Data struct {
			Object json.RawMessage `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		jsonError(w, "invalid event payload", http.StatusBadRequest)
		return
	}

	// Idempotency. The dedup row has two states: RESERVED (in-flight) and
	// COMPLETED (completed_at set after success). Only a COMPLETED event is a
	// true duplicate we can 200-and-forget. A merely-reserved row means another
	// delivery is mid-flight (or crashed) — we must NOT 200, or Stripe stops
	// retrying an event we never finished (concurrent-loss bug, code review).
	if event.ID != "" {
		completed, err := h.svc.IsEventProcessed(r.Context(), event.ID)
		if err != nil {
			slog.Error("stripe event idempotency lookup failed", "err", err, "event_id", event.ID, "type", event.Type)
		} else if completed {
			slog.Info("duplicate stripe event ignored (already completed)", "event_id", event.ID, "type", event.Type)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"received":true,"duplicate":true}`)) //nolint:errcheck
			return
		}

		// Reserve. ON CONFLICT DO NOTHING → isNew=false means a row already
		// exists but is NOT completed (the check above passed): either a
		// concurrent delivery is processing it now, or a prior attempt crashed
		// mid-flight leaving an orphaned reserve.
		isNew, err := h.svc.RecordEvent(r.Context(), event.ID, event.Type)
		if err != nil {
			slog.Error("stripe event reserve failed", "err", err, "event_id", event.ID, "type", event.Type)
			jsonError(w, "event reservation failed", http.StatusInternalServerError)
			return
		}
		if !isNew {
			// Try to reclaim a stale orphan (>15min, never completed); if we
			// reclaim it, re-reserve and proceed. Otherwise it's genuinely
			// in-flight — ask Stripe to retry later (409, NOT 200).
			reclaimed, rcErr := h.svc.ReclaimStaleEvent(r.Context(), event.ID)
			if rcErr != nil {
				slog.Error("stripe stale-reclaim failed", "err", rcErr, "event_id", event.ID)
			}
			if !reclaimed {
				slog.Info("stripe event in-flight elsewhere — asking Stripe to retry", "event_id", event.ID, "type", event.Type)
				jsonError(w, "event processing in progress, retry later", http.StatusConflict)
				return
			}
			if isNew, err = h.svc.RecordEvent(r.Context(), event.ID, event.Type); err != nil || !isNew {
				slog.Info("stripe event re-reserve lost race after reclaim — retry later", "event_id", event.ID)
				jsonError(w, "event processing in progress, retry later", http.StatusConflict)
				return
			}
		}
	}

	// Process. On failure, delete the reserve so Stripe's retry re-attempts.
	if err := h.svc.HandleWebhookEvent(r.Context(), event.Type, event.Data.Object); err != nil {
		slog.Error("webhook event processing failed", "err", err, "type", event.Type, "event_id", event.ID)
		if event.ID != "" {
			if delErr := h.svc.DeleteEvent(r.Context(), event.ID); delErr != nil {
				slog.Error("stripe event rollback failed — manual cleanup required",
					"err", delErr, "event_id", event.ID)
			}
		}
		jsonError(w, "event processing failed", http.StatusInternalServerError)
		return
	}

	// Stamp COMPLETED so future duplicates short-circuit safely. A failure
	// here only risks one extra (idempotent) reprocess on Stripe's next retry.
	if event.ID != "" {
		if err := h.svc.MarkEventCompleted(r.Context(), event.ID); err != nil {
			slog.Error("stripe event mark-completed failed (non-fatal)", "err", err, "event_id", event.ID)
		}
	}

	// Acknowledge receipt
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"received":true}`)) //nolint:errcheck
}

// verifyStripeSignature verifies the Stripe webhook signature.
// Stripe uses HMAC-SHA256 with a timestamp to sign webhook payloads.
func verifyStripeSignature(payload []byte, sigHeader, secret string) bool {
	if sigHeader == "" {
		return false
	}

	// Parse the signature header: t=timestamp,v1=signature
	var timestamp string
	var signatures []string

	parts := strings.Split(sigHeader, ",")
	for _, part := range parts {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			timestamp = kv[1]
		case "v1":
			signatures = append(signatures, kv[1])
		}
	}

	if timestamp == "" || len(signatures) == 0 {
		return false
	}

	// Check timestamp is within tolerance (5 minutes)
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return false
	}
	// Reject skew in BOTH directions. The old one-sided check
	// (now-ts > 300) let a far-future timestamp through, making the
	// 5-minute replay window effectively unbounded into the future.
	now := time.Now().Unix()
	if ts > now+300 || now-ts > 300 {
		return false
	}

	// Compute expected signature
	signedPayload := fmt.Sprintf("%s.%s", timestamp, string(payload))
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signedPayload))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	// Compare with provided signatures
	for _, sig := range signatures {
		if hmac.Equal([]byte(sig), []byte(expectedSig)) {
			return true
		}
	}

	return false
}
