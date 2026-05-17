package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"

	"maplerewards/internal/model"
)

// BillingRepository abstracts billing-related DB operations.
type BillingRepository interface {
	GetUserByID(ctx context.Context, id string) (*model.User, error)
	GetUserByStripeCustomerID(ctx context.Context, customerID string) (*model.User, error)
	SetStripeCustomerID(ctx context.Context, userID, customerID string) error
	SetUserPro(ctx context.Context, userID string, isPro bool) error
	// SetUserPlan persists the purchased tier (free|pro|pro_plus|lifetime)
	// and keeps is_pro in sync atomically (any paid plan ⇒ is_pro=true).
	SetUserPlan(ctx context.Context, userID, plan string) error
	// IsEmailUnsubscribed reports whether the user opted out of commercial
	// email — the win-back send is suppressed when true (CASL).
	IsEmailUnsubscribed(ctx context.Context, userID string) (bool, error)
	// RecordStripeEvent returns true if the event ID is new, false if it has
	// already been processed (duplicate delivery from Stripe retry).
	// Called AFTER successful processing to mark the event done.
	RecordStripeEvent(ctx context.Context, eventID, eventType string) (bool, error)
	// IsStripeEventProcessed returns true if the event has been processed
	// before. Cheap lookup used at the START of the webhook to short-circuit
	// duplicates without re-running the (potentially expensive) handler.
	IsStripeEventProcessed(ctx context.Context, eventID string) (bool, error)
	// DeleteStripeEvent compensates for a failed handler — see the webhook
	// flow: we INSERT the dedup row BEFORE doing work; if work fails we
	// DELETE so Stripe's retry can re-attempt.
	DeleteStripeEvent(ctx context.Context, eventID string) error
}

// BillingService handles Stripe billing logic.
type BillingService struct {
	repo           BillingRepository
	stripeKey      string
	webhookSecret  string
	priceMonthly   string // legacy $7.99/mo — kept for backward compat
	priceAnnual    string // legacy $59.99/yr — kept for backward compat
	pricePro       string // new Pro $39.99/yr
	priceProPlus   string // new Pro Plus $69.99/yr
	priceLifetime  string // $199 one-time
	successURL      string
	cancelURL       string
	portalReturnURL string
	goodbyeURL      string
	mailer          Mailer
}

// NewBillingService creates a new billing service. mailer may be nil (no
// win-back email is sent then); pass NewMailerFromEnv() in production.
func NewBillingService(repo BillingRepository, mailer Mailer) *BillingService {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	return &BillingService{
		repo:          repo,
		mailer:        mailer,
		stripeKey:     os.Getenv("STRIPE_SECRET_KEY"),
		webhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET"),
		priceMonthly:  os.Getenv("STRIPE_PRICE_ID_MONTHLY"),
		priceAnnual:   os.Getenv("STRIPE_PRICE_ID_ANNUAL"),
		pricePro:      os.Getenv("STRIPE_PRICE_ID_PRO_ANNUAL"),
		priceProPlus:  os.Getenv("STRIPE_PRICE_ID_PROPLUS_ANNUAL"),
		priceLifetime: os.Getenv("STRIPE_PRICE_ID_LIFETIME"),
		successURL:      frontendURL + "/pricing?success=true",
		cancelURL:       frontendURL + "/pricing?canceled=true",
		portalReturnURL: frontendURL + "/settings",
		goodbyeURL:      frontendURL + "/goodbye",
	}
}

