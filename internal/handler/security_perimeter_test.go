package handler

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/model"
)

// ── Stripe webhook HMAC verification ───────────────────────────────────────

const testWebhookSecret = "whsec_test_secret_value"

// stripeSig builds a Stripe-style signature header `t=<ts>,v1=<hex>` over the
// signed payload "ts.payload" using HMAC-SHA256, exactly as Stripe does.
func stripeSig(ts int64, payload, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(fmt.Sprintf("%d.%s", ts, payload)))
	return fmt.Sprintf("t=%d,v1=%s", ts, hex.EncodeToString(mac.Sum(nil)))
}

func TestVerifyStripeSignature_ValidWithinTolerance(t *testing.T) {
	payload := `{"id":"evt_1","type":"checkout.session.completed"}`
	hdr := stripeSig(time.Now().Unix(), payload, testWebhookSecret)
	if !verifyStripeSignature([]byte(payload), hdr, testWebhookSecret) {
		t.Fatal("a correctly-signed, fresh payload must verify")
	}
}

func TestVerifyStripeSignature_TamperedBody_Rejected(t *testing.T) {
	original := `{"id":"evt_1","amount":100}`
	hdr := stripeSig(time.Now().Unix(), original, testWebhookSecret)
	tampered := `{"id":"evt_1","amount":999999}`
	if verifyStripeSignature([]byte(tampered), hdr, testWebhookSecret) {
		t.Fatal("a body modified after signing MUST be rejected")
	}
}

func TestVerifyStripeSignature_WrongSecret_Rejected(t *testing.T) {
	payload := `{"id":"evt_1"}`
	// Signed with the attacker's secret, verified against ours.
	hdr := stripeSig(time.Now().Unix(), payload, "whsec_attacker_guess")
	if verifyStripeSignature([]byte(payload), hdr, testWebhookSecret) {
		t.Fatal("signature from a different secret MUST be rejected")
	}
}

func TestVerifyStripeSignature_StaleTimestamp_RejectedReplay(t *testing.T) {
	payload := `{"id":"evt_1"}`
	// Captured 6 minutes ago — outside the ±300s skew → replay rejected even
	// though the HMAC itself is valid for that old timestamp.
	old := time.Now().Add(-6 * time.Minute).Unix()
	hdr := stripeSig(old, payload, testWebhookSecret)
	if verifyStripeSignature([]byte(payload), hdr, testWebhookSecret) {
		t.Fatal("timestamp older than 5-min skew MUST be rejected (replay defense)")
	}
}

// The skew check is two-sided: a far-future timestamp must also be rejected
// (a one-sided check would make the replay window unbounded into the future).
func TestVerifyStripeSignature_FutureTimestamp_Rejected(t *testing.T) {
	payload := `{"id":"evt_1"}`
	future := time.Now().Add(6 * time.Minute).Unix()
	hdr := stripeSig(future, payload, testWebhookSecret)
	if verifyStripeSignature([]byte(payload), hdr, testWebhookSecret) {
		t.Fatal("far-future timestamp MUST be rejected (two-sided skew)")
	}
}

func TestVerifyStripeSignature_MalformedHeaders_Rejected(t *testing.T) {
	payload := `{"id":"evt_1"}`
	validTS := time.Now().Unix()
	goodHMAC := func() string {
		m := hmac.New(sha256.New, []byte(testWebhookSecret))
		m.Write([]byte(fmt.Sprintf("%d.%s", validTS, payload)))
		return hex.EncodeToString(m.Sum(nil))
	}()

	cases := []struct {
		name string
		hdr  string
	}{
		{"empty header", ""},
		{"no v1 signature", fmt.Sprintf("t=%d", validTS)},
		{"no timestamp", "v1=" + goodHMAC},
		{"garbage", "this is not a stripe header"},
		{"non-numeric timestamp", fmt.Sprintf("t=notanumber,v1=%s", goodHMAC)},
		{"empty timestamp value", fmt.Sprintf("t=,v1=%s", goodHMAC)},
		{"missing kv separators", fmt.Sprintf("t%d v1%s", validTS, goodHMAC)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if verifyStripeSignature([]byte(payload), c.hdr, testWebhookSecret) {
				t.Fatalf("malformed header %q MUST be rejected", c.hdr)
			}
		})
	}
}

// Stripe sends multiple v1 entries during secret rotation; if ANY matches the
// payload must verify.
func TestVerifyStripeSignature_MultipleV1_OneValid(t *testing.T) {
	payload := `{"id":"evt_1"}`
	ts := time.Now().Unix()
	m := hmac.New(sha256.New, []byte(testWebhookSecret))
	m.Write([]byte(fmt.Sprintf("%d.%s", ts, payload)))
	good := hex.EncodeToString(m.Sum(nil))
	hdr := fmt.Sprintf("t=%d,v1=deadbeefbad,v1=%s", ts, good)
	if !verifyStripeSignature([]byte(payload), hdr, testWebhookSecret) {
		t.Fatal("a header with one valid v1 among several must verify")
	}
}

// ── Body-param IDOR (requireBodySessionOwner, package handler) ─────────────

