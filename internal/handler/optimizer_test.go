package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"maplerewards/internal/handler/testutil"
)

func TestGetBestCard_MissingSessionID(t *testing.T) {
	svc := testutil.NewMockOptimizerService()
	h := NewOptimizerHandler(svc, nil)

	body := `{"category_slug":"groceries","spend_amount":100}`
	req := httptest.NewRequest(http.MethodPost, "/optimize", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	h.GetBestCard(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}

	var resp map[string]string
	json.NewDecoder(w.Body).Decode(&resp) //nolint:errcheck
	if resp["message"] == "" {
		t.Error("expected error message in response")
	}
}

func TestGetBestCard_InvalidSpendAmount(t *testing.T) {
	svc := testutil.NewMockOptimizerService()
	h := NewOptimizerHandler(svc, nil)

	tests := []struct {
		name string
		body string
	}{
		{"zero", `{"session_id":"abcdef0123456789abcdef0123456789","category_slug":"groceries","spend_amount":0}`},
		{"negative", `{"session_id":"abcdef0123456789abcdef0123456789","category_slug":"groceries","spend_amount":-50}`},
		{"too large", `{"session_id":"abcdef0123456789abcdef0123456789","category_slug":"groceries","spend_amount":2000000}`},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/optimize", bytes.NewBufferString(tc.body))
			w := httptest.NewRecorder()
			h.GetBestCard(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("expected 400, got %d", w.Code)
			}
		})
	}
}

func TestGetBestCard_MissingCategory(t *testing.T) {
	svc := testutil.NewMockOptimizerService()
	h := NewOptimizerHandler(svc, nil)

	body := `{"session_id":"abcdef0123456789abcdef0123456789","spend_amount":100}`
	req := httptest.NewRequest(http.MethodPost, "/optimize", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	h.GetBestCard(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestGetBestCard_InvalidRedemptionSegment(t *testing.T) {
	svc := testutil.NewMockOptimizerService()
	h := NewOptimizerHandler(svc, nil)

	body := `{"session_id":"abcdef0123456789abcdef0123456789","category_slug":"groceries","spend_amount":100,"redemption_segment":"premium"}`
	req := httptest.NewRequest(http.MethodPost, "/optimize", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	h.GetBestCard(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestGetBestCard_InvalidBody(t *testing.T) {
	svc := testutil.NewMockOptimizerService()
	h := NewOptimizerHandler(svc, nil)

	req := httptest.NewRequest(http.MethodPost, "/optimize", bytes.NewBufferString("not json"))
	w := httptest.NewRecorder()

	h.GetBestCard(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestGetBestCard_InvalidSlug(t *testing.T) {
	svc := testutil.NewMockOptimizerService()
	h := NewOptimizerHandler(svc, nil)

	body := `{"session_id":"abcdef0123456789abcdef0123456789","category_slug":"drop table;--","spend_amount":100}`
	req := httptest.NewRequest(http.MethodPost, "/optimize", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	h.GetBestCard(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestGetBestCard_ValidRequest(t *testing.T) {
	svc := testutil.NewMockOptimizerService()
	h := NewOptimizerHandler(svc, nil)

	body := `{"session_id":"abcdef0123456789abcdef0123456789","category_slug":"groceries","spend_amount":100}`
	req := httptest.NewRequest(http.MethodPost, "/optimize", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	h.GetBestCard(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d; body: %s", w.Code, w.Body.String())
	}
}

func TestGetBestCard_ValidRequestWithSegment(t *testing.T) {
	svc := testutil.NewMockOptimizerService()
	h := NewOptimizerHandler(svc, nil)

	body := `{"session_id":"abcdef0123456789abcdef0123456789","category_slug":"groceries","spend_amount":50,"redemption_segment":"business"}`
	req := httptest.NewRequest(http.MethodPost, "/optimize", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	h.GetBestCard(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d; body: %s", w.Code, w.Body.String())
	}
}
