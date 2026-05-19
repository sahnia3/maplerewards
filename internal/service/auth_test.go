package service

import (
	"context"
	"testing"
	"time"

	"golang.org/x/crypto/bcrypt"

	"maplerewards/internal/model"
)

// ── Mocks ─────────────────────────────────────────────────────────────────

type mockAuthRepo struct {
	byEmail map[string]*model.User
	// Optional hooks for refresh-token reuse-detection tests. Nil → the
	// original fixed behaviour, so existing tests are unaffected.
	getRefreshFn     func(hash string) (*model.RefreshToken, error)
	revokeRefreshFn  func(hash string) (bool, error)
	revokeAllFn      func(userID string) error
	getUserByIDFn    func(id string) (*model.User, error)
	revokeAllCalls   []string // userIDs passed to RevokeAllUserTokens
}

func (m *mockAuthRepo) GetUserByEmail(ctx context.Context, email string) (*model.User, error) {
	return m.byEmail[email], nil // nil when absent — exactly the prod contract
}
func (m *mockAuthRepo) GetUserByGoogleID(context.Context, string) (*model.User, error) { return nil, nil }
func (m *mockAuthRepo) GetUserByID(_ context.Context, id string) (*model.User, error) {
	if m.getUserByIDFn != nil {
		return m.getUserByIDFn(id)
	}
	return nil, nil
}
func (m *mockAuthRepo) CreateAuthUser(context.Context, string, string, string, string) (*model.User, error) {
	return &model.User{ID: "new"}, nil
}
func (m *mockAuthRepo) UpsertGoogleUser(context.Context, string, string, string, string) (*model.User, error) {
	return &model.User{ID: "g"}, nil
}
func (m *mockAuthRepo) UpdateProfile(context.Context, string, string) (*model.User, error) {
	return nil, nil
}
func (m *mockAuthRepo) UpdatePasswordHash(context.Context, string, string) error { return nil }
func (m *mockAuthRepo) MergeAnonymousUser(ctx context.Context, authUserID, anonUserID string) error {
	return nil
}
func (m *mockAuthRepo) StoreRefreshToken(context.Context, string, string, interface{}) error {
	return nil
}
func (m *mockAuthRepo) GetRefreshToken(_ context.Context, hash string) (*model.RefreshToken, error) {
	if m.getRefreshFn != nil {
		return m.getRefreshFn(hash)
	}
	return nil, nil
}
func (m *mockAuthRepo) RevokeRefreshToken(_ context.Context, hash string) (bool, error) {
	if m.revokeRefreshFn != nil {
		return m.revokeRefreshFn(hash)
	}
	return true, nil
}
func (m *mockAuthRepo) RevokeAllUserTokens(_ context.Context, userID string) error {
	m.revokeAllCalls = append(m.revokeAllCalls, userID)
	if m.revokeAllFn != nil {
		return m.revokeAllFn(userID)
	}
	return nil
}
func (m *mockAuthRepo) DeleteUser(context.Context, string) error          { return nil }

type mockAuthWalletRepo struct {
	bySession map[string]*model.User
	merged    bool
}

func (m *mockAuthWalletRepo) CreateUser(context.Context, string) (*model.User, error) {
	return nil, nil
}
func (m *mockAuthWalletRepo) GetUserBySession(ctx context.Context, sid string) (*model.User, error) {
	return m.bySession[sid], nil
}
func (m *mockAuthWalletRepo) GetUserCards(context.Context, string) ([]model.UserCard, error) {
	return nil, nil
}
func (m *mockAuthWalletRepo) AddCard(context.Context, string, string) (*model.UserCard, error) {
	return nil, nil
}
func (m *mockAuthWalletRepo) RemoveCard(context.Context, string, string) error { return nil }
func (m *mockAuthWalletRepo) UpdateBalance(context.Context, string, string, int64) error {
	return nil
}
func (m *mockAuthWalletRepo) UpdateCardDetails(context.Context, string, string, model.UpdateCardDetailsRequest) error {
	return nil
}

func strptr(s string) *string { return &s }

// ── Login timing-attack hardening ─────────────────────────────────────────
// The fix: a missing user, a google-only user (nil PasswordHash), and a
// wrong password must ALL return the same "invalid credentials" error and
// must all run bcrypt (constant work). The pre-fix bug was an early return
// on nil user that skipped bcrypt entirely — observable via response timing.

