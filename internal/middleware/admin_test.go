package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// signJWTWithEmail builds a real HS256 token carrying an email claim.
// RequireAdmin re-parses the Bearer token (unverified) to read the email
// claim, so the test must put an actual JWT in the Authorization header — a
// plain context value is not enough.
func signJWTWithEmail(t *testing.T, email string) string {
	t.Helper()
	claims := jwt.MapClaims{
		"sub": "u1",
		"iss": "maplerewards",
		"exp": time.Now().Add(time.Hour).Unix(),
	}
	if email != "" {
		claims["email"] = email
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := tok.SignedString([]byte("any-secret-the-signature-is-not-rechecked"))
	if err != nil {
		t.Fatalf("sign jwt: %v", err)
	}
	return s
}

// adminReq builds a request whose context already has userID set (RequireAdmin
// runs after JWTRequired) and whose Authorization header carries the token.
func adminReq(t *testing.T, token string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/admin/x", nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		req = req.WithContext(context.WithValue(req.Context(), userIDKey, "u1"))
	}
	return req
}

// Fail-closed: an empty allow-list must deny everyone, even a request that is
// otherwise fully authenticated.
func TestRequireAdmin_EmptyAllowList_DeniesEveryone(t *testing.T) {
	called := false
	h := RequireAdmin(nil)(nextRecorder(&called))
	req := adminReq(t, signJWTWithEmail(t, "anyone@example.com"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("empty ADMIN_EMAILS must block all access (fail-closed)")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 with empty allow-list, got %d", w.Code)
	}
	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp["code"] != "FORBIDDEN" {
		t.Errorf("expected code FORBIDDEN, got %q", resp["code"])
	}
}

// An allow-list of only whitespace/blank entries also collapses to empty →
// still fail-closed.
func TestRequireAdmin_BlankEntriesOnly_DeniesEveryone(t *testing.T) {
	called := false
	h := RequireAdmin([]string{"", "   ", "\t"})(nextRecorder(&called))
	req := adminReq(t, signJWTWithEmail(t, "anyone@example.com"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called || w.Code != http.StatusForbidden {
		t.Fatalf("blank-only allow-list must deny: called=%v code=%d", called, w.Code)
	}
}

func TestRequireAdmin_ListedEmail_Allowed(t *testing.T) {
	called := false
	h := RequireAdmin([]string{"admin@example.com"})(nextRecorder(&called))
	req := adminReq(t, signJWTWithEmail(t, "admin@example.com"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if !called || w.Code != http.StatusOK {
		t.Fatalf("listed admin must be allowed: called=%v code=%d", called, w.Code)
	}
}

func TestRequireAdmin_NonListedEmail_Denied(t *testing.T) {
	called := false
	h := RequireAdmin([]string{"admin@example.com"})(nextRecorder(&called))
	req := adminReq(t, signJWTWithEmail(t, "intruder@example.com"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("non-listed email must NOT reach admin handler")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for non-listed email, got %d", w.Code)
	}
}

// Case-insensitivity is implemented: the allow-list is lower-cased on build
// and the claim is lower-cased on compare.
func TestRequireAdmin_CaseInsensitiveMatch(t *testing.T) {
	called := false
	h := RequireAdmin([]string{"  Admin@Example.COM  "})(nextRecorder(&called))
	req := adminReq(t, signJWTWithEmail(t, "ADMIN@example.com"))
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if !called || w.Code != http.StatusOK {
		t.Fatalf("case-insensitive admin match must pass: called=%v code=%d", called, w.Code)
	}
}

// Allow-list configured, but the request has no authenticated user in context
// (JWTRequired would have set it) → 401, not a pass.
func TestRequireAdmin_NoUserInContext_401(t *testing.T) {
	called := false
	h := RequireAdmin([]string{"admin@example.com"})(nextRecorder(&called))
	req := httptest.NewRequest(http.MethodGet, "/admin/x", nil) // no userID, no token
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("unauthenticated request must not reach admin handler")
	}
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 when no user in context, got %d", w.Code)
	}
}

// Authenticated user but the token has no email claim → denied 403 (cannot
// be matched against the allow-list).
func TestRequireAdmin_TokenWithoutEmailClaim_403(t *testing.T) {
	called := false
	h := RequireAdmin([]string{"admin@example.com"})(nextRecorder(&called))
	req := adminReq(t, signJWTWithEmail(t, "")) // no email claim
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)

	if called {
		t.Fatal("token without email claim must be denied")
	}
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 when token lacks email, got %d", w.Code)
	}
}
