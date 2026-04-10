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

// TavilyService provides web search capabilities via the Tavily API.
type TavilyService struct {
	apiKey     string
	httpClient *http.Client
}

// NewTavilyService creates a new Tavily web search service.
func NewTavilyService(apiKey string) *TavilyService {
	return &TavilyService{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

// IsAvailable returns true if the Tavily API key is configured.
func (s *TavilyService) IsAvailable() bool {
	return s.apiKey != ""
}

// ── Tavily API types ────────────────────────────────────────────────────────

type tavilyRequest struct {
	APIKey         string   `json:"api_key"`
	Query          string   `json:"query"`
	SearchDepth    string   `json:"search_depth"`
	MaxResults     int      `json:"max_results"`
	IncludeDomains []string `json:"include_domains,omitempty"`
}

type tavilyResponse struct {
	Results []tavilyResult `json:"results"`
}

type tavilyResult struct {
	Title   string  `json:"title"`
	URL     string  `json:"url"`
	Content string  `json:"content"`
	Score   float64 `json:"score"`
}

// Search performs a web search using Tavily.
func (s *TavilyService) Search(ctx context.Context, query string) ([]tavilyResult, error) {
	if s.apiKey == "" {
		return nil, fmt.Errorf("TAVILY_API_KEY not configured")
	}

	reqBody := tavilyRequest{
		APIKey:      s.apiKey,
		Query:       query + " Canada credit card rewards points",
		SearchDepth: "basic",
		MaxResults:  5,
		IncludeDomains: []string{
			"princeoftravel.com",
			"creditcardgenius.ca",
			"reddit.com",
			"pointsnerd.ca",
			"rewardscanada.ca",
			"aeroplan.com",
			"flytrippers.com",
			"milesopedia.com",
		},
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal tavily request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.tavily.com/search", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create tavily request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("tavily API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read tavily response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tavily API error (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var tavilyResp tavilyResponse
	if err := json.Unmarshal(respBody, &tavilyResp); err != nil {
		return nil, fmt.Errorf("decode tavily response: %w", err)
	}

	return tavilyResp.Results, nil
}

// SearchTravel performs a travel-specific search for real-time flight/hotel pricing.
// It does NOT use include_domains because many booking sites block crawlers and
// Tavily's domain filtering expects base domains (not paths like google.com/travel).
// Instead we rely on a well-crafted query to pull relevant results from any indexed source.
func (s *TavilyService) SearchTravel(ctx context.Context, query string) ([]tavilyResult, error) {
	if s.apiKey == "" {
		return nil, fmt.Errorf("TAVILY_API_KEY not configured")
	}

	// Build a travel-optimised query — append pricing keywords so Tavily
	// returns pages with actual price data rather than generic articles.
	travelQuery := query + " flight hotel prices CAD 2026 best deal"

	reqBody := tavilyRequest{
		APIKey:      s.apiKey,
		Query:       travelQuery,
		SearchDepth: "advanced",
		MaxResults:  8,
		// No IncludeDomains — let Tavily return the best results from any site.
		// Restrictive domain lists were causing 0 results because booking sites
		// block crawlers and google.com/travel is a path, not a domain.
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal tavily request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.tavily.com/search", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create tavily request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("tavily API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read tavily response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("tavily API error (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var tavilyResp tavilyResponse
	if err := json.Unmarshal(respBody, &tavilyResp); err != nil {
		return nil, fmt.Errorf("decode tavily response: %w", err)
	}

	return tavilyResp.Results, nil
}

// FormatResultsForPrompt converts search results into markdown context for the AI.
func FormatResultsForPrompt(results []tavilyResult) string {
	if len(results) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("## Live Web Research Results\n\n")
	sb.WriteString("The following are recent web search results relevant to the user's question:\n\n")

	for i, r := range results {
		// Truncate content to ~400 chars to keep prompt manageable
		content := r.Content
		if len(content) > 400 {
			content = content[:400] + "..."
		}
		sb.WriteString(fmt.Sprintf("**%d. %s**\n", i+1, r.Title))
		sb.WriteString(fmt.Sprintf("Source: %s\n", r.URL))
		sb.WriteString(fmt.Sprintf("%s\n\n", content))
	}

	sb.WriteString("Use the above research to provide current, accurate advice. Cite sources when referencing specific data points.\n\n")
	return sb.String()
}

// FormatTravelResultsForPrompt formats Tavily travel search results for the AI prompt.
func FormatTravelResultsForPrompt(results []tavilyResult) string {
	var sb strings.Builder
	sb.WriteString("\n## Web Search Results (Supplementary — articles and blogs)\n")
	sb.WriteString("These are web articles, NOT live booking data. Use for travel tips and context only.\n")
	sb.WriteString("Do NOT quote prices from these articles as exact — they may be outdated.\n\n")
	for i, r := range results {
		if i >= 5 {
			break
		}
		sb.WriteString(fmt.Sprintf("### %s\n", r.Title))
		sb.WriteString(fmt.Sprintf("URL: %s\n", r.URL))
		if r.Content != "" {
			content := r.Content
			if len(content) > 500 {
				content = content[:500] + "..."
			}
			sb.WriteString(content)
		}
		sb.WriteString("\n\n")
	}
	return sb.String()
}
