package service

import (
	"context"
	"sync/atomic"
	"testing"

	"maplerewards/internal/model"
)

// P0.2 regression suite (docs/LAUNCH-ISSUES.md): "set a balance → save →
// refresh → shows 0 again". Root causes were (a) async fire-and-forget cache
// invalidation racing the post-save refetch, (b) nil-user deref, (c) a stray
// empty/0 PUT silently zeroing. These tests pin the fixed behaviour.

// ── function-field mocks (per .claude/rules/go-tests.md) ────────────────────

type walletTestRepo struct {
	getUserBySession func(ctx context.Context, sid string) (*model.User, error)
	getUserCards     func(ctx context.Context, uid string) ([]model.UserCard, error)
	updateBalance    func(ctx context.Context, uid, cid string, bal int64) error
}

func (m *walletTestRepo) CreateUser(context.Context, string) (*model.User, error) { return nil, nil }
func (m *walletTestRepo) GetUserBySession(ctx context.Context, sid string) (*model.User, error) {
	return m.getUserBySession(ctx, sid)
}
func (m *walletTestRepo) GetUserCards(ctx context.Context, uid string) ([]model.UserCard, error) {
	return m.getUserCards(ctx, uid)
}
func (m *walletTestRepo) AddCard(context.Context, string, string) (*model.UserCard, error) {
	return nil, nil
}
func (m *walletTestRepo) RemoveCard(context.Context, string, string) error { return nil }
func (m *walletTestRepo) UpdateBalance(ctx context.Context, uid, cid string, bal int64) error {
	return m.updateBalance(ctx, uid, cid, bal)
}
func (m *walletTestRepo) UpdateCardDetails(context.Context, string, string, model.UpdateCardDetailsRequest) error {
	return nil
}

// walletTestCache is a real in-memory wallet cache so a stale-read-after-write
// is observable: if invalidation weren't synchronous, GetWallet would re-serve
// the pre-edit slice.
type walletTestCache struct {
	stored      []model.UserCard
	present     bool
	invalidates int64
}

func (c *walletTestCache) GetValuation(context.Context, string, string) (float64, error) {
	return 0, nil
}
func (c *walletTestCache) SetValuation(context.Context, string, string, float64) error { return nil }
func (c *walletTestCache) GetWallet(_ context.Context, _ string, dest any) error {
	if !c.present {
		return context.Canceled // any non-nil = cache miss → service reads repo
	}
	*(dest.(*[]model.UserCard)) = c.stored
	return nil
}
func (c *walletTestCache) SetWallet(_ context.Context, _ string, data any) error {
	c.stored, _ = data.([]model.UserCard)
	c.present = true
	return nil
}
func (c *walletTestCache) InvalidateWallet(context.Context, string) error {
	atomic.AddInt64(&c.invalidates, 1)
	c.present = false
	c.stored = nil
	return nil
}

func newWalletSvc(repo *walletTestRepo, cache *walletTestCache) *WalletService {
	return NewWalletService(repo, nil, nil, nil, cache)
}

// The exact reported bug: a populated (stale) cache must NOT be re-served
// after a balance write — invalidation is synchronous, so the next read
// misses cache and returns the freshly-persisted balance.
func TestWallet_UpdateBalance_NoStaleReadAfterWrite(t *testing.T) {
	const sid, uid, cid = "sess", "u1", "card1"
	bal := int64(0)
	repo := &walletTestRepo{
		getUserBySession: func(context.Context, string) (*model.User, error) {
			return &model.User{ID: uid, SessionID: sid}, nil
		},
		getUserCards: func(context.Context, string) ([]model.UserCard, error) {
			return []model.UserCard{{CardID: cid, PointBalance: bal}}, nil
		},
		updateBalance: func(_ context.Context, _, _ string, b int64) error { bal = b; return nil },
	}
	cache := &walletTestCache{stored: []model.UserCard{{CardID: cid, PointBalance: 0}}, present: true}
	svc := newWalletSvc(repo, cache)

	if err := svc.UpdateBalance(context.Background(), sid, cid, 10000); err != nil {
		t.Fatalf("UpdateBalance: %v", err)
	}
	if atomic.LoadInt64(&cache.invalidates) != 1 {
		t.Fatalf("expected exactly 1 synchronous invalidation, got %d", cache.invalidates)
	}
	cards, err := svc.GetWallet(context.Background(), sid)
	if err != nil {
		t.Fatalf("GetWallet: %v", err)
	}
	if len(cards) != 1 || cards[0].PointBalance != 10000 {
		t.Fatalf("stale read after write: got %+v, want PointBalance=10000", cards)
	}
}

func TestWallet_UpdateBalance_NegativeRejected(t *testing.T) {
	called := false
	repo := &walletTestRepo{
		getUserBySession: func(context.Context, string) (*model.User, error) {
			return &model.User{ID: "u"}, nil
		},
		updateBalance: func(context.Context, string, string, int64) error { called = true; return nil },
	}
	err := newWalletSvc(repo, &walletTestCache{}).UpdateBalance(context.Background(), "s", "c", -5)
	if err == nil {
		t.Fatal("expected negative balance to be rejected")
	}
	if called {
		t.Fatal("repo.UpdateBalance must not be called for a negative balance")
	}
}

func TestWallet_NilUser_NoPanic_SessionNotFound(t *testing.T) {
	repo := &walletTestRepo{
		getUserBySession: func(context.Context, string) (*model.User, error) {
			return nil, nil // pgx ErrNoRows path → (nil, nil)
		},
		getUserCards:  func(context.Context, string) ([]model.UserCard, error) { return nil, nil },
		updateBalance: func(context.Context, string, string, int64) error { return nil },
	}
	svc := newWalletSvc(repo, &walletTestCache{})
	if err := svc.UpdateBalance(context.Background(), "missing", "c", 100); err == nil {
		t.Error("UpdateBalance: expected session-not-found error, got nil")
	}
	if _, err := svc.GetWallet(context.Background(), "missing"); err == nil {
		t.Error("GetWallet: expected session-not-found error, got nil")
	}
}
