package service

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
)

// ── Pure unit: lenient JSON extraction ───────────────────────────────────────

func TestSelfCheckExtractFirstJSONObject(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"plain", `{"ok":true}`, `{"ok":true}`},
		{"wrapped_in_prose", `Sure, here is the verdict: {"ok":false,"issues":["x"]} hope that helps`, `{"ok":false,"issues":["x"]}`},
		{"fenced", "```json\n{\"ok\":true,\"corrected_reply\":\"\"}\n```", `{"ok":true,"corrected_reply":""}`},
		{"nested_braces", `prefix {"ok":false,"corrected_reply":"cost is {redacted}"} suffix`, `{"ok":false,"corrected_reply":"cost is {redacted}"}`},
		{"brace_in_string", `{"corrected_reply":"a } b","ok":true}`, `{"corrected_reply":"a } b","ok":true}`},
		{"no_json", `the reply looks fine to me`, ``},
		{"empty", ``, ``},
		{"unbalanced", `{"ok":true`, ``},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := extractFirstJSONObject(c.in)
			if got != c.want {
				t.Fatalf("extractFirstJSONObject(%q) = %q, want %q", c.in, got, c.want)
			}
			// The non-empty results must be valid JSON objects.
			if got != "" {
				var v map[string]any
				if err := json.Unmarshal([]byte(got), &v); err != nil {
					t.Fatalf("extracted %q is not valid JSON: %v", got, err)
				}
			}
		})
	}
}

// ── Gating: skip paths must return the reply UNCHANGED with no network call ───

// failTransport fails any HTTP request, proving the gating paths return before
// any model call is attempted.
type failTransport struct{ t *testing.T }

func (f failTransport) RoundTrip(*http.Request) (*http.Response, error) {
	f.t.Helper()
	f.t.Fatalf("self-check made an HTTP call when it should have skipped")
	return nil, errors.New("unreachable")
}

func TestSelfCheckReplyGatingSkips(t *testing.T) {
	const reply = "You can fly BOM to YYZ on 2026-01-14 for 62,300 points and $89 CAD in taxes."
	someEvidence := []evidenceItem{{tool: "search_award_space", payload: json.RawMessage(`{"results":[]}`)}}

	cases := []struct {
		name          string
		svc           *AIService
		evidence      []evidenceItem
		travelToolRan bool
		reply         string
	}{
		{
			name:          "no_travel_tool_ran",
			svc:           &AIService{modelID: "sonnet", fastModelID: "haiku", apiKey: "x"},
			evidence:      someEvidence,
			travelToolRan: false,
			reply:         reply,
		},
		{
			name:          "no_evidence",
			svc:           &AIService{modelID: "sonnet", fastModelID: "haiku", apiKey: "x"},
			evidence:      nil,
			travelToolRan: true,
			reply:         reply,
		},
		{
			name:          "no_api_key",
			svc:           &AIService{modelID: "sonnet", fastModelID: "haiku", apiKey: ""},
			evidence:      someEvidence,
			travelToolRan: true,
			reply:         reply,
		},
		{
			name:          "routing_disabled_empty_fast",
			svc:           &AIService{modelID: "sonnet", fastModelID: "", apiKey: "x"},
			evidence:      someEvidence,
			travelToolRan: true,
			reply:         reply,
		},
		{
			name:          "routing_disabled_fast_equals_strong",
			svc:           &AIService{modelID: "sonnet", fastModelID: "sonnet", apiKey: "x"},
			evidence:      someEvidence,
			travelToolRan: true,
			reply:         reply,
		},
		{
			name:          "reply_too_short",
			svc:           &AIService{modelID: "sonnet", fastModelID: "haiku", apiKey: "x"},
			evidence:      someEvidence,
			travelToolRan: true,
			reply:         "Yes, that works.",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			// Wire a transport that fails the test if any HTTP call escapes — the
			// gating paths must short-circuit before the model call.
			c.svc.httpClient = &http.Client{Transport: failTransport{t}}
			got := c.svc.selfCheckReply(context.Background(), c.reply, c.evidence, c.travelToolRan)
			if got != c.reply {
				t.Fatalf("expected unchanged reply, got %q", got)
			}
		})
	}
}

// ── Verdict application: stub the Anthropic endpoint via a RoundTripper ───────

// verdictTransport returns a canned Anthropic /v1/messages response whose first
// text block is the supplied verdict JSON. If err is set, RoundTrip fails so we
// can exercise the fail-open path.
type verdictTransport struct {
	verdictJSON string
	status      int
	err         error
}

