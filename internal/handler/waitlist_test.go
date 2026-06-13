package handler

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"maplerewards/internal/repo"
	"maplerewards/internal/service"
)

// waitlistRepoStub implements service.WaitlistRepository with function fields.
// It simulates the real ON CONFLICT semantics: the first Insert for an email
// creates a row, repeats return the SAME row with created=false.
type waitlistRepoStub struct {
	rows map[string]*repo.WaitlistSignup // keyed by email
}

func newWaitlistRepoStub() *waitlistRepoStub {
	return &waitlistRepoStub{rows: map[string]*repo.WaitlistSignup{}}
}

func (s *waitlistRepoStub) Insert(_ context.Context, email, referralCode string, referredBy, source *string) (*repo.WaitlistSignup, bool, error) {
	if existing, ok := s.rows[email]; ok {
		return existing, false, nil
	}
	row := &repo.WaitlistSignup{
		ID: "id-" + email, Email: email, ReferralCode: referralCode,
		ReferredBy: referredBy, Source: source,
		// Deterministic ordering: each new signup lands 1s after the last.
		CreatedAt: time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC).Add(time.Duration(len(s.rows)) * time.Second),
	}
	s.rows[email] = row
	return row, true, nil
}

func (s *waitlistRepoStub) CountBefore(_ context.Context, createdAt time.Time) (int, error) {
	n := 0
	for _, r := range s.rows {
		if r.CreatedAt.Before(createdAt) {
			n++
		}
	}
	return n, nil
}

func (s *waitlistRepoStub) CountReferrals(_ context.Context, code string) (int, error) {
	n := 0
	for _, r := range s.rows {
		if r.ReferredBy != nil && *r.ReferredBy == code {
			n++
		}
	}
	return n, nil
}

func (s *waitlistRepoStub) CountTotal(context.Context) (int, error) { return len(s.rows), nil }

func (s *waitlistRepoStub) CodeExists(_ context.Context, code string) (bool, error) {
	for _, r := range s.rows {
		if r.ReferralCode == code {
			return true, nil
		}
	}
	return false, nil
}

func postWaitlist(t *testing.T, h *WaitlistHandler, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest("POST", "/api/v1/waitlist", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	h.Join(w, req)
	return w
}

func TestWaitlistJoin_CreatedThenIdempotent(t *testing.T) {
	h := NewWaitlistHandler(service.NewWaitlistService(newWaitlistRepoStub()))

	// First signup → 201 with the full payload shape.
	w := postWaitlist(t, h, `{"email":"first@example.com","source":"homepage"}`)
	if w.Code != 201 {
		t.Fatalf("first signup status = %d, want 201 (body: %s)", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	var first struct {
		Position      int    `json:"position"`
		ReferralCode  string `json:"referral_code"`
		ReferralCount int    `json:"referral_count"`
		Total         int    `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &first); err != nil {
		t.Fatalf("unmarshal 201 body: %v", err)
	}
	if first.Position != 1 || first.Total != 1 || first.ReferralCount != 0 {
		t.Errorf("unexpected 201 payload: %+v", first)
	}
	if len(first.ReferralCode) != 8 {
		t.Errorf("referral_code = %q, want 8 hex chars", first.ReferralCode)
	}

	// Repeat email → 200 with the SAME position and referral code.
	w = postWaitlist(t, h, `{"email":"First@Example.com"}`)
	if w.Code != 200 {
		t.Fatalf("repeat signup status = %d, want 200 (body: %s)", w.Code, w.Body.String())
	}
	var repeat struct {
		Position     int    `json:"position"`
		ReferralCode string `json:"referral_code"`
		Total        int    `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &repeat); err != nil {
		t.Fatalf("unmarshal 200 body: %v", err)
	}
	if repeat.Position != first.Position || repeat.ReferralCode != first.ReferralCode {
		t.Errorf("repeat payload diverged: got %+v, want position=%d code=%s",
			repeat, first.Position, first.ReferralCode)
	}
}

func TestWaitlistJoin_ReferralCredited(t *testing.T) {
	stub := newWaitlistRepoStub()
	h := NewWaitlistHandler(service.NewWaitlistService(stub))

	w := postWaitlist(t, h, `{"email":"referrer@example.com"}`)
	if w.Code != 201 {
		t.Fatalf("referrer signup status = %d, want 201", w.Code)
	}
	var referrer struct {
		ReferralCode string `json:"referral_code"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &referrer); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Friend signs up with the referrer's code; second friend with junk.
	w = postWaitlist(t, h, `{"email":"friend@example.com","ref":"`+referrer.ReferralCode+`"}`)
	if w.Code != 201 {
		t.Fatalf("friend signup status = %d, want 201", w.Code)
	}
	w = postWaitlist(t, h, `{"email":"stranger@example.com","ref":"bogus123"}`)
	if w.Code != 201 {
		t.Fatalf("signup with bogus ref status = %d, want 201 (bad refs are ignored)", w.Code)
	}

	// The referrer's repeat POST now reports 1 referral.
	w = postWaitlist(t, h, `{"email":"referrer@example.com"}`)
	if w.Code != 200 {
		t.Fatalf("repeat status = %d, want 200", w.Code)
	}
	var again struct {
		ReferralCount int `json:"referral_count"`
		Total         int `json:"total"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &again); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if again.ReferralCount != 1 || again.Total != 3 {
		t.Errorf("referral_count/total = %d/%d, want 1/3", again.ReferralCount, again.Total)
	}
}

func TestWaitlistJoin_BadRequests(t *testing.T) {
	h := NewWaitlistHandler(service.NewWaitlistService(newWaitlistRepoStub()))
	for name, body := range map[string]string{
		"empty body":    ``,
		"no email":      `{}`,
		"invalid email": `{"email":"not-an-email"}`,
		"bad json":      `{"email":`,
	} {
		w := postWaitlist(t, h, body)
		if w.Code != 400 {
			t.Errorf("%s: status = %d, want 400 (body: %s)", name, w.Code, w.Body.String())
		}
	}
}