type bodyLookupStub struct {
	fn func(ctx context.Context, sid string) (*model.User, error)
}

func (b *bodyLookupStub) GetUserBySession(ctx context.Context, sid string) (*model.User, error) {
	return b.fn(ctx, sid)
}

func sptr(s string) *string { return &s }

// ctxWithUserID mirrors what JWTOptional/JWTRequired place in context. The key
// is unexported in package middleware, so we set it via the exported helper's
// observable contract: we build the request through middleware.JWTRequired is
// overkill — instead we rely on mw.UserIDFromContext reading the same key.
// Simplest correct approach: run a tiny middleware that injects it.
func reqWithUser(userID string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/optimize", nil)
	if userID == "" {
		return req
	}
	// Use a validator stub + JWTRequired to populate context exactly as prod.
	var out *http.Request
	mw.JWTRequired(stubValidator{uid: userID})(http.HandlerFunc(
		func(_ http.ResponseWriter, r *http.Request) { out = r },
	)).ServeHTTP(httptest.NewRecorder(), withBearer(req))
	if out == nil {
		// validator path failed; fall back to raw request (test will surface it)
		return req
	}
	return out
}

type stubValidator struct{ uid string }

func (s stubValidator) ValidateAccessToken(string) (string, bool, string, error) {
	return s.uid, false, "", nil
}

func withBearer(r *http.Request) *http.Request {
	r.Header.Set("Authorization", "Bearer dummy")
	return r
}

func TestRequireBodySessionOwner_EmptySessionID_400(t *testing.T) {
	w := httptest.NewRecorder()
	ok := requireBodySessionOwner(w, httptest.NewRequest(http.MethodPost, "/", nil), nil, "")
	if ok {
		t.Fatal("empty sessionID must short-circuit (return false)")
	}
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty sessionID, got %d", w.Code)
	}
}

// Documented behavior: a nil lookup is treated as a test-only skip and returns
// true (production always passes a real walletRepo). Pinned so a regression
// that makes nil-lookup an open bypass in prod paths is caught.
func TestRequireBodySessionOwner_NilLookup_SkipsAndPasses(t *testing.T) {
	w := httptest.NewRecorder()
	ok := requireBodySessionOwner(w, httptest.NewRequest(http.MethodPost, "/", nil), nil, "sess-1")
	if !ok {
		t.Fatal("nil lookup is the documented test-skip path → must return true")
	}
}

func TestRequireBodySessionOwner_AnonymousWallet_Passes(t *testing.T) {
	lookup := &bodyLookupStub{fn: func(context.Context, string) (*model.User, error) {
		return &model.User{ID: "anon", Email: nil}, nil
	}}
	w := httptest.NewRecorder()
	ok := requireBodySessionOwner(w, httptest.NewRequest(http.MethodPost, "/", nil), lookup, "sess-1")
	if !ok {
		t.Fatal("anonymous wallet (no email) must pass: sessionID is the bearer secret")
	}
}

func TestRequireBodySessionOwner_OwnerMatch_Passes(t *testing.T) {
	lookup := &bodyLookupStub{fn: func(_ context.Context, sid string) (*model.User, error) {
		if sid != "sess-owned" {
			t.Errorf("lookup got sessionID %q, want sess-owned", sid)
		}
		return &model.User{ID: "owner-1", Email: sptr("owner@example.com")}, nil
	}}
	req := reqWithUser("owner-1")
	w := httptest.NewRecorder()
	if !requireBodySessionOwner(w, req, lookup, "sess-owned") {
		t.Fatalf("owner match must pass (status written: %d)", w.Code)
	}
}

func TestRequireBodySessionOwner_Mismatch_403(t *testing.T) {
	lookup := &bodyLookupStub{fn: func(context.Context, string) (*model.User, error) {
		return &model.User{ID: "owner-1", Email: sptr("owner@example.com")}, nil
	}}
	req := reqWithUser("attacker-9") // logged in as someone else
	w := httptest.NewRecorder()
	if requireBodySessionOwner(w, req, lookup, "sess-owned") {
		t.Fatal("IDOR: a non-owner must be blocked on the body-param path")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for body-param ownership mismatch, got %d", w.Code)
	}
}

func TestRequireBodySessionOwner_AuthedWalletNoJWT_401(t *testing.T) {
	lookup := &bodyLookupStub{fn: func(context.Context, string) (*model.User, error) {
		return &model.User{ID: "owner-1", Email: sptr("owner@example.com")}, nil
	}}
	// No JWT in context.
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	w := httptest.NewRecorder()
	if requireBodySessionOwner(w, req, lookup, "sess-owned") {
		t.Fatal("authed wallet with no JWT must be blocked")
	}
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", w.Code)
	}
}

func TestRequireBodySessionOwner_WalletNotFound_404(t *testing.T) {
	lookup := &bodyLookupStub{fn: func(context.Context, string) (*model.User, error) {
		return nil, nil // not found
	}}
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	w := httptest.NewRecorder()
	if requireBodySessionOwner(w, req, lookup, "ghost-sess") {
		t.Fatal("unknown wallet must be blocked")
	}
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown wallet, got %d", w.Code)
	}
}
