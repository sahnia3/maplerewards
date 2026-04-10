package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
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
}

// BillingService handles Stripe billing logic.
type BillingService struct {
	repo           BillingRepository
	stripeKey      string
	webhookSecret  string
	priceMonthly   string
	priceAnnual    string
	successURL     string
	cancelURL      string
}

// NewBillingService creates a new billing service.
func NewBillingService(repo BillingRepository) *BillingService {
	frontendURL := os.Getenv("FRONTEND_URL")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	return &BillingService{
		repo:          repo,
		stripeKey:     os.Getenv("STRIPE_SECRET_KEY"),
		webhookSecret: os.Getenv("STRIPE_WEBHOOK_SECRET"),
		priceMonthly:  os.Getenv("STRIPE_PRICE_ID_MONTHLY"),
		priceAnnual:   os.Getenv("STRIPE_PRICE_ID_ANNUAL"),
		successURL:    frontendURL + "/pricing?success=true",
		cancelURL:     frontendURL + "/pricing?canceled=true",
	}
}

// CreateCheckoutSession creates a Stripe Checkout session via the Stripe API.
// Uses raw HTTP calls to avoid adding the stripe-go SDK dependency.
func (s *BillingService) CreateCheckoutSession(ctx context.Context, userID, interval string) (*model.CheckoutSession, error) {
	if s.stripeKey == "" {
		return nil, fmt.Errorf("stripe not configured")
	}

	// Determine price ID
	priceID := s.priceMonthly
	if interval == "annual" || interval == "year" {
		priceID = s.priceAnnual
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

	// Build Stripe Checkout Session params
	params := fmt.Sprintf(
		"mode=subscription&success_url=%s&cancel_url=%s&line_items[0][price]=%s&line_items[0][quantity]=1&client_reference_id=%s",
		s.successURL, s.cancelURL, priceID, userID,
	)

	// If user already has a Stripe customer ID, use it
	if user.StripeCustomerID != nil && *user.StripeCustomerID != "" {
		params += "&customer=" + *user.StripeCustomerID
	} else {
		// Pre-fill email for new customers
		if user.Email != nil && *user.Email != "" {
			params += "&customer_email=" + *user.Email
		}
		// Allow promotion codes
		params += "&allow_promotion_codes=true"
	}

	// Create checkout session via Stripe API
	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.stripe.com/v1/checkout/sessions", strings.NewReader(params))
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

	body, _ := io.ReadAll(resp.Body)

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
	}
	if err := json.Unmarshal(data, &session); err != nil {
		return fmt.Errorf("parse checkout session: %w", err)
	}

	userID := session.ClientReferenceID
	if userID == "" {
		slog.Warn("checkout completed without client_reference_id")
		return nil
	}

	// Save Stripe customer ID
	if session.Customer != "" {
		if err := s.repo.SetStripeCustomerID(ctx, userID, session.Customer); err != nil {
			slog.Error("failed to save stripe customer id", "err", err, "user_id", userID)
		}
	}

	// Activate Pro
	if err := s.repo.SetUserPro(ctx, userID, true); err != nil {
		return fmt.Errorf("activate pro for user %s: %w", userID, err)
	}

	slog.Info("user upgraded to pro", "user_id", userID, "customer", session.Customer)
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

	if err := s.repo.SetUserPro(ctx, user.ID, false); err != nil {
		return fmt.Errorf("deactivate pro: %w", err)
	}

	slog.Info("subscription canceled, pro deactivated", "user_id", user.ID)
	return nil
}

// GetWebhookSecret returns the configured webhook secret for signature verification.
func (s *BillingService) GetWebhookSecret() string {
	return s.webhookSecret
}
