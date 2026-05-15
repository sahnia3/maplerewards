package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"maplerewards/internal/model"
)

// ── Mock ──────────────────────────────────────────────────────────────────

type mockBillingRepo struct {
	users           map[string]*model.User // keyed by user ID
	customerToUser  map[string]string      // stripe customer ID → user ID
	proStatus       map[string]bool        // user ID → is_pro
	processedEvents map[string]bool        // stripe event ID → processed flag
	failSetPro      bool
}

func newMockBillingRepo() *mockBillingRepo {
	return &mockBillingRepo{
		users:           map[string]*model.User{},
		customerToUser:  map[string]string{},
		proStatus:       map[string]bool{},
		processedEvents: map[string]bool{},
	}
}

func (m *mockBillingRepo) GetUserByID(ctx context.Context, id string) (*model.User, error) {
	u, ok := m.users[id]
	if !ok {
		return nil, errors.New("not found")
	}
	return u, nil
}

func (m *mockBillingRepo) GetUserByStripeCustomerID(ctx context.Context, customerID string) (*model.User, error) {
	uid, ok := m.customerToUser[customerID]
	if !ok {
		return nil, nil // service treats nil-no-error as "unknown customer, ignore"
	}
	return m.users[uid], nil
}

func (m *mockBillingRepo) SetStripeCustomerID(ctx context.Context, userID, customerID string) error {
	m.customerToUser[customerID] = userID
	return nil
}

func (m *mockBillingRepo) SetUserPro(ctx context.Context, userID string, isPro bool) error {
	if m.failSetPro {
		return errors.New("db error")
	}
	m.proStatus[userID] = isPro
	return nil
}

func (m *mockBillingRepo) RecordStripeEvent(ctx context.Context, eventID, eventType string) (bool, error) {
	if m.processedEvents[eventID] {
		return false, nil
	}
	m.processedEvents[eventID] = true
	return true, nil
}

func (m *mockBillingRepo) IsStripeEventProcessed(ctx context.Context, eventID string) (bool, error) {
	return m.processedEvents[eventID], nil
}

func newBillingSvc(repo *mockBillingRepo) *BillingService {
	return &BillingService{repo: repo}
}

// ── Tests ─────────────────────────────────────────────────────────────────

func TestBillingWebhook_CheckoutCompleted_ActivatesPro(t *testing.T) {
	repo := newMockBillingRepo()
	repo.users["user-1"] = &model.User{ID: "user-1"}

	body, _ := json.Marshal(map[string]string{
		"client_reference_id": "user-1",
		"customer":            "cus_abc",
		"subscription":        "sub_xyz",
	})

	err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "checkout.session.completed", body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.proStatus["user-1"] {
		t.Fatal("expected user-1 to be Pro after checkout.session.completed")
	}
	if repo.customerToUser["cus_abc"] != "user-1" {
		t.Fatalf("expected stripe customer mapped to user-1, got %q", repo.customerToUser["cus_abc"])
	}
}

func TestBillingWebhook_CheckoutCompleted_NoClientRef_NoOp(t *testing.T) {
	repo := newMockBillingRepo()
	body, _ := json.Marshal(map[string]string{"customer": "cus_abc"})
	err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "checkout.session.completed", body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.proStatus) != 0 {
		t.Fatal("expected no pro status set when client_reference_id is missing")
	}
}

func TestBillingWebhook_CheckoutCompleted_DBError_Propagates(t *testing.T) {
	repo := newMockBillingRepo()
	repo.users["user-1"] = &model.User{ID: "user-1"}
	repo.failSetPro = true
	body, _ := json.Marshal(map[string]string{"client_reference_id": "user-1", "customer": "cus_abc"})
	err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "checkout.session.completed", body)
	if err == nil {
		t.Fatal("expected error when SetUserPro fails")
	}
}

func TestBillingWebhook_SubscriptionUpdated_ActiveKeepsPro(t *testing.T) {
	repo := newMockBillingRepo()
	repo.users["user-1"] = &model.User{ID: "user-1"}
	repo.customerToUser["cus_abc"] = "user-1"

	body, _ := json.Marshal(map[string]string{"customer": "cus_abc", "status": "active"})
	if err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "customer.subscription.updated", body); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.proStatus["user-1"] {
		t.Fatal("expected Pro=true on active subscription")
	}
}

func TestBillingWebhook_SubscriptionUpdated_TrialingKeepsPro(t *testing.T) {
	repo := newMockBillingRepo()
	repo.users["user-1"] = &model.User{ID: "user-1"}
	repo.customerToUser["cus_abc"] = "user-1"

	body, _ := json.Marshal(map[string]string{"customer": "cus_abc", "status": "trialing"})
	if err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "customer.subscription.updated", body); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !repo.proStatus["user-1"] {
		t.Fatal("expected Pro=true on trialing")
	}
}

func TestBillingWebhook_SubscriptionUpdated_CanceledRemovesPro(t *testing.T) {
	repo := newMockBillingRepo()
	repo.users["user-1"] = &model.User{ID: "user-1"}
	repo.customerToUser["cus_abc"] = "user-1"
	repo.proStatus["user-1"] = true

	body, _ := json.Marshal(map[string]string{"customer": "cus_abc", "status": "canceled"})
	if err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "customer.subscription.updated", body); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.proStatus["user-1"] {
		t.Fatal("expected Pro=false on canceled")
	}
}

func TestBillingWebhook_SubscriptionUpdated_PastDueRemovesPro(t *testing.T) {
	repo := newMockBillingRepo()
	repo.users["user-1"] = &model.User{ID: "user-1"}
	repo.customerToUser["cus_abc"] = "user-1"
	repo.proStatus["user-1"] = true

	body, _ := json.Marshal(map[string]string{"customer": "cus_abc", "status": "past_due"})
	if err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "customer.subscription.updated", body); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.proStatus["user-1"] {
		t.Fatal("expected Pro=false on past_due")
	}
}

func TestBillingWebhook_SubscriptionUpdated_UnknownCustomer_NoOp(t *testing.T) {
	repo := newMockBillingRepo()
	body, _ := json.Marshal(map[string]string{"customer": "cus_unknown", "status": "active"})
	if err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "customer.subscription.updated", body); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(repo.proStatus) != 0 {
		t.Fatal("expected no pro status mutation for unknown customer")
	}
}

func TestBillingWebhook_SubscriptionDeleted_RemovesPro(t *testing.T) {
	repo := newMockBillingRepo()
	repo.users["user-1"] = &model.User{ID: "user-1"}
	repo.customerToUser["cus_abc"] = "user-1"
	repo.proStatus["user-1"] = true

	body, _ := json.Marshal(map[string]string{"customer": "cus_abc"})
	if err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "customer.subscription.deleted", body); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if repo.proStatus["user-1"] {
		t.Fatal("expected Pro=false on subscription deleted")
	}
}

func TestBillingWebhook_UnknownEvent_Ignored(t *testing.T) {
	repo := newMockBillingRepo()
	err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "invoice.created", json.RawMessage(`{}`))
	if err != nil {
		t.Fatalf("expected unknown events to be no-op, got %v", err)
	}
}

func TestBillingWebhook_MalformedJSON_Errors(t *testing.T) {
	repo := newMockBillingRepo()
	err := newBillingSvc(repo).HandleWebhookEvent(context.Background(), "checkout.session.completed", json.RawMessage(`not-json`))
	if err == nil {
		t.Fatal("expected error on malformed JSON payload")
	}
}
