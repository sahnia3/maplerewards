package handler

import (
	"strings"
	"testing"

	"maplerewards/internal/model"
	"maplerewards/internal/service"
)

func histOf(n, charsEach int) []model.ChatMessage {
	out := make([]model.ChatMessage, n)
	body := strings.Repeat("x", charsEach)
	for i := range out {
		role := "assistant"
		if i%2 == 0 {
			role = "user"
		}
		out[i] = model.ChatMessage{Role: role, Content: body}
	}
	return out
}

// Regression for the false-413: a normal multi-turn chat (20 moderate
// messages) used to be rejected because the estimate summed the RAW uncapped
// history while the 14k ceiling was sized for the capped payload. The estimate
// now measures the same CapHistoryForLLM view the LLM receives, so it passes.
func TestEstimateRequestInputTokens_RealisticChatNotRejected(t *testing.T) {
	req := service.ChatRequest{
		Message: "What's the best card for groceries?",
		History: histOf(20, 2500), // 50k chars raw → old estimate ~17.3k > 14k
	}
	est := estimateRequestInputTokens(req)
	if service.RequestTooLarge(est) {
		t.Fatalf("realistic 20-message chat falsely rejected: est=%d (ceiling %d)", est, service.MaxTokensPerRequest)
	}
}

// The estimate must be bounded by the history cap: a 200-message history can
// never estimate higher than the capped maximum, so padding history can't be
// used to inflate (or, post-fix, the estimate stops growing past the cap).
func TestEstimateRequestInputTokens_BoundedByCap(t *testing.T) {
	capped := estimateRequestInputTokens(service.ChatRequest{History: histOf(12, 8000)})
	huge := estimateRequestInputTokens(service.ChatRequest{History: histOf(200, 8000)})
	if huge != capped {
		t.Fatalf("estimate not bounded by CapHistoryForLLM: 12-msg=%d vs 200-msg=%d (should be equal)", capped, huge)
	}
}