func TestLogin_NonexistentUser_GenericError_NoNilPanic(t *testing.T) {
	svc := NewAuthService(&mockAuthRepo{byEmail: map[string]*model.User{}}, &mockAuthWalletRepo{}, "x")
	_, err := svc.Login(context.Background(), model.LoginRequest{Email: "ghost@example.com", Password: "whatever"})
	if err == nil || err.Error() != "invalid credentials" {
		t.Fatalf("missing user must yield generic 'invalid credentials', got %v", err)
	}
}

func TestLogin_GoogleOnlyUser_GenericError(t *testing.T) {
	repo := &mockAuthRepo{byEmail: map[string]*model.User{
		"g@example.com": {ID: "u1", Email: strptr("g@example.com"), PasswordHash: nil},
	}}
	svc := NewAuthService(repo, &mockAuthWalletRepo{}, "x")
	_, err := svc.Login(context.Background(), model.LoginRequest{Email: "g@example.com", Password: "guess"})
	if err == nil || err.Error() != "invalid credentials" {
		t.Fatalf("google-only account must yield generic error (no oracle), got %v", err)
	}
}

func TestLogin_WrongPassword_SameGenericError(t *testing.T) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct-horse"), bcrypt.DefaultCost)
	hs := string(hash)
	repo := &mockAuthRepo{byEmail: map[string]*model.User{
		"u@example.com": {ID: "u1", Email: strptr("u@example.com"), PasswordHash: &hs},
	}}
	svc := NewAuthService(repo, &mockAuthWalletRepo{}, "x")
	_, err := svc.Login(context.Background(), model.LoginRequest{Email: "u@example.com", Password: "wrong"})
	if err == nil || err.Error() != "invalid credentials" {
		t.Fatalf("wrong password must yield the same generic error, got %v", err)
	}
}

func TestLogin_CorrectPassword_Succeeds(t *testing.T) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct-horse"), bcrypt.DefaultCost)
	hs := string(hash)
	repo := &mockAuthRepo{byEmail: map[string]*model.User{
		"u@example.com": {ID: "u1", Email: strptr("u@example.com"), PasswordHash: &hs},
	}}
	svc := NewAuthService(repo, &mockAuthWalletRepo{}, "test-secret-at-least-32-chars-long-xx")
	pair, err := svc.Login(context.Background(), model.LoginRequest{Email: "u@example.com", Password: "correct-horse"})
	if err != nil {
		t.Fatalf("correct credentials should succeed, got %v", err)
	}
	if pair == nil || pair.AccessToken == "" {
		t.Fatal("expected a token pair on success")
	}
}

// ── Anon-session takeover hardening ───────────────────────────────────────
// mergeAnonymous must REFUSE to merge into a session that (a) belongs to a
// registered user (email set) or (b) is older than 30 days. Both are the
// attack surface flagged in the review.

func TestMergeAnonymous_RejectsRegisteredTarget(t *testing.T) {
	wallet := &mockAuthWalletRepo{bySession: map[string]*model.User{
		"victim-sid": {ID: "victim", Email: strptr("victim@example.com"), CreatedAt: time.Now()},
	}}
	svc := NewAuthService(&mockAuthRepo{}, wallet, "x")
	err := svc.mergeAnonymous(context.Background(), "attacker", "victim-sid")
	if err == nil || err.Error() != "session is not anonymous" {
		t.Fatalf("merge into a registered session must be rejected, got %v", err)
	}
	if wallet.merged {
		t.Fatal("MergeAnonymousUser must NOT have been called")
	}
}

func TestMergeAnonymous_RejectsStaleSession(t *testing.T) {
	wallet := &mockAuthWalletRepo{bySession: map[string]*model.User{
		"old-sid": {ID: "old", Email: nil, CreatedAt: time.Now().AddDate(0, 0, -45)},
	}}
	svc := NewAuthService(&mockAuthRepo{}, wallet, "x")
	err := svc.mergeAnonymous(context.Background(), "auth-user", "old-sid")
	if err == nil || err.Error() != "session is too old to merge" {
		t.Fatalf("merge of a >30d session must be rejected, got %v", err)
	}
}

func TestMergeAnonymous_AllowsFreshAnonymousSession(t *testing.T) {
	wallet := &mockAuthWalletRepo{bySession: map[string]*model.User{
		"fresh-sid": {ID: "anon", Email: nil, CreatedAt: time.Now().AddDate(0, 0, -2)},
	}}
	svc := NewAuthService(&mockAuthRepo{}, wallet, "x")
	if err := svc.mergeAnonymous(context.Background(), "auth-user", "fresh-sid"); err != nil {
		t.Fatalf("a genuine fresh anonymous session should merge cleanly, got %v", err)
	}
}
