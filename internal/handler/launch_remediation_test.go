package handler

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

// RecordSpend must reject an out-of-range amount BEFORE it reaches the service
// — the optimizer enforced a $1M ceiling but the spend write path did not, so a
// huge/absurd amount persisted an absurd points row and poisoned every
// downstream aggregate (and the optimizer's own cap accumulation). A nil
// service is safe here precisely because validation returns first.
func TestRecordSpend_RejectsOutOfRangeAmount(t *testing.T) {
	h := NewSpendHandler(service.NewWalletService(nil, nil, nil, nil, nil))
	const sid = "abcdef0123456789abcdef0123456789"

	cases := []struct {
		name string
		body string
	}{
		{"zero", `{"card_id":"c","category_slug":"groceries","amount":0}`},
		{"negative", `{"card_id":"c","category_slug":"groceries","amount":-50}`},
		{"too large", `{"card_id":"c","category_slug":"groceries","amount":2000000}`},
		{"absurd", `{"card_id":"c","category_slug":"groceries","amount":1e15}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/wallet/"+sid+"/spend", bytes.NewBufferString(tc.body))
			rctx := chi.NewRouteContext()
			rctx.URLParams.Add("sessionID", sid)
			req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

			w := httptest.NewRecorder()
			h.RecordSpend(w, req)

			if w.Code != http.StatusBadRequest {
				t.Fatalf("amount %s: expected 400, got %d", tc.name, w.Code)
			}
		})
	}
}

// A valid amount within range must pass validation (it will then fail at the
// nil service, proving the guard let it through — we assert it is NOT a 400).
func TestRecordSpend_ValidAmountPassesValidation(t *testing.T) {
	defer func() { _ = recover() }() // nil service panics after validation — that's fine
	h := NewSpendHandler(service.NewWalletService(nil, nil, nil, nil, nil))
	const sid = "abcdef0123456789abcdef0123456789"

	req := httptest.NewRequest(http.MethodPost, "/wallet/"+sid+"/spend",
		bytes.NewBufferString(`{"card_id":"c","category_slug":"groceries","amount":1000000}`))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("sessionID", sid)
	req = req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))

	w := httptest.NewRecorder()
	h.RecordSpend(w, req)

	if w.Code == http.StatusBadRequest {
		t.Fatalf("amount 1,000,000 (the ceiling) must pass validation, got 400")
	}
}

// In production the frontend is a distinct origin (CORS, no BFF). SameSite=Lax
// cookies are not sent on cross-site fetch, so the auth cookies must be
// SameSite=None + Secure to flow at all.
func TestSetTokenCookies_ProdIsSameSiteNoneSecure(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	w := httptest.NewRecorder()
	setTokenCookies(w, &model.TokenPair{
		AccessToken:  "access",
		RefreshToken: "refresh",
		ExpiresAt:    time.Now().Add(15 * time.Minute),
	})

	cookies := w.Result().Cookies()
	if len(cookies) != 2 {
		t.Fatalf("expected 2 cookies, got %d", len(cookies))
	}
	for _, c := range cookies {
		if c.SameSite != http.SameSiteNoneMode {
			t.Errorf("cookie %s: SameSite = %v, want None (cross-origin SPA)", c.Name, c.SameSite)
		}
		if !c.Secure {
			t.Errorf("cookie %s: Secure = false, want true (SameSite=None requires Secure)", c.Name)
		}
		if !c.HttpOnly {
			t.Errorf("cookie %s: HttpOnly = false, want true", c.Name)
		}
	}
}

// In dev (non-prod, HTTP) cookies stay Lax + non-Secure so localhost works.
func TestSetTokenCookies_DevIsLaxNonSecure(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	w := httptest.NewRecorder()
	setTokenCookies(w, &model.TokenPair{
		AccessToken:  "access",
		RefreshToken: "refresh",
		ExpiresAt:    time.Now().Add(15 * time.Minute),
	})

	for _, c := range w.Result().Cookies() {
		if c.SameSite != http.SameSiteLaxMode {
			t.Errorf("cookie %s: SameSite = %v, want Lax in dev", c.Name, c.SameSite)
		}
		if c.Secure {
			t.Errorf("cookie %s: Secure = true, want false in dev (HTTP)", c.Name)
		}
	}
}