// CreateCheckoutSession creates a Stripe Checkout session via the Stripe API.
// Uses raw HTTP calls to avoid adding the stripe-go SDK dependency.
//
// Supported intervals:
//   - "pro_annual"      → Pro $39.99/yr recurring subscription
//   - "proplus_annual"  → Pro Plus $69.99/yr recurring subscription
//   - "lifetime"        → $199 one-time payment, grants permanent Pro
//   - "monthly"/"month", "annual"/"year" → legacy tiers, still honored
//     so any in-flight checkout links don't break
func (s *BillingService) CreateCheckoutSession(ctx context.Context, userID, interval string) (*model.CheckoutSession, error) {
	if s.stripeKey == "" {
		return nil, fmt.Errorf("stripe not configured")
	}

	// Determine price ID + checkout mode (subscription vs one-time payment).
	priceID := s.pricePro
	mode := "subscription"
	plan := "pro"
	switch interval {
	case "pro_annual":
		priceID = s.pricePro
		plan = "pro"
	case "proplus_annual":
		priceID = s.priceProPlus
		plan = "pro_plus"
	case "lifetime":
		priceID = s.priceLifetime
		mode = "payment"
		plan = "lifetime"
	// ── legacy intervals (backward compat) ──
	case "monthly", "month":
		priceID = s.priceMonthly
		plan = "pro"
	case "annual", "year":
		priceID = s.priceAnnual
		plan = "pro"
	}
	if priceID == "" {
		return nil, fmt.Errorf("stripe price ID not configured for interval: %s", interval)
	}

	// Look up user to get or create Stripe customer
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}

	// Build Stripe Checkout Session params. EVERY value must be url-encoded —
	// `customer_email` is user-controlled and a naive concat would let a
	// crafted email like "x&line_items[0][price]=price_FREE" smuggle params.
	form := url.Values{}
	form.Set("mode", mode)
	form.Set("success_url", s.successURL)
	form.Set("cancel_url", s.cancelURL)
	form.Set("line_items[0][price]", priceID)
	form.Set("line_items[0][quantity]", "1")
	form.Set("client_reference_id", userID)
	// Persist the purchased tier through the webhook. Stripe echoes session
	// metadata back on checkout.session.completed, so handleCheckoutCompleted
	// records the exact plan instead of a generic is_pro boolean.
	form.Set("metadata[plan]", plan)

	// 3-day free trial on recurring tiers only. A one-time Lifetime payment
	// (mode=payment) has no subscription to trial. Stripe still collects a
	// card up front and auto-charges on day 3 unless cancelled — the pricing
	// copy and the customer portal (cancel path) are aligned with that.
	if mode == "subscription" {
		form.Set("subscription_data[trial_period_days]", "3")
	}

	// One-time (Lifetime) payments do NOT create a Stripe Customer by
	// default — Stripe only auto-creates one for subscriptions. Without a
	// Customer the Billing Portal has nothing to attach to, so a Lifetime
	// buyer could never open it to see receipts or update their card. Force
	// creation here (only valid for payment/setup mode — Stripe rejects it
	// for subscription mode, which already makes a Customer anyway).
	if mode == "payment" {
		form.Set("customer_creation", "always")
	}

	if user.StripeCustomerID != nil && *user.StripeCustomerID != "" {
		form.Set("customer", *user.StripeCustomerID)
	} else {
		if user.Email != nil && *user.Email != "" {
			form.Set("customer_email", *user.Email)
		}
		form.Set("allow_promotion_codes", "true")
	}

	// Create checkout session via Stripe API
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.stripeKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("stripe request: %w", err)
	}
	defer resp.Body.Close()

	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		// A read failure usually means a partial response (context cancel,
		// upstream RST, slow network). Surfacing the read error gives us a
		// real diagnostic instead of an opaque empty-body parse failure.
		slog.Error("stripe checkout: response body read failed",
			"status", resp.StatusCode, "err", readErr)
		return nil, fmt.Errorf("stripe response body read: %w", readErr)
	}

	if resp.StatusCode != http.StatusOK {
		slog.Error("stripe checkout error", "status", resp.StatusCode, "body", string(body))
		return nil, fmt.Errorf("stripe API error: %s", resp.Status)
	}

	var session struct {
		ID  string `json:"id"`
		URL string `json:"url"`
	}
	if err := json.Unmarshal(body, &session); err != nil {
		return nil, fmt.Errorf("parse stripe response: %w", err)
	}

	return &model.CheckoutSession{
		SessionID: session.ID,
		URL:       session.URL,
	}, nil
}