func (v verdictTransport) RoundTrip(*http.Request) (*http.Response, error) {
	if v.err != nil {
		return nil, v.err
	}
	status := v.status
	if status == 0 {
		status = http.StatusOK
	}
	body := claudeToolUseResponse{
		ID:         "msg_test",
		StopReason: "end_turn",
		Content:    []claudeBlock{{Type: "text", Text: v.verdictJSON}},
	}
	raw, _ := json.Marshal(body)
	return &http.Response{
		StatusCode: status,
		Body:       io.NopCloser(strings.NewReader(string(raw))),
		Header:     make(http.Header),
	}, nil
}

func newSelfCheckSvc(t *testing.T, rt http.RoundTripper) *AIService {
	t.Helper()
	return &AIService{
		modelID:     "sonnet",
		fastModelID: "haiku",
		apiKey:      "x",
		httpClient:  &http.Client{Transport: rt},
	}
}

func TestSelfCheckReplyVerdictApplication(t *testing.T) {
	const reply = "You can fly BOM to YYZ on 2026-01-14 for 62,300 points and $89 CAD in taxes."
	evidence := []evidenceItem{{tool: "search_award_space", payload: json.RawMessage(`{"results":[{"date":"2026-01-14","points_cost":62300,"cash_price_cad":89}]}`)}}

	t.Run("ok_returns_original", func(t *testing.T) {
		svc := newSelfCheckSvc(t, verdictTransport{verdictJSON: `{"ok":true,"issues":[],"corrected_reply":""}`})
		got := svc.selfCheckReply(context.Background(), reply, evidence, true)
		if got != reply {
			t.Fatalf("ok verdict should return original, got %q", got)
		}
	})

	t.Run("not_ok_with_correction_returns_corrected", func(t *testing.T) {
		corrected := "You can fly BOM to YYZ in January for points plus some taxes — check live for exact figures."
		v := `{"ok":false,"issues":["62,300 not in evidence"],"corrected_reply":` + jsonString(corrected) + `}`
		svc := newSelfCheckSvc(t, verdictTransport{verdictJSON: v})
		got := svc.selfCheckReply(context.Background(), reply, evidence, true)
		if got != corrected {
			t.Fatalf("expected corrected reply %q, got %q", corrected, got)
		}
	})

	t.Run("not_ok_no_correction_appends_note", func(t *testing.T) {
		v := `{"ok":false,"issues":["89 CAD not in evidence"],"corrected_reply":""}`
		svc := newSelfCheckSvc(t, verdictTransport{verdictJSON: v})
		got := svc.selfCheckReply(context.Background(), reply, evidence, true)
		if !strings.HasPrefix(got, reply) {
			t.Fatalf("note path should keep original as prefix, got %q", got)
		}
		if !strings.Contains(got, "could not be verified") {
			t.Fatalf("expected unverified note appended, got %q", got)
		}
	})

	t.Run("not_ok_degenerate_correction_appends_note", func(t *testing.T) {
		// Too-short correction is treated as no usable correction → note path.
		v := `{"ok":false,"issues":["x"],"corrected_reply":"see live data"}`
		svc := newSelfCheckSvc(t, verdictTransport{verdictJSON: v})
		got := svc.selfCheckReply(context.Background(), reply, evidence, true)
		if !strings.Contains(got, "could not be verified") {
			t.Fatalf("expected note path for degenerate correction, got %q", got)
		}
	})
}

func TestSelfCheckReplyFailOpen(t *testing.T) {
	const reply = "You can fly BOM to YYZ on 2026-01-14 for 62,300 points and $89 CAD in taxes."
	evidence := []evidenceItem{{tool: "search_award_space", payload: json.RawMessage(`{"results":[]}`)}}

	t.Run("network_error", func(t *testing.T) {
		svc := newSelfCheckSvc(t, verdictTransport{err: errors.New("boom")})
		got := svc.selfCheckReply(context.Background(), reply, evidence, true)
		if got != reply {
			t.Fatalf("network error must fail open, got %q", got)
		}
	})

	t.Run("http_500", func(t *testing.T) {
		svc := newSelfCheckSvc(t, verdictTransport{verdictJSON: "{}", status: http.StatusInternalServerError})
		got := svc.selfCheckReply(context.Background(), reply, evidence, true)
		if got != reply {
			t.Fatalf("http 500 must fail open, got %q", got)
		}
	})

	t.Run("non_json_response", func(t *testing.T) {
		svc := newSelfCheckSvc(t, verdictTransport{verdictJSON: "I think the reply is fine, no JSON here"})
		got := svc.selfCheckReply(context.Background(), reply, evidence, true)
		if got != reply {
			t.Fatalf("non-JSON verdict must fail open, got %q", got)
		}
	})
}

// jsonString JSON-encodes a string into a quoted JSON value for building
// verdict fixtures inline.
func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}
