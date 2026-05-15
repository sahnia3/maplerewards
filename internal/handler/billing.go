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

// Webhook handles POST /billing/webhook (public, no auth).
// Receives Stripe webhook events and updates user Pro status.
func (h *BillingHandler) Webhook(w http.ResponseWriter, r *http.Request) {
	// Read body (Stripe recommends max 65536 bytes)
	body, err := io.ReadAll(io.LimitReader(r.Body, 65536))
	if err != nil {
		jsonError(w, "failed to read body", http.StatusBadRequest)
		return
	}

	// Verify Stripe webhook signature
	webhookSecret := h.svc.GetWebhookSecret()
	if webhookSecret != "" {
		sigHeader := r.Header.Get("Stripe-Signature")
		if !verifyStripeSignature(body, sigHeader, webhookSecret) {
			slog.Warn("stripe webhook signature verification failed")
			jsonErrorCode(w, "UNAUTHORIZED", "invalid signature", http.StatusUnauthorized)
			return
		}
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

	// Idempotency check — does this event ID already have a "successfully
	// processed" marker? If yes, skip and 200 so Stripe stops retrying.
	// Critically: we DO NOT record the marker here. Recording happens AFTER
	// HandleWebhookEvent returns nil — otherwise a transient processing
	// failure would record the dedup row, Stripe would retry the same event
	// to a healthy server, and we'd silently skip a real Pro grant.
	if event.ID != "" {
		alreadyDone, err := h.svc.IsEventProcessed(r.Context(), event.ID)
		if err != nil {
			// Don't fail the webhook on a lookup error — better to risk a
			// duplicate side-effect than return 5xx and trigger Stripe's
			// retry storm. Most handlers (SetUserPro) are idempotent at the
			// DB layer anyway.
			slog.Error("stripe event idempotency lookup failed", "err", err, "event_id", event.ID, "type", event.Type)
		} else if alreadyDone {
			slog.Info("duplicate stripe event ignored", "event_id", event.ID, "type", event.Type)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"received":true,"duplicate":true}`)) //nolint:errcheck
			return
		}
	}

	// Reserve-then-work pattern for true idempotency. INSERT the dedup row
	// FIRST with ON CONFLICT DO NOTHING semantics. RowsAffected==0 means the
	// event is already-seen (a Stripe retry) — short-circuit OK without
	// re-processing. Otherwise we own the row and do the work; if the work
	// fails, DELETE the row so Stripe's next retry can re-attempt. The
	// previous "process-then-record" order let work succeed while the record
	// failed, allowing a future non-idempotent handler to grant Pro twice.
	if event.ID != "" {
		isNew, err := h.svc.RecordEvent(r.Context(), event.ID, event.Type)
		if err != nil {
			slog.Error("stripe event reserve failed", "err", err, "event_id", event.ID, "type", event.Type)
			jsonError(w, "event reservation failed", http.StatusInternalServerError)
			return
		}
		if !isNew {
			// Already-processed duplicate. Acknowledge so Stripe stops retrying.
			slog.Info("stripe event duplicate, skipping", "event_id", event.ID, "type", event.Type)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"received":true,"duplicate":true}`)) //nolint:errcheck
			return
		}
	}

	// Process the event. On failure, delete the dedup row so Stripe's retry
	// can re-attempt with the same event.id.
	if err := h.svc.HandleWebhookEvent(r.Context(), event.Type, event.Data.Object); err != nil {
		slog.Error("webhook event processing failed", "err", err, "type", event.Type, "event_id", event.ID)
		if event.ID != "" {
			if delErr := h.svc.DeleteEvent(r.Context(), event.ID); delErr != nil {
				// If we can't roll back, log loudly. Stripe will see the
				// existing row on retry and skip processing — manual cleanup
				// from the DB needed.
				slog.Error("stripe event rollback failed — manual cleanup required",
					"err", delErr, "event_id", event.ID)
			}
		}
		jsonError(w, "event processing failed", http.StatusInternalServerError)
		return
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
	if time.Now().Unix()-ts > 300 {
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