// CreatePortalSession creates a Stripe Billing Customer Portal session. The
// returned URL is a Stripe-hosted page where the user can cancel or change
// their subscription, update the card on file, and see invoices — this is
// what makes the "cancel anytime in account settings" promise real, and is
// the safety valve for the 3-day auto-converting trial.
//
// Requires a Stripe customer ID (set at first checkout). Lifetime buyers
// have a customer ID but no subscription, so the portal correctly shows
// only billing history with nothing to cancel.
// cancelFlow=true returns the user to /goodbye after the portal (used by the
// "Continue to cancel" path) so a completed cancellation lands on the
// post-cancel page; otherwise they return to /settings.
func (s *BillingService) CreatePortalSession(ctx context.Context, userID string, cancelFlow bool) (*model.CheckoutSession, error) {
	if s.stripeKey == "" {
		return nil, fmt.Errorf("stripe not configured")
	}

	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}
	if user.StripeCustomerID == nil || *user.StripeCustomerID == "" {
		return nil, fmt.Errorf("no billing account")
	}

	returnURL := s.portalReturnURL
	if cancelFlow {
		returnURL = s.goodbyeURL
	}

	form := url.Values{}
	form.Set("customer", *user.StripeCustomerID)
	form.Set("return_url", returnURL)

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.stripe.com/v1/billing_portal/sessions", strings.NewReader(form.Encode()))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.stripeKey)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("stripe request: %w", err)
	}
	defer resp.Body.Close()

	body, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		slog.Error("stripe portal: response body read failed",
			"status", resp.StatusCode, "err", readErr)
		return nil, fmt.Errorf("stripe response body read: %w", readErr)
	}

	if resp.StatusCode != http.StatusOK {
		slog.Error("stripe portal error", "status", resp.StatusCode, "body", string(body))
		return nil, fmt.Errorf("stripe API error: %s", resp.Status)
	}

	var session struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(body, &session); err != nil {
		return nil, fmt.Errorf("parse stripe response: %w", err)
	}

	return &model.CheckoutSession{URL: session.URL}, nil
}

// HandleWebhookEvent processes a Stripe webhook event.
// Returns nil if the event was handled (or ignored), error on failure.
func (s *BillingService) HandleWebhookEvent(ctx context.Context, eventType string, eventData json.RawMessage) error {
	switch eventType {
	case "checkout.session.completed":
		return s.handleCheckoutCompleted(ctx, eventData)
	case "customer.subscription.updated":
		return s.handleSubscriptionUpdated(ctx, eventData)
	case "customer.subscription.deleted":
		return s.handleSubscriptionDeleted(ctx, eventData)
	default:
		// Ignore other event types
		slog.Debug("ignoring stripe event", "type", eventType)
		return nil
	}
}

func (s *BillingService) handleCheckoutCompleted(ctx context.Context, data json.RawMessage) error {
	var session struct {
		ClientReferenceID string `json:"client_reference_id"`
		Customer          string `json:"customer"`
		Subscription      string `json:"subscription"`
		Metadata          struct {
			Plan string `json:"plan"`
		} `json:"metadata"`
	}
	if err := json.Unmarshal(data, &session); err != nil {
		return fmt.Errorf("parse checkout session: %w", err)
	}

	userID := session.ClientReferenceID
	if userID == "" {
		slog.Warn("checkout completed without client_reference_id")
		return nil
	}

	// Save Stripe customer ID. This MUST be fatal, not log-and-continue:
	// without it CreatePortalSession returns "no billing account" forever,
	// so the user can never cancel/update card/get receipts (permanent for
	// Lifetime; breaks the "cancel anytime" promise for subscribers). The
	// webhook is idempotent, so returning the error lets Stripe retry.
	if session.Customer != "" {
		if err := s.repo.SetStripeCustomerID(ctx, userID, session.Customer); err != nil {
			return fmt.Errorf("save stripe customer id for user %s: %w", userID, err)
		}
	}

	// Record the purchased tier. metadata.plan is set at checkout creation;
	// fall back to "pro" if absent (legacy in-flight links / safety) since a
	// completed checkout always means a paid user. SetUserPlan keeps is_pro
	// in sync, so this also grants access.
	plan := session.Metadata.Plan
	if plan == "" {
		plan = "pro"
	}
	if err := s.repo.SetUserPlan(ctx, userID, plan); err != nil {
		return fmt.Errorf("activate plan %q for user %s: %w", plan, userID, err)
	}

	slog.Info("user upgraded", "user_id", userID, "plan", plan, "customer", session.Customer)
	return nil
}

