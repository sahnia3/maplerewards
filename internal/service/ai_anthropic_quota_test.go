package service

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"maplerewards/internal/quota"
)

// rtFunc adapts a function to http.RoundTripper so a test can intercept the
// outbound Anthropic POST without a live server (the URL is hardcoded in
// callClaudeWithTools).
type rtFunc func(*http.Request) (*http.Response, error)

func (f rtFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

// newAnthropicResp builds a minimal valid /v1/messages 200 body.
func newAnthropicResp() *http.Response {
	const body = `{"content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn"}`
	return &http.Response{
		StatusCode: http.StatusOK,
		Body:       io.NopCloser(strings.NewReader(body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}
}

// TestCallClaudeWithTools_AnthropicQuotaGate verifies the global monthly
// backstop is wired into the Claude call path: the quota client is charged
// against the "anthropic" provider, an exhausted/degraded quota short-circuits
// BEFORE any HTTP call (returning the clean ErrAnthropicQuotaExhausted), and an
// allowed quota lets the request through.
func TestCallClaudeWithTools_AnthropicQuotaGate(t *testing.T) {
	t.Run("allowed_charges_anthropic_and_calls_api", func(t *testing.T) {
		var httpCalled bool
		s := &AIService{
			apiKey:  "test-key",
			modelID: "claude-test",
			httpClient: &http.Client{
				Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
					httpCalled = true
					if got := r.URL.String(); !strings.Contains(got, "api.anthropic.com") {
						t.Fatalf("unexpected URL: %s", got)
					}
					return newAnthropicResp(), nil
				}),
			},
		}
		stub := &stubQuota{}
		s.quota = stub

		// Tier carried via context, exactly as ChatWithToolsStream sets it.
		ctx := withQuotaTier(context.Background(), quota.TierPro)
		_, err := s.callClaudeWithTools(ctx, nil, nil, nil, 1024, "claude-test")
		if err != nil {
			t.Fatalf("unexpected err: %v", err)
		}
		if !httpCalled {
			t.Fatal("expected the Anthropic API to be called when quota allows")
		}
		if len(stub.calls) != 1 || stub.calls[0] != "anthropic" {
			t.Fatalf("quota charged against %v, want exactly one [anthropic] call", stub.calls)
		}
		if len(stub.tiers) != 1 || stub.tiers[0] != quota.TierPro {
			t.Fatalf("quota charged tier %v, want [TierPro]", stub.tiers)
		}
	})

	t.Run("exhausted_blocks_call_and_returns_sentinel", func(t *testing.T) {
		var httpCalled bool
		s := &AIService{
			apiKey:  "test-key",
			modelID: "claude-test",
			httpClient: &http.Client{
				Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
					httpCalled = true
					return newAnthropicResp(), nil
				}),
			},
			quota: &stubQuota{
				spendFn: func(ctx context.Context, provider string, tier quota.Tier) (int, bool, error) {
					return 0, true, nil // exhausted
				},
			},
		}
		_, err := s.callClaudeWithTools(context.Background(), nil, nil, nil, 1024, "claude-test")
		if !errors.Is(err, ErrAnthropicQuotaExhausted) {
			t.Fatalf("want ErrAnthropicQuotaExhausted, got %v", err)
		}
		if httpCalled {
			t.Fatal("exhausted quota must NOT make the paid Anthropic call")
		}
	})

	t.Run("quota_error_fails_closed", func(t *testing.T) {
		var httpCalled bool
		s := &AIService{
			apiKey:  "test-key",
			modelID: "claude-test",
			httpClient: &http.Client{
				Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
					httpCalled = true
					return newAnthropicResp(), nil
				}),
			},
			quota: &stubQuota{
				spendFn: func(ctx context.Context, provider string, tier quota.Tier) (int, bool, error) {
					return 0, true, errors.New("redis down")
				},
			},
		}
		_, err := s.callClaudeWithTools(context.Background(), nil, nil, nil, 1024, "claude-test")
		if !errors.Is(err, ErrAnthropicQuotaExhausted) {
			t.Fatalf("want ErrAnthropicQuotaExhausted on quota error (fail-closed), got %v", err)
		}
		if httpCalled {
			t.Fatal("a quota error must fail closed — no paid Anthropic call")
		}
	})

	t.Run("nil_quota_skips_check", func(t *testing.T) {
		var httpCalled bool
		s := &AIService{
			apiKey:  "test-key",
			modelID: "claude-test",
			httpClient: &http.Client{
				Transport: rtFunc(func(r *http.Request) (*http.Response, error) {
					httpCalled = true
					return newAnthropicResp(), nil
				}),
			},
			quota: nil, // unit-test mode: check skipped
		}
		if _, err := s.callClaudeWithTools(context.Background(), nil, nil, nil, 1024, "claude-test"); err != nil {
			t.Fatalf("unexpected err with nil quota: %v", err)
		}
		if !httpCalled {
			t.Fatal("nil quota must skip the check and call the API")
		}
	})
}
