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
		Type string          `json:"type"`
		Data struct {
			Object json.RawMessage `json:"object"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		jsonError(w, "invalid event payload", http.StatusBadRequest)
		return
	}

	// Process the event
	if err := h.svc.HandleWebhookEvent(r.Context(), event.Type, event.Data.Object); err != nil {
		slog.Error("webhook event processing failed", "err", err, "type", event.Type)
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
