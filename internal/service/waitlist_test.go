package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"maplerewards/internal/repo"
)

// mockWaitlistRepo implements WaitlistRepository with function fields.
type mockWaitlistRepo struct {
	insertFn         func(ctx context.Context, email, referralCode string, referredBy, source *string) (*repo.WaitlistSignup, bool, error)
	countBeforeFn    func(ctx context.Context, createdAt time.Time) (int, error)
	countReferralsFn func(ctx context.Context, code string) (int, error)
	countTotalFn     func(ctx context.Context) (int, error)
	codeExistsFn     func(ctx context.Context, code string) (bool, error)
}

func (m *mockWaitlistRepo) Insert(ctx context.Context, email, referralCode string, referredBy, source *string) (*repo.WaitlistSignup, bool, error) {
	return m.insertFn(ctx, email, referralCode, referredBy, source)
}
func (m *mockWaitlistRepo) CountBefore(ctx context.Context, createdAt time.Time) (int, error) {
	return m.countBeforeFn(ctx, createdAt)
}
func (m *mockWaitlistRepo) CountReferrals(ctx context.Context, code string) (int, error) {
	return m.countReferralsFn(ctx, code)
}
func (m *mockWaitlistRepo) CountTotal(ctx context.Context) (int, error) {
	return m.countTotalFn(ctx)
}
func (m *mockWaitlistRepo) CodeExists(ctx context.Context, code string) (bool, error) {
	return m.codeExistsFn(ctx, code)
}

// happyWaitlistRepo returns a mock whose Insert echoes back a fresh row and
// whose counts are fixed. Tests override individual fields as needed.
func happyWaitlistRepo() *mockWaitlistRepo {
	return &mockWaitlistRepo{
		insertFn: func(_ context.Context, email, code string, referredBy, source *string) (*repo.WaitlistSignup, bool, error) {
			return &repo.WaitlistSignup{
				ID: "id-1", Email: email, ReferralCode: code,
				ReferredBy: referredBy, Source: source,
				CreatedAt: time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC),
			}, true, nil
		},
		countBeforeFn:    func(context.Context, time.Time) (int, error) { return 41, nil },
		countReferralsFn: func(context.Context, string) (int, error) { return 2, nil },
		countTotalFn:     func(context.Context) (int, error) { return 100, nil },
		codeExistsFn:     func(context.Context, string) (bool, error) { return false, nil },
	}
}

func TestWaitlistJoin_EmailValidation(t *testing.T) {
	svc := NewWaitlistService(happyWaitlistRepo())
	for _, bad := range []string{
		"", "   ", "not-an-email", "no-at-sign.com", "two@@ats.com",
		"spaces in@mail.com", "noslash@domain", "@nodomain.com", "user@.com",
	} {
		if _, err := svc.Join(context.Background(), bad, "", ""); !errors.Is(err, ErrInvalidWaitlistEmail) {
			t.Errorf("Join(%q): want ErrInvalidWaitlistEmail, got %v", bad, err)
		}
	}

	res, err := svc.Join(context.Background(), "valid@example.com", "", "")
	if err != nil {
		t.Fatalf("Join(valid): unexpected error %v", err)
	}
	if res.Position != 42 || res.Total != 100 || res.ReferralCount != 2 || !res.Created {
		t.Errorf("unexpected result: %+v", res)
	}
	if len(res.ReferralCode) != 8 {
		t.Errorf("referral code = %q, want 8 hex chars", res.ReferralCode)
	}
}

func TestWaitlistJoin_NormalizesEmailLowercase(t *testing.T) {
	var gotEmail string
	mock := happyWaitlistRepo()
	base := mock.insertFn
	mock.insertFn = func(ctx context.Context, email, code string, referredBy, source *string) (*repo.WaitlistSignup, bool, error) {
		gotEmail = email
		return base(ctx, email, code, referredBy, source)
	}
	svc := NewWaitlistService(mock)
	if _, err := svc.Join(context.Background(), "  Mixed.Case@Example.COM ", "", ""); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotEmail != "mixed.case@example.com" {
		t.Errorf("inserted email = %q, want lowercased+trimmed", gotEmail)
	}
}

