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
	planStatus      map[string]string      // user ID → plan tier
	processedEvents map[string]bool        // stripe event ID → processed flag
	unsubscribed    map[string]bool        // user ID → opted out of email
	failSetPro      bool
}

func newMockBillingRepo() *mockBillingRepo {
	return &mockBillingRepo{
		users:           map[string]*model.User{},
		customerToUser:  map[string]string{},
		proStatus:       map[string]bool{},
		planStatus:      map[string]string{},
		processedEvents: map[string]bool{},
		unsubscribed:    map[string]bool{},
	}
}

func (m *mockBillingRepo) IsEmailUnsubscribed(_ context.Context, userID string) (bool, error) {
	return m.unsubscribed[userID], nil
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

func (m *mockBillingRepo) SetUserPlan(ctx context.Context, userID, plan string) error {
	if m.failSetPro {
		return errors.New("db error")
	}
	m.planStatus[userID] = plan
	m.proStatus[userID] = plan != "free"
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

func (m *mockBillingRepo) DeleteStripeEvent(ctx context.Context, eventID string) error {
	delete(m.processedEvents, eventID)
	return nil
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

// ── Idempotency: the Phase 2.1 reserve-then-work-then-rollback contract ────
// These pin the behaviour that prevents a Stripe retry from double-granting
// Pro. The handler orchestrates RecordEvent → HandleWebhookEvent → (on fail)
// DeleteEvent; these tests exercise the service primitives that back it.

func TestBillingWebhook_RecordEvent_DuplicateReturnsFalse(t *testing.T) {
	repo := newMockBillingRepo()
	svc := newBillingSvc(repo)
	ctx := context.Background()

	first, err := svc.RecordEvent(ctx, "evt_123", "checkout.session.completed")
	if err != nil || !first {
		t.Fatalf("first RecordEvent should reserve the row: ok=%v err=%v", first, err)
	}
	second, err := svc.RecordEvent(ctx, "evt_123", "checkout.session.completed")
	if err != nil {
		t.Fatalf("second RecordEvent errored: %v", err)
	}
	if second {
		t.Fatal("duplicate event must return false so the handler short-circuits with 200")
	}
}

func TestBillingWebhook_FailedProcessing_RollbackAllowsRetry(t *testing.T) {
	repo := newMockBillingRepo()
	svc := newBillingSvc(repo)
	ctx := context.Background()

	// Reserve the row, simulate a processing failure, roll back.
	if ok, _ := svc.RecordEvent(ctx, "evt_fail", "checkout.session.completed"); !ok {
		t.Fatal("expected to reserve the row")
	}
	if err := svc.DeleteEvent(ctx, "evt_fail"); err != nil {
		t.Fatalf("DeleteEvent (rollback) errored: %v", err)
	}
	// Stripe retries the same event — it MUST be re-processable now.
	again, err := svc.RecordEvent(ctx, "evt_fail", "checkout.session.completed")
	if err != nil || !again {
		t.Fatalf("after rollback the retry must re-reserve: ok=%v err=%v", again, err)
	}
}

func TestBillingWebhook_DoubleDelivery_SingleProGrant(t *testing.T) {
	repo := newMockBillingRepo()
	repo.users["user-9"] = &model.User{ID: "user-9"}
	svc := newBillingSvc(repo)
	ctx := context.Background()
	body := json.RawMessage(`{"client_reference_id":"user-9","customer":"cus_9"}`)

	// First delivery: reserve, then process.
	if ok, _ := svc.RecordEvent(ctx, "evt_dup", "checkout.session.completed"); !ok {
		t.Fatal("first delivery should reserve")
	}
	if err := svc.HandleWebhookEvent(ctx, "checkout.session.completed", body); err != nil {
		t.Fatalf("first processing failed: %v", err)
	}
	if !repo.proStatus["user-9"] {
		t.Fatal("expected Pro granted after first delivery")
	}

	// Second delivery (Stripe retry): RecordEvent returns false → handler
	// would 200-skip. We assert the dedup gate holds; processing must NOT
	// run again.
	if ok, _ := svc.RecordEvent(ctx, "evt_dup", "checkout.session.completed"); ok {
		t.Fatal("duplicate delivery must NOT re-reserve — would allow a second grant")
	}
}
