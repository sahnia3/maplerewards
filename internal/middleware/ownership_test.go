package middleware

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"

	"maplerewards/internal/model"
)

// mockSessionOwnerLookup is a function-field stub for SessionOwnerLookup, per
// the repo mock convention (implement the interface with a func field).
type mockSessionOwnerLookup struct {
	fn func(ctx context.Context, sessionID string) (*model.User, error)
}

func (m *mockSessionOwnerLookup) GetUserBySession(ctx context.Context, sessionID string) (*model.User, error) {
	return m.fn(ctx, sessionID)
}

// withChiParam attaches a chi RouteContext carrying {sessionID} so that
// chi.URLParam resolves inside the middleware (mirrors how the router injects
// it in production).
func withChiParam(req *http.Request, key, val string) *http.Request {
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add(key, val)
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

func strptr(s string) *string { return &s }

func TestRequireSessionOwner_AnonymousWallet_Passes(t *testing.T) {
	called := false
	lookup := &mockSessionOwnerLookup{fn: func(context.Context, string) (*model.User, error) {
		// Anonymous wallet: no email — the sessionID itself is the bearer token.
		return &model.User{ID: "u-anon", Email: nil}, nil
	}}
	h := RequireSessionOwner(lookup)(nextRecorder(&called))
	req := withChiParam(httptest.NewRequest(http.MethodGet, "/wallet/sess-1", nil), "sessionID", "sess-1")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if !called || w.Code != http.StatusOK {
		t.Fatalf("anonymous wallet must pass without JWT: called=%v code=%d", called, w.Code)
	}
}

func TestRequireSessionOwner_OwnerMatch_Passes(t *testing.T) {
	called := false
	lookup := &mockSessionOwnerLookup{fn: func(context.Context, string) (*model.User, error) {
		return &model.User{ID: "owner-1", Email: strptr("owner@example.com")}, nil
	}}
	h := RequireSessionOwner(lookup)(nextRecorder(&called))
	req := withChiParam(httptest.NewRequest(http.MethodGet, "/wallet/sess-1", nil), "sessionID", "sess-1")
	// JWT user matches wallet owner.
	req = req.WithContext(context.WithValue(req.Context(), userIDKey, "owner-1"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if !called || w.Code != http.StatusOK {
		t.Fatalf("matching owner must pass: called=%v code=%d", called, w.Code)
	}
}

func TestRequireSessionOwner_OwnerMismatch_403(t *testing.T) {
	called := false
	lookup := &mockSessionOwnerLookup{fn: func(context.Context, string) (*model.User, error) {
		return &model.User{ID: "owner-1", Email: strptr("owner@example.com")}, nil
	}}
	h := RequireSessionOwner(lookup)(nextRecorder(&called))
	req := withChiParam(httptest.NewRequest(http.MethodGet, "/wallet/sess-1", nil), "sessionID", "sess-1")
	// A different logged-in user trying to read someone else's wallet (IDOR).
	req = req.WithContext(context.WithValue(req.Context(), userIDKey, "attacker-9"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("IDOR: a non-owner must NOT reach the handler")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for owner mismatch, got %d", w.Code)
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp["code"] != "FORBIDDEN" {
		t.Errorf("expected code FORBIDDEN, got %q", resp["code"])
	}
}

// Authenticated wallet (owner has an email) but the request carries no JWT →
// 401, not a silent pass.
func TestRequireSessionOwner_AuthedWalletNoJWT_401(t *testing.T) {
	called := false
	lookup := &mockSessionOwnerLookup{fn: func(context.Context, string) (*model.User, error) {
		return &model.User{ID: "owner-1", Email: strptr("owner@example.com")}, nil
	}}
	h := RequireSessionOwner(lookup)(nextRecorder(&called))
	req := withChiParam(httptest.NewRequest(http.MethodGet, "/wallet/sess-1", nil), "sessionID", "sess-1")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("authed wallet with no JWT must NOT reach handler")
	}
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestRequireSessionOwner_LookupError_404(t *testing.T) {
	called := false
	lookup := &mockSessionOwnerLookup{fn: func(context.Context, string) (*model.User, error) {
		return nil, errors.New("db down")
	}}
	h := RequireSessionOwner(lookup)(nextRecorder(&called))
	req := withChiParam(httptest.NewRequest(http.MethodGet, "/wallet/sess-1", nil), "sessionID", "sess-1")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("lookup error must not reach handler")
	}
	// Note: code maps both "not found" and lookup errors to 404 (does not
	// distinguish a DB outage from a missing wallet). Documented, not a flaw.
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on lookup failure, got %d", w.Code)
	}
}

// Documented skip path: when {sessionID} is absent from the path the
// middleware is considered misapplied — it does NOT 500 and does NOT block;
// it delegates the rejection to the handler by calling next. This test pins
// that behavior so a future change that turns it into an open bypass is caught.
func TestRequireSessionOwner_EmptySessionID_DelegatesToNext(t *testing.T) {
	called := false
	lookupCalled := false
	lookup := &mockSessionOwnerLookup{fn: func(context.Context, string) (*model.User, error) {
		lookupCalled = true
		return nil, nil
	}}
	h := RequireSessionOwner(lookup)(nextRecorder(&called))
	// No chi param injected → chi.URLParam returns "".
	req := httptest.NewRequest(http.MethodGet, "/wallet/", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if lookupCalled {
		t.Error("lookup must not run when sessionID is empty")
	}
	if !called || w.Code != http.StatusOK {
		t.Fatalf("empty sessionID is delegated to next (not blocked here): called=%v code=%d", called, w.Code)
	}
}

// NOTE: the body-param IDOR variant requireBodySessionOwner lives in package
// `handler` (internal/handler/session_owner.go), so its tests are in
// internal/handler/session_owner_test.go, not here.

// ── RequirePro ─────────────────────────────────────────────────────────────

func TestRequirePro_AnonymousUser_401(t *testing.T) {
	called := false
	h := RequirePro()(nextRecorder(&called))
	req := httptest.NewRequest(http.MethodGet, "/pro", nil) // no userID in ctx
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("anonymous request must not reach a Pro handler")
	}
	// Actual behavior: missing user → 401 Unauthorized (not 403).
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for anon, got %d", w.Code)
	}
}

func TestRequirePro_FreeUser_402(t *testing.T) {
	called := false
	h := RequirePro()(nextRecorder(&called))
	req := httptest.NewRequest(http.MethodGet, "/pro", nil)
	ctx := context.WithValue(req.Context(), userIDKey, "free-1")
	ctx = context.WithValue(ctx, isProKey, false)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("free user must NOT reach a Pro handler")
	}
	// Actual behavior: authenticated-but-not-Pro → 402 Payment Required.
	if w.Code != http.StatusPaymentRequired {
		t.Fatalf("expected 402 for free user, got %d", w.Code)
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp["code"] != "UPGRADE_REQUIRED" {
		t.Errorf("expected code UPGRADE_REQUIRED, got %q", resp["code"])
	}
}

func TestRequirePro_ProUser_Passes(t *testing.T) {
	called := false
	h := RequirePro()(nextRecorder(&called))
	req := httptest.NewRequest(http.MethodGet, "/pro", nil)
	ctx := context.WithValue(req.Context(), userIDKey, "pro-1")
	ctx = context.WithValue(ctx, isProKey, true)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if !called || w.Code != http.StatusOK {
		t.Fatalf("Pro user must reach the handler: called=%v code=%d", called, w.Code)
	}
}
