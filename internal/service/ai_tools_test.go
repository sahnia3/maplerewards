package service

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// TestNewToolsRegistered ensures the 4 new Phase-1 tools are wired up and
// Pro-gated correctly. Doesn't exercise the handlers (those depend on live
// repos) — just the schema and gating surface.
func TestNewToolsRegistered(t *testing.T) {
	r := newToolRegistry()
	r.register(toolDef{Name: "find_card_for_merchant", InputSchema: map[string]any{}, Handler: stubHandler})
	r.register(toolDef{Name: "simulate_transfer_with_bonus", InputSchema: map[string]any{}, Handler: stubHandler})
	r.register(toolDef{Name: "project_aeroplan_devaluation", ProOnly: true, InputSchema: map[string]any{}, Handler: stubHandler})
	r.register(toolDef{Name: "list_my_award_watches", ProOnly: true, InputSchema: map[string]any{}, Handler: stubHandler})

	free := r.schemas(false)
	pro := r.schemas(true)

	freeNames := names(free)
	proNames := names(pro)

	// Free-tier tools must appear to free users.
	for _, name := range []string{"find_card_for_merchant", "simulate_transfer_with_bonus"} {
		if !sliceContains(freeNames, name) {
			t.Errorf("free schemas missing %q; got %v", name, freeNames)
		}
	}
	// Pro-only tools must NOT appear to free users.
	for _, name := range []string{"project_aeroplan_devaluation", "list_my_award_watches"} {
		if sliceContains(freeNames, name) {
			t.Errorf("free schemas leak Pro tool %q; got %v", name, freeNames)
		}
		if !sliceContains(proNames, name) {
			t.Errorf("pro schemas missing %q; got %v", name, proNames)
		}
	}
}

// TestProGatingRejectsFreeCaller confirms the registry blocks a Pro tool when
// called by a non-Pro session, returning a structured pro_required error.
func TestProGatingRejectsFreeCaller(t *testing.T) {
	r := newToolRegistry()
	r.register(toolDef{
		Name:        "project_aeroplan_devaluation",
		ProOnly:     true,
		InputSchema: map[string]any{},
		Handler:     stubHandler,
	})

	raw := r.call(context.Background(), "session-id", false /* isPro */, "project_aeroplan_devaluation", json.RawMessage(`{}`))

	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("response is not JSON: %v (raw=%s)", err, raw)
	}
	if errStr, _ := got["error"].(string); !strings.Contains(errStr, "pro_required") {
		t.Errorf("expected pro_required error; got %v", got)
	}
}

// TestProGatingAllowsProCaller confirms a Pro caller reaches the handler.
func TestProGatingAllowsProCaller(t *testing.T) {
	r := newToolRegistry()
	r.register(toolDef{
		Name:        "project_aeroplan_devaluation",
		ProOnly:     true,
		InputSchema: map[string]any{},
		Handler: func(_ context.Context, sessionID string, isPro bool, _ json.RawMessage) (json.RawMessage, error) {
			return json.Marshal(map[string]any{"got_session": sessionID, "got_pro": isPro})
		},
	})

	raw := r.call(context.Background(), "session-id", true /* isPro */, "project_aeroplan_devaluation", json.RawMessage(`{}`))

	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("response is not JSON: %v", err)
	}
	if got["got_session"] != "session-id" || got["got_pro"] != true {
		t.Errorf("handler received unexpected args: %v", got)
	}
}

// stubHandler returns an empty success body; used in registry-only tests.
func stubHandler(_ context.Context, _ string, _ bool, _ json.RawMessage) (json.RawMessage, error) {
	return json.RawMessage(`{"ok":true}`), nil
}

func names(schemas []map[string]any) []string {
	out := make([]string, 0, len(schemas))
	for _, s := range schemas {
		if n, ok := s["name"].(string); ok {
			out = append(out, n)
		}
	}
	return out
}

func sliceContains(haystack []string, needle string) bool {
	for _, h := range haystack {
		if h == needle {
			return true
		}
	}
	return false
}
