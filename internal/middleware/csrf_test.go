package middleware

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// nextRecorder is a tiny next-handler that records whether it was invoked and
// returns 200 when it is. Lets each test assert the security decision (did the
// request reach the protected handler or get short-circuited).
func nextRecorder(called *bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*called = true
		w.WriteHeader(http.StatusOK)
	})
}

func TestCSRFProtect_SafeMethodsBypass(t *testing.T) {
	for _, m := range []string{http.MethodGet, http.MethodHead, http.MethodOptions} {
		called := false
		h := CSRFProtect(nextRecorder(&called))
		// No cookie, no header at all — safe methods must still pass.
		req := httptest.NewRequest(m, "/", nil)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)

		if !called {
			t.Errorf("%s: next handler must be called for safe method", m)
		}
		if w.Code != http.StatusOK {
			t.Errorf("%s: expected 200, got %d", m, w.Code)
		}
		// Lazy-seed contract: a safe request without a token gets one set so
		// the SPA has it before its first write.
		if sc := w.Result().Cookies(); len(sc) == 0 {
			t.Errorf("%s: expected CSRF cookie to be seeded on safe request", m)
		}
	}
}

func TestCSRFProtect_MissingCookie_403(t *testing.T) {
	called := false
	h := CSRFProtect(nextRecorder(&called))
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	// Header present but no cookie in the jar.
	req.Header.Set(CSRFHeaderName, "some-token")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("next handler must NOT be called when CSRF cookie is missing")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp["code"] != "CSRF_FAILED" {
		t.Errorf("expected code CSRF_FAILED, got %q", resp["code"])
	}
}

func TestCSRFProtect_MissingHeader_403(t *testing.T) {
	called := false
	h := CSRFProtect(nextRecorder(&called))
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.AddCookie(&http.Cookie{Name: CSRFCookieName, Value: "valid-token"})
	// No X-CSRF-Token header.
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("next handler must NOT be called when CSRF header is missing")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestCSRFProtect_CookieHeaderMismatch_403(t *testing.T) {
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		called := false
		h := CSRFProtect(nextRecorder(&called))
		req := httptest.NewRequest(m, "/", nil)
		req.AddCookie(&http.Cookie{Name: CSRFCookieName, Value: "cookie-value"})
		req.Header.Set(CSRFHeaderName, "different-header-value")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)

		if called {
			t.Fatalf("%s: next handler must NOT be called on cookie!=header", m)
		}
		if w.Code != http.StatusForbidden {
			t.Fatalf("%s: expected 403 on mismatch, got %d", m, w.Code)
		}
	}
}

func TestCSRFProtect_MatchingCookieAndHeader_Passes(t *testing.T) {
	for _, m := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		called := false
		h := CSRFProtect(nextRecorder(&called))
		req := httptest.NewRequest(m, "/", nil)
		req.AddCookie(&http.Cookie{Name: CSRFCookieName, Value: "match-token"})
		req.Header.Set(CSRFHeaderName, "match-token")
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)

		if !called {
			t.Fatalf("%s: next handler MUST be called when cookie==header", m)
		}
		if w.Code != http.StatusOK {
			t.Fatalf("%s: expected 200, got %d", m, w.Code)
		}
	}
}

// Even with an empty-string cookie value, a state-changing request must fail
// closed (an empty token must never satisfy the double-submit check).
func TestCSRFProtect_EmptyCookieValue_403(t *testing.T) {
	called := false
	h := CSRFProtect(nextRecorder(&called))
	req := httptest.NewRequest(http.MethodPost, "/", nil)
	req.AddCookie(&http.Cookie{Name: CSRFCookieName, Value: ""})
	req.Header.Set(CSRFHeaderName, "")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("empty token must not satisfy CSRF check")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", w.Code)
	}
}

func TestIssueCSRFTokenHandler_SetsCookieAndReturnsToken(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/csrf", nil)
	w := httptest.NewRecorder()
	IssueCSRFTokenHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var body map[string]string
	if err := json.NewDecoder(w.Body).Decode(&body); err != nil {
		t.Fatalf("response not JSON: %v", err)
	}
	tok := body["csrf_token"]
	if tok == "" {
		t.Fatal("expected non-empty csrf_token in body")
	}
	cookies := w.Result().Cookies()
	var found *http.Cookie
	for _, c := range cookies {
		if c.Name == CSRFCookieName {
			found = c
		}
	}
	if found == nil {
		t.Fatalf("expected %s cookie to be set", CSRFCookieName)
	}
	if found.Value != tok {
		t.Errorf("cookie value %q must equal returned token %q", found.Value, tok)
	}
	if found.HttpOnly {
		t.Error("CSRF cookie must be readable by the SPA (HttpOnly=false)")
	}
}

// When the caller already has a CSRF cookie, IssueCSRFTokenHandler must echo
// the existing token (not churn it), so a freshly-fetched token stays valid
// for an in-flight request.
func TestIssueCSRFTokenHandler_EchoesExistingToken(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/csrf", nil)
	req.AddCookie(&http.Cookie{Name: CSRFCookieName, Value: "preexisting"})
	w := httptest.NewRecorder()
	IssueCSRFTokenHandler(w, req)

	var body map[string]string
	json.NewDecoder(w.Body).Decode(&body) //nolint:errcheck
	if body["csrf_token"] != "preexisting" {
		t.Errorf("expected existing token to be echoed, got %q", body["csrf_token"])
	}
}

func TestRotateCSRFCookie_SetsFreshTokenAndReturnsIt(t *testing.T) {
	w := httptest.NewRecorder()
	tok := RotateCSRFCookie(w)
	if tok == "" {
		t.Fatal("RotateCSRFCookie must return the new token")
	}
	cookies := w.Result().Cookies()
	var found *http.Cookie
	for _, c := range cookies {
		if c.Name == CSRFCookieName {
			found = c
		}
	}
	if found == nil {
		t.Fatal("RotateCSRFCookie must Set-Cookie the new token")
	}
	if found.Value != tok {
		t.Errorf("cookie value %q must equal returned token %q", found.Value, tok)
	}

	// Two rotations must yield different tokens (fixation defense).
	w2 := httptest.NewRecorder()
	tok2 := RotateCSRFCookie(w2)
	if tok == tok2 {
		t.Error("consecutive rotations must produce distinct tokens")
	}
}
