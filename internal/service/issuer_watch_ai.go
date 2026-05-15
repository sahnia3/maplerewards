package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// summarizeWithAI sends a short prompt to Claude to convert raw added/removed
// lines into a single human-readable headline. Returns the summary and a
// confidence score in [0, 1] derived from how decisive the model's answer
// was. Falls back gracefully if the API is unavailable.
//
// Lives in a separate file so the diff-watch core stays usable without the
// AI dep — IssuerWatchService.SweepAll skips this branch when anthropicKey
// is empty.
func (s *IssuerWatchService) summarizeWithAI(ctx context.Context, pageLabel, diffSnippet string) (string, float64, error) {
	prompt := fmt.Sprintf(
		"You monitor Canadian credit-card issuer pages for changes. "+
			"The diff below is from \"%s\". "+
			"In one sentence (max 25 words), describe what changed in plain English a card-collector would understand. "+
			"If the diff is just navigation/footer noise, respond with the single word IGNORE.\n\n"+
			"DIFF:\n%s",
		pageLabel, diffSnippet,
	)

	body, err := json.Marshal(map[string]any{
		"model":      "claude-3-5-haiku-latest",
		"max_tokens": 120,
		"messages":   []map[string]string{{"role": "user", "content": prompt}},
	})
	if err != nil {
		return "", 0, err
	}

	reqCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", s.anthropicKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode >= 400 {
		return "", 0, fmt.Errorf("anthropic %d: %s", resp.StatusCode, string(respBody))
	}

	var parsed struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", 0, fmt.Errorf("parse anthropic response: %w", err)
	}
	if len(parsed.Content) == 0 {
		return "", 0, fmt.Errorf("empty anthropic response")
	}
	summary := strings.TrimSpace(parsed.Content[0].Text)
	if summary == "" || strings.EqualFold(summary, "IGNORE") {
		return "", 0, fmt.Errorf("model flagged diff as noise")
	}

	// Confidence heuristic: shorter, more decisive summaries score higher.
	conf := 0.7
	if len(summary) < 80 {
		conf = 0.85
	}
	return summary, conf, nil
}
