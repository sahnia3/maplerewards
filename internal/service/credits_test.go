package service

import (
	"context"
	"errors"
	"testing"

	"maplerewards/internal/model"
)

// ── Mocks ─────────────────────────────────────────────────────────────────

type mockCreditRepo struct {
	credits   []model.CardCreditStatus
	listErr   error
	upsertErr error
	upsertOut *model.CardCreditStatus
	// captured
	lastUserID, lastDefID, lastNote string
	lastAmount                      float64
	createErr                       error
	createdCardID, createdName, createdRecurrence string
	createdValue                    float64
}

func (m *mockCreditRepo) CreateUserCredit(ctx context.Context, userID, cardID, name, description string, valueCAD float64, recurrence string) error {
	if m.createErr != nil {
		return m.createErr
	}
	m.lastUserID = userID
	m.createdCardID = cardID
	m.createdName = name
	m.createdValue = valueCAD
	m.createdRecurrence = recurrence
	return nil
}

func (m *mockCreditRepo) ListUserCardCredits(ctx context.Context, userID string) ([]model.CardCreditStatus, error) {
	if m.listErr != nil {
		return nil, m.listErr
	}
	return m.credits, nil
}

func (m *mockCreditRepo) UpsertRedemption(ctx context.Context, userID, creditDefID string, amount float64, note string) (*model.CardCreditStatus, error) {
	m.lastUserID = userID
	m.lastDefID = creditDefID
	m.lastAmount = amount
	m.lastNote = note
	if m.upsertErr != nil {
		return nil, m.upsertErr
	}
	return m.upsertOut, nil
}

func newCreditsSvc(c *mockCreditRepo) *CreditsService {
	return NewCreditsService(&mockMissedWalletRepo{}, c)
}

// ── ListCredits ──────────────────────────────────────────────────────────

func TestCredits_List_PassesUserIDFromSession(t *testing.T) {
	c := &mockCreditRepo{credits: []model.CardCreditStatus{
		{CreditDefID: "def-1", Name: "Travel Credit", ValueCAD: 200, Status: "unused"},
	}}
	out, err := newCreditsSvc(c).ListCredits(context.Background(), "sess-abc")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out) != 1 || out[0].CreditDefID != "def-1" {
		t.Fatalf("expected 1 credit returned verbatim, got %+v", out)
	}
}

func TestCredits_List_ReturnsEmptySliceNotNil(t *testing.T) {
	// Repo returning nil should be normalised to [] so the JSON response is
	// `[]` instead of `null` — frontend assumes an array.
	c := &mockCreditRepo{credits: nil}
	out, err := newCreditsSvc(c).ListCredits(context.Background(), "sess")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if out == nil {
		t.Fatal("expected empty slice, got nil")
	}
	if len(out) != 0 {
		t.Fatalf("expected length 0, got %d", len(out))
	}
}

func TestCredits_List_PropagatesRepoError(t *testing.T) {
	c := &mockCreditRepo{listErr: errors.New("db down")}
	_, err := newCreditsSvc(c).ListCredits(context.Background(), "sess")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
}

func TestCredits_List_RejectsBadSession(t *testing.T) {
	// mockMissedWalletRepo returns error on empty sessionID.
	c := &mockCreditRepo{}
	_, err := newCreditsSvc(c).ListCredits(context.Background(), "")
	if err == nil {
		t.Fatal("expected error for empty session, got nil")
	}
}

// ── RecordRedemption ─────────────────────────────────────────────────────