func (s *BillingService) handleSubscriptionUpdated(ctx context.Context, data json.RawMessage) error {
	var sub struct {
		Customer string `json:"customer"`
		Status   string `json:"status"`
	}
	if err := json.Unmarshal(data, &sub); err != nil {
		return fmt.Errorf("parse subscription: %w", err)
	}

	user, err := s.repo.GetUserByStripeCustomerID(ctx, sub.Customer)
	if err != nil {
		return fmt.Errorf("find user by customer: %w", err)
	}
	if user == nil {
		slog.Warn("subscription update for unknown customer", "customer", sub.Customer)
		return nil
	}

	// Lifetime is a permanent one-time entitlement with no subscription.
	// If a Lifetime buyer ever also has a subscription object (e.g. they
	// later start a trial on another tier), a non-active status here must
	// NOT flip is_pro=false and revoke their lifetime access.
	if user.Plan == "lifetime" {
		slog.Info("subscription update ignored for lifetime account", "user_id", user.ID, "status", sub.Status)
		return nil
	}

	// Active statuses where the user should have Pro access
	isPro := sub.Status == "active" || sub.Status == "trialing"
	if err := s.repo.SetUserPro(ctx, user.ID, isPro); err != nil {
		return fmt.Errorf("update pro status: %w", err)
	}

	slog.Info("subscription updated", "user_id", user.ID, "status", sub.Status, "is_pro", isPro)
	return nil
}

func (s *BillingService) handleSubscriptionDeleted(ctx context.Context, data json.RawMessage) error {
	var sub struct {
		Customer string `json:"customer"`
	}
	if err := json.Unmarshal(data, &sub); err != nil {
		return fmt.Errorf("parse subscription: %w", err)
	}

	user, err := s.repo.GetUserByStripeCustomerID(ctx, sub.Customer)
	if err != nil {
		return fmt.Errorf("find user by customer: %w", err)
	}
	if user == nil {
		slog.Warn("subscription deleted for unknown customer", "customer", sub.Customer)
		return nil
	}

	// Full cancellation reverts to free (SetUserPlan also clears is_pro).
	// Lifetime buyers have no subscription, so this event never fires for
	// them — their 'lifetime' plan is permanent, as intended.
	if err := s.repo.SetUserPlan(ctx, user.ID, "free"); err != nil {
		return fmt.Errorf("revert plan to free: %w", err)
	}

	slog.Info("subscription canceled, reverted to free", "user_id", user.ID)

	// One — and only one — CASL-compliant win-back email. The webhook's
	// reserve-then-work idempotency guarantees subscription.deleted is
	// processed once, so this never double-sends. Best-effort: a mail
	// failure must not fail the webhook (Stripe would retry the whole
	// event and we'd re-revert plan needlessly).
	s.sendWinBackEmail(ctx, user)
	return nil
}