func TestWaitlistJoin_IdempotentRepeat(t *testing.T) {
	// Repeat signup: repo reports created=false and returns the ORIGINAL
	// row — the service must surface the original referral code and the
	// position derived from the original created_at, with Created=false.
	originalCreated := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	mock := happyWaitlistRepo()
	mock.insertFn = func(context.Context, string, string, *string, *string) (*repo.WaitlistSignup, bool, error) {
		return &repo.WaitlistSignup{
			ID: "id-orig", Email: "dupe@example.com",
			ReferralCode: "aaaa1111", CreatedAt: originalCreated,
		}, false, nil
	}
	mock.countBeforeFn = func(_ context.Context, createdAt time.Time) (int, error) {
		if !createdAt.Equal(originalCreated) {
			t.Errorf("CountBefore called with %v, want original created_at %v", createdAt, originalCreated)
		}
		return 6, nil
	}
	mock.countReferralsFn = func(_ context.Context, code string) (int, error) {
		if code != "aaaa1111" {
			t.Errorf("CountReferrals called with %q, want the original code", code)
		}
		return 3, nil
	}

	svc := NewWaitlistService(mock)
	res, err := svc.Join(context.Background(), "dupe@example.com", "", "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if res.Created {
		t.Error("repeat signup reported Created=true, want false")
	}
	if res.ReferralCode != "aaaa1111" {
		t.Errorf("referral code = %q, want the original aaaa1111", res.ReferralCode)
	}
	if res.Position != 7 || res.ReferralCount != 3 {
		t.Errorf("position/referrals = %d/%d, want 7/3", res.Position, res.ReferralCount)
	}
}

func TestWaitlistJoin_ReferralResolution(t *testing.T) {
	var gotReferredBy *string
	mock := happyWaitlistRepo()
	base := mock.insertFn
	mock.insertFn = func(ctx context.Context, email, code string, referredBy, source *string) (*repo.WaitlistSignup, bool, error) {
		gotReferredBy = referredBy
		return base(ctx, email, code, referredBy, source)
	}
	mock.codeExistsFn = func(_ context.Context, code string) (bool, error) {
		return code == "beef0042", nil
	}
	svc := NewWaitlistService(mock)

	// Known code (uppercase in the URL) is normalized and credited.
	if _, err := svc.Join(context.Background(), "a@example.com", "BEEF0042", ""); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotReferredBy == nil || *gotReferredBy != "beef0042" {
		t.Errorf("referred_by = %v, want beef0042", gotReferredBy)
	}

	// Unknown code is dropped silently — signup still succeeds.
	if _, err := svc.Join(context.Background(), "b@example.com", "nope9999", ""); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotReferredBy != nil {
		t.Errorf("unknown ref code should yield nil referred_by, got %v", *gotReferredBy)
	}

	// A lookup failure must not block the signup either.
	mock.codeExistsFn = func(context.Context, string) (bool, error) {
		return false, errors.New("db down")
	}
	if _, err := svc.Join(context.Background(), "c@example.com", "beef0042", ""); err != nil {
		t.Fatalf("ref lookup failure must not fail the signup: %v", err)
	}
	if gotReferredBy != nil {
		t.Errorf("failed ref lookup should yield nil referred_by, got %v", *gotReferredBy)
	}
}

func TestWaitlistJoin_RetriesOnInsertError(t *testing.T) {
	calls := 0
	codes := map[string]bool{}
	mock := happyWaitlistRepo()
	mock.insertFn = func(_ context.Context, email, code string, referredBy, source *string) (*repo.WaitlistSignup, bool, error) {
		calls++
		codes[code] = true
		if calls < 3 {
			return nil, false, errors.New("duplicate key value violates unique constraint \"waitlist_signups_referral_code_key\"")
		}
		return &repo.WaitlistSignup{
			ID: "id-1", Email: email, ReferralCode: code, CreatedAt: time.Now(),
		}, true, nil
	}
	svc := NewWaitlistService(mock)
	res, err := svc.Join(context.Background(), "retry@example.com", "", "")
	if err != nil {
		t.Fatalf("expected third attempt to succeed, got %v", err)
	}
	if calls != 3 {
		t.Errorf("insert attempts = %d, want 3", calls)
	}
	if len(codes) != 3 {
		t.Errorf("each retry should mint a fresh code; saw %d distinct codes", len(codes))
	}
	if !res.Created {
		t.Error("want Created=true on eventual success")
	}
}