func TestCredits_Record_HappyPath(t *testing.T) {
	want := &model.CardCreditStatus{CreditDefID: "def-1", RedeemedAmount: 50, Status: "partial"}
	c := &mockCreditRepo{upsertOut: want}
	got, err := newCreditsSvc(c).RecordRedemption(context.Background(), "sess", "def-1", model.CreditRedemptionRequest{
		RedeemedAmount: 50,
		Note:           "Hilton booking",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != want {
		t.Fatalf("expected service to return repo's value verbatim")
	}
	if c.lastUserID != "u1" {
		t.Fatalf("expected user id from session, got %q", c.lastUserID)
	}
	if c.lastDefID != "def-1" {
		t.Fatalf("expected credit def id passed through, got %q", c.lastDefID)
	}
	if c.lastAmount != 50 {
		t.Fatalf("expected amount 50, got %v", c.lastAmount)
	}
	if c.lastNote != "Hilton booking" {
		t.Fatalf("expected note passed through, got %q", c.lastNote)
	}
}

func TestCredits_Record_RejectsEmptyDefID(t *testing.T) {
	c := &mockCreditRepo{}
	_, err := newCreditsSvc(c).RecordRedemption(context.Background(), "sess", "", model.CreditRedemptionRequest{
		RedeemedAmount: 10,
	})
	if err == nil {
		t.Fatal("expected error for empty credit_def_id")
	}
	if c.lastDefID != "" {
		t.Fatal("repo should not have been called when def-id is empty")
	}
}

func TestCredits_Record_RejectsNegativeAmount(t *testing.T) {
	c := &mockCreditRepo{}
	_, err := newCreditsSvc(c).RecordRedemption(context.Background(), "sess", "def-1", model.CreditRedemptionRequest{
		RedeemedAmount: -5,
	})
	if err == nil {
		t.Fatal("expected error for negative amount")
	}
	if c.lastAmount != 0 {
		t.Fatal("repo should not have been called for negative amount")
	}
}

func TestCredits_Record_AcceptsZero(t *testing.T) {
	// Zero is valid — represents "I haven't used any of it yet" and still
	// creates a tracking row so the credit can show as "unused" in the UI.
	want := &model.CardCreditStatus{CreditDefID: "def-1", RedeemedAmount: 0, Status: "unused"}
	c := &mockCreditRepo{upsertOut: want}
	got, err := newCreditsSvc(c).RecordRedemption(context.Background(), "sess", "def-1", model.CreditRedemptionRequest{
		RedeemedAmount: 0,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Status != "unused" {
		t.Fatalf("expected status passthrough, got %q", got.Status)
	}
}

func TestCredits_Record_PropagatesRepoError(t *testing.T) {
	c := &mockCreditRepo{upsertErr: errors.New("constraint violation")}
	_, err := newCreditsSvc(c).RecordRedemption(context.Background(), "sess", "def-1", model.CreditRedemptionRequest{
		RedeemedAmount: 25,
	})
	if err == nil {
		t.Fatal("expected error from repo to bubble up")
	}
}

func TestCredits_Record_RejectsBadSession(t *testing.T) {
	c := &mockCreditRepo{}
	_, err := newCreditsSvc(c).RecordRedemption(context.Background(), "", "def-1", model.CreditRedemptionRequest{
		RedeemedAmount: 10,
	})
	if err == nil {
		t.Fatal("expected error for empty session, got nil")
	}
	if c.lastDefID != "" {
		t.Fatal("repo should not have been called when session lookup fails")
	}
}

// ── AddUserCredit (P2.6 self-log) ─────────────────────────────────────────

func TestAddUserCredit_Validation(t *testing.T) {
	cases := []struct {
		name string
		req  model.CreateCreditRequest
		ok   bool
	}{
		{"missing card", model.CreateCreditRequest{Name: "X", ValueCAD: 50}, false},
		{"missing name", model.CreateCreditRequest{CardID: "c1", ValueCAD: 50}, false},
		{"zero value", model.CreateCreditRequest{CardID: "c1", Name: "X", ValueCAD: 0}, false},
		{"bad recurrence", model.CreateCreditRequest{CardID: "c1", Name: "X", ValueCAD: 50, Recurrence: "weekly"}, false},
		{"valid default recurrence", model.CreateCreditRequest{CardID: "c1", Name: "Travel Credit", ValueCAD: 200}, true},
		{"valid quadrennial", model.CreateCreditRequest{CardID: "c1", Name: "NEXUS", ValueCAD: 100, Recurrence: "quadrennial"}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := &mockCreditRepo{}
			err := newCreditsSvc(c).AddUserCredit(context.Background(), "sess", tc.req)
			if tc.ok && err != nil {
				t.Fatalf("expected success, got %v", err)
			}
			if !tc.ok {
				if err == nil {
					t.Fatal("expected validation error, got nil")
				}
				if c.createdCardID != "" {
					t.Fatal("repo must not be called on invalid input")
				}
				return
			}
			if c.createdName != tc.req.Name || c.createdValue != tc.req.ValueCAD {
				t.Fatalf("repo got name=%q value=%.0f, want %q %.0f",
					c.createdName, c.createdValue, tc.req.Name, tc.req.ValueCAD)
			}
			wantRec := tc.req.Recurrence
			if wantRec == "" {
				wantRec = "annual"
			}
			if c.createdRecurrence != wantRec {
				t.Fatalf("recurrence = %q, want %q", c.createdRecurrence, wantRec)
			}
		})
	}
}

func TestAddUserCredit_EmptySessionRejected(t *testing.T) {
	c := &mockCreditRepo{}
	err := newCreditsSvc(c).AddUserCredit(context.Background(), "",
		model.CreateCreditRequest{CardID: "c1", Name: "X", ValueCAD: 50})
	if err == nil {
		t.Fatal("expected session error")
	}
	if c.createdCardID != "" {
		t.Fatal("repo must not be called when session lookup fails")
	}
}