// sendWinBackEmail sends a single post-cancellation email if the user has an
// address and hasn't opted out of commercial email. Every failure is logged
// and swallowed — this is fire-and-forget courtesy, not a critical path.
func (s *BillingService) sendWinBackEmail(ctx context.Context, user *model.User) {
	if s.mailer == nil || user.Email == nil || *user.Email == "" {
		return
	}
	unsub, err := s.repo.IsEmailUnsubscribed(ctx, user.ID)
	if err != nil {
		slog.Error("win-back: unsubscribe check failed", "err", err, "user_id", user.ID)
		return
	}
	if unsub {
		slog.Info("win-back: suppressed (user unsubscribed)", "user_id", user.ID)
		return
	}

	unsubURL := UnsubscribeURL(user.ID)
	html := fmt.Sprintf(`<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#1a1a1a">
<h1 style="font-size:22px;font-weight:600">Sorry to see you go.</h1>
<p style="font-size:15px;line-height:1.6">Your MapleRewards Pro subscription is cancelled — you won't be charged again, and your wallet, spend history, and saved trips stay exactly where they are.</p>
<p style="font-size:15px;line-height:1.6">If a missed-rewards report or an Aeroplan window ever pulls you back, your account is one click from Pro again:</p>
<p style="margin:24px 0"><a href="%s/pricing" style="background:#7A1F2B;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px">Reactivate Pro</a></p>
<p style="font-size:13px;line-height:1.6;color:#666">We'd genuinely value one line on what made you leave — just reply to this email.</p>
<hr style="border:none;border-top:1px solid #e5e5e5;margin:28px 0">
<p style="font-size:12px;color:#999;line-height:1.5">You're receiving this once because you just cancelled a paid MapleRewards plan. We won't email you about this again. <a href="%s" style="color:#999">Unsubscribe from all MapleRewards emails</a>.</p>
</div>`, frontendBase(), unsubURL)

	text := fmt.Sprintf("Sorry to see you go.\n\nYour MapleRewards Pro subscription is cancelled — you won't be charged again, and your data stays put.\n\nReactivate any time: %s/pricing\n\nWe'd value a line on what made you leave — just reply.\n\n—\nYou're receiving this once because you just cancelled. Unsubscribe from all emails: %s\n",
		frontendBase(), unsubURL)

	if err := s.mailer.Send(ctx, MailMessage{
		To:      []string{*user.Email},
		Subject: "Your MapleRewards Pro subscription is cancelled",
		HTML:    html,
		Text:    text,
		Tag:     "win-back",
	}); err != nil {
		slog.Error("win-back: send failed", "err", err, "user_id", user.ID)
		return
	}
	slog.Info("win-back email sent", "user_id", user.ID)
}

// GetWebhookSecret returns the configured webhook secret for signature verification.
func (s *BillingService) GetWebhookSecret() string {
	return s.webhookSecret
}

// RecordEvent persists the Stripe event ID for idempotency. Returns true if
// the event is new and should be processed, false if it has already been seen.
// CALL THIS ONLY AFTER successful event processing — see IsEventProcessed for
// the read-only check used at the start of the webhook.
func (s *BillingService) RecordEvent(ctx context.Context, eventID, eventType string) (bool, error) {
	return s.repo.RecordStripeEvent(ctx, eventID, eventType)
}

// IsEventProcessed is the read-only short-circuit at the top of the webhook
// handler. Returns true if the event ID is already in stripe_events.
// Separating this from RecordEvent (which writes) means a failed processing
// pass does NOT mark the event as done — Stripe's retry will re-attempt
// processing instead of being silently dropped as a duplicate.
func (s *BillingService) IsEventProcessed(ctx context.Context, eventID string) (bool, error) {
	return s.repo.IsStripeEventProcessed(ctx, eventID)
}

// DeleteEvent compensates for a failed webhook handler: removes the dedup
// row that was inserted up-front so Stripe's retry can re-process the event.
// Called by the handler in the error path; safe to call when the row is
// already gone (treats DELETE as idempotent).
func (s *BillingService) DeleteEvent(ctx context.Context, eventID string) error {
	return s.repo.DeleteStripeEvent(ctx, eventID)
}
