package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"maplerewards/internal/repo"
)

// PromoSentinelService scans curated rewards-news sources for active
// transfer-bonus promotions (e.g. "Amex MR → Aeroplan 30% off through Apr 30"),
// extracts structured (from, to, bonus%, expires) tuples via Claude, and
// upserts them into transfer_bonus_events.
//
// The worker calls RunSweep on a 12h cadence. Each sweep:
//   1. Queries Tavily for the canonical promo-hunting query
//   2. Pipes the top N article summaries through Claude with strict JSON output
//   3. Upserts each extracted promo
//   4. Returns counts for telemetry
//
// All steps are best-effort: missing API keys turn the sweep into a no-op
// so dev environments don't break.
type PromoSentinelService struct {
	tavily    *TavilyService
	repo      *repo.TransferBonusRepo
	apiKey    string // Anthropic API key
	model     string
	httpClient *http.Client
}

func NewPromoSentinelService(tavily *TavilyService, bonusRepo *repo.TransferBonusRepo, anthropicAPIKey string) *PromoSentinelService {
	model := strings.TrimSpace(os.Getenv("ANTHROPIC_MODEL"))
	if model == "" {
		model = "claude-sonnet-4-6"
	}
	return &PromoSentinelService{
		tavily:    tavily,
		repo:      bonusRepo,
		apiKey:    anthropicAPIKey,
		model:     model,
		// SSRF-safe: sourceURLLive fetches LLM-extracted promo URLs, so the
		// client must refuse to connect to private/internal/metadata addresses.
		httpClient: newSSRFSafeClient(60 * time.Second),
	}
}

// PromoSweepResult is the telemetry payload returned from RunSweep so the
// worker can log how the detector is performing without re-reading the DB.
type PromoSweepResult struct {
	ArticlesScanned int
	PromosExtracted int
	PromosUpserted  int
	PromosSkipped   int
}

// canonicalPromoQuery is the single Tavily query the worker fires. Curated
// for high-precision results; widening it bleeds out into points-collector
// general news which Claude struggles to filter from.
const canonicalPromoQuery = `Canadian credit card loyalty points transfer bonus active promotion 2026 ` +
	`("Amex MR" OR "Aeroplan" OR "Avios" OR "Flying Blue" OR "Marriott Bonvoy" OR "RBC Avion") ` +
	`(30% OR 25% OR 20% OR 40% OR "bonus")`

// RunSweep executes one full detection cycle. Best-effort throughout: a
// failure in any single article doesn't poison the rest.
func (s *PromoSentinelService) RunSweep(ctx context.Context, log *slog.Logger) PromoSweepResult {
	if s.tavily == nil || !s.tavily.IsAvailable() || s.apiKey == "" {
		log.Info("promo sentinel: skipping (TAVILY_API_KEY or ANTHROPIC_API_KEY not set)")
		return PromoSweepResult{}
	}

	// Tavily.Search internally restricts to the rewards-blog whitelist, so
	// we don't need to pass domains explicitly here.
	articles, err := s.tavily.Search(ctx, canonicalPromoQuery)
	if err != nil {
		log.Warn("promo sentinel: tavily failed", "err", err)
		return PromoSweepResult{}
	}

	res := PromoSweepResult{ArticlesScanned: len(articles)}
	liveURL := map[string]bool{} // per-sweep cache: one liveness check per article URL
	for _, article := range articles {
		promos, err := s.extractPromos(ctx, article.Title, article.URL, article.Content)
		if err != nil {
			log.Warn("promo sentinel: extract failed", "url", article.URL, "err", err)
			continue
		}
		// Link health: drop the article's promos if its SOURCE link doesn't
		// resolve (the founder's exact trust break — Prince of Travel /
		// Milesopedia article URLs returning 404). Checked once per URL.
		live, checked := liveURL[article.URL]
		if !checked {
			live = sourceURLLive(ctx, s.httpClient, article.URL)
			liveURL[article.URL] = live
		}
		if !live {
			log.Warn("promo sentinel: source link dead, dropping promos", "url", article.URL)
			res.PromosSkipped += len(promos)
			continue
		}
		if !credibleSource(article.URL) {
			// Tavily's whitelist is supposed to restrict to rewards
			// journalism, but social/aggregator URLs (threads.com, x.com,
			// reddit) leak through and a user clicking "SOURCE" lands on
			// junk — the exact trust break we're fixing. Drop the whole
			// article's promos rather than persist an uncitable claim.
			res.PromosSkipped += len(promos)
			continue
		}
		for _, p := range promos {
			if !validatePromo(p) {
				res.PromosSkipped++
				continue
			}
			fromC := canonicalProgramSlug(p.FromProgram)
			toC := canonicalProgramSlug(p.ToProgram)
			// Geo gate: both endpoints must be Canadian loyalty currencies.
			// Kills US content (Citi AAdvantage, Chase) in a Canadian product.
			if !isCanadianProgram(fromC) || !isCanadianProgram(toC) {
				res.PromosSkipped++
				continue
			}
			res.PromosExtracted++
			ev := repo.TransferBonusEvent{
				FromProgram:  fromC,
				ToProgram:    toC,
				BonusPercent: p.BonusPercent,
				SourceURL:    article.URL,
				SourceTitle:  article.Title,
				Summary:      p.Summary,
				AIConfidence: floatPtrIfSet(p.Confidence),
				ExpiresAt:    parsePromoDate(p.ExpiresAt),
				StartsAt:     parsePromoDate(p.StartsAt),
			}
			if err := s.repo.Upsert(ctx, ev); err != nil {
				log.Warn("promo sentinel: upsert failed", "err", err)
				res.PromosSkipped++
				continue
			}
			res.PromosUpserted++
		}
	}
	log.Info("promo sentinel: sweep complete",
		"scanned", res.ArticlesScanned,
		"extracted", res.PromosExtracted,
		"upserted", res.PromosUpserted,
		"skipped", res.PromosSkipped,
	)
	return res
}

// RecheckSources re-verifies the citation of every still-current promo. A
// source link checked once at scrape time rots (deleted article, expired
// page, or newly Cloudflare-walled), so without this a paying user clicks
// "Source →" and hits a 404/challenge. Dead → flagged out of ListActive;
// recovered → un-flagged so it returns. Uses the same sourceURLLive standard
// as ingest, so behaviour is consistent end to end.
func (s *PromoSentinelService) RecheckSources(ctx context.Context, log *slog.Logger) {
	refs, err := s.repo.ListSourcesForRecheck(ctx)
	if err != nil {
		log.Warn("promo source recheck: list failed", "err", err)
		return
	}
	// Cap the work per sweep and bound concurrency: each probe can take up to
	// ~16s (HEAD then range-GET) and the loop used to be fully sequential,
	// so a large catalog of slow/dead hosts could pin the worker for many
	// minutes. 6 workers + a 200-row cap keeps a sweep bounded.
	const maxWorkers, maxPerSweep = 6, 200
	if len(refs) > maxPerSweep {
		refs = refs[:maxPerSweep]
	}
	var dead, revived int64
	sem := make(chan struct{}, maxWorkers)
	var wg sync.WaitGroup
	for _, ref := range refs {
		wg.Add(1)
		sem <- struct{}{}
		go func(ref repo.SourceRef) {
			defer wg.Done()
			defer func() { <-sem }()
			// Panic isolation: a panic in this background goroutine would crash
			// the whole worker process (taking down every sweep). Recover and log.
			defer func() {
				if rec := recover(); rec != nil {
					log.Error("promo source recheck: recovered panic", "id", ref.ID, "panic", rec)
				}
			}()
			if sourceURLLive(ctx, s.httpClient, ref.SourceURL) {
				// Only count a real recovery (dead → live), not every live promo.
				if flipped, err := s.repo.MarkSourceLive(ctx, ref.ID); err != nil {
					log.Warn("promo source recheck: mark live failed", "id", ref.ID, "err", err)
				} else if flipped {
					atomic.AddInt64(&revived, 1)
				}
				return
			}
			if err := s.repo.MarkSourceDead(ctx, ref.ID); err != nil {
				log.Warn("promo source recheck: mark dead failed", "id", ref.ID, "err", err)
			} else {
				atomic.AddInt64(&dead, 1)
				log.Info("promo source recheck: citation no longer resolves, hidden",
					"id", ref.ID, "url", ref.SourceURL)
			}
		}(ref)
	}
	wg.Wait()
	log.Info("promo source recheck done", "checked", len(refs), "newlyDead", dead, "revived", revived)
}

// extractedPromo is the JSON contract Claude returns. Field names match the
// extraction prompt below — change them in lockstep.
type extractedPromo struct {
	FromProgram  string  `json:"from_program"`
	ToProgram    string  `json:"to_program"`
	BonusPercent float64 `json:"bonus_percent"`
	StartsAt     string  `json:"starts_at,omitempty"`     // YYYY-MM-DD; "" = unknown
	ExpiresAt    string  `json:"expires_at,omitempty"`    // YYYY-MM-DD; "" = ongoing
	Summary      string  `json:"summary"`
	Confidence   float64 `json:"confidence"`              // 0-1
}

func (s *PromoSentinelService) extractPromos(ctx context.Context, title, url, content string) ([]extractedPromo, error) {
	// Cap content — Anthropic doesn't need the full article and tokens add up
	// across a multi-article sweep. 4K chars ≈ 1K tokens which is plenty for
	// most rewards-blog promo posts.
	if len(content) > 4000 {
		content = content[:4000]
	}

	prompt := fmt.Sprintf(`You are extracting transfer-bonus promotions from Canadian credit-card-rewards articles.

Source title: %s
Source URL: %s
Article excerpt:
---
%s
---

Extract every CURRENTLY ACTIVE transfer-bonus promotion mentioned. Output STRICT JSON:
{"promos": [
  {"from_program": "amex-mr-ca", "to_program": "aeroplan", "bonus_percent": 30,
   "starts_at": "2026-04-01", "expires_at": "2026-04-30",
   "summary": "Amex MR Canada → Aeroplan 30%% bonus through April 30 2026",
   "confidence": 0.95}
]}

Rules:
- ONLY include promotions that are still active. Exclude expired ones.
- Use canonical Canadian program slugs: aeroplan, amex-mr-ca, ba-avios, flying-blue,
  marriott-bonvoy, world-of-hyatt, rbc-avion, cibc-aventura, td-rewards, bmo-rewards,
  scene-plus, air-miles, westjet-rewards.
- If the article only mentions historical/past promos, return {"promos": []}.
- If date is missing, leave the field as "".
- Bonus percent is a number (30 not "30%%").
- Output ONLY the JSON. No prose.
`, title, url, content)

	body := map[string]any{
		"model":      s.model,
		"max_tokens": 800,
		"messages": []map[string]any{
			{"role": "user", "content": prompt},
		},
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.anthropic.com/v1/messages", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", s.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("do: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck // close on read-only response body
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<10))
		return nil, fmt.Errorf("anthropic %d: %s", resp.StatusCode, strings.TrimSpace(string(raw)))
	}

	var parsed struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	var text string
	for _, b := range parsed.Content {
		if b.Type == "text" {
			text = b.Text
			break
		}
	}
	if text == "" {
		return nil, nil
	}

	return parseExtractedPromos(text)
}

// parseExtractedPromos is the JSON-extraction shim that handles Claude
// sometimes wrapping JSON in prose or markdown fences. Exported for tests.
func parseExtractedPromos(raw string) ([]extractedPromo, error) {
	raw = strings.TrimSpace(raw)
	// Strip markdown code fences if present.
	if strings.HasPrefix(raw, "```") {
		if i := strings.Index(raw, "\n"); i >= 0 {
			raw = raw[i+1:]
		}
		if i := strings.LastIndex(raw, "```"); i >= 0 {
			raw = raw[:i]
		}
	}
	// Find the first { and last } to skip any trailing prose.
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start < 0 || end <= start {
		return nil, fmt.Errorf("no JSON object found in response")
	}
	raw = raw[start : end+1]

	var wrapper struct {
		Promos []extractedPromo `json:"promos"`
	}
	if err := json.Unmarshal([]byte(raw), &wrapper); err != nil {
		return nil, fmt.Errorf("unmarshal promos: %w", err)
	}
	return wrapper.Promos, nil
}

// validatePromo enforces the minimum-quality bar for a row we'd persist.
// Defends against the LLM hallucinating a 5%-bonus or returning incomplete
// data — better to drop the row than mislead a Pro user.
func validatePromo(p extractedPromo) bool {
	if p.FromProgram == "" || p.ToProgram == "" {
		return false
	}
	if p.BonusPercent < 10 || p.BonusPercent > 200 {
		return false
	}
	if p.Confidence > 0 && p.Confidence < 0.5 {
		return false
	}
	if p.FromProgram == p.ToProgram {
		return false
	}
	// Require a parsable end date. A real transfer bonus is time-bounded;
	// a NULL/"ongoing" expiry is almost always a mis-extraction and is
	// exactly what made the feed untrustworthy — such rows render as
	// "ONGOING" forever (an April promo still showing live in May). If we
	// can't pin an end date, we don't present it as a confident live promo.
	exp := parsePromoDate(p.ExpiresAt)
	if exp == nil {
		return false
	}
	// Reject already-expired and absurdly-far-future (>1y = likely a
	// hallucinated/mis-parsed year) windows. Compare on DATE granularity so
	// a promo expiring *today* is kept — parsed dates are midnight, so a
	// raw exp.Before(now) would drop a still-valid same-day promo and
	// disagree with the read query (expires_at >= CURRENT_DATE).
	now := time.Now()
	ey, em, ed := exp.Date()
	ny, nm, nd := now.Date()
	expDate := time.Date(ey, em, ed, 0, 0, 0, 0, time.UTC)
	todayDate := time.Date(ny, nm, nd, 0, 0, 0, 0, time.UTC)
	if expDate.Before(todayDate) || exp.After(now.AddDate(1, 0, 0)) {
		return false
	}
	return true
}

// credibleSource rejects social/aggregator and non-https URLs. A promo's
// "SOURCE" link must point at citable rewards journalism or an issuer page,
// never threads.com / x.com / a reddit thread.
func credibleSource(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return false
	}
	host := strings.TrimPrefix(strings.ToLower(u.Host), "www.")
	blocked := []string{
		"threads.com", "threads.net", "x.com", "twitter.com",
		"facebook.com", "instagram.com", "reddit.com", "tiktok.com",
		"t.co", "youtube.com", "medium.com",
	}
	for _, b := range blocked {
		if host == b || strings.HasSuffix(host, "."+b) {
			return false
		}
	}
	return true
}

// canadianPrograms is the geo allowlist: a promo whose canonicalised
// from/to program is not a Canadian loyalty currency is dropped. This is the
// hard guard against US content leaking into a Canadian product
// (LAUNCH-ISSUES.md P0.5: "Citi AAdvantage", "Chase Total Checking"). It
// mirrors the canonical-slug list in the extraction prompt.
var canadianPrograms = map[string]bool{
	"aeroplan": true, "amex-mr-ca": true, "ba-avios": true, "flying-blue": true,
	"marriott-bonvoy": true, "world-of-hyatt": true, "rbc-avion": true,
	"cibc-aventura": true, "td-rewards": true, "bmo-rewards": true,
	"scene-plus": true, "air-miles": true, "westjet-rewards": true,
}

func isCanadianProgram(canonicalSlug string) bool {
	return canadianPrograms[strings.ToLower(strings.TrimSpace(canonicalSlug))]
}

// sourceURLLive verifies a promo's "SOURCE" link actually resolves before we
// persist it. credibleSource only checks URL *shape*; the founder's core
// trust break was citable-looking domains (Prince of Travel, Milesopedia)
// whose specific article URLs 404. HEAD first; many sites 405/403 HEAD, so
// fall back to a range-limited GET. 2xx/3xx = live; anything else (incl.
// transport error / timeout) = treat as dead and drop the promo rather than
// surface an uncitable 404 link.
func sourceURLLive(ctx context.Context, client *http.Client, rawURL string) bool {
	cctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	try := func(method string) (int, error) {
		req, err := http.NewRequestWithContext(cctx, method, rawURL, nil)
		if err != nil {
			return 0, err
		}
		req.Header.Set("User-Agent", "MapleRewardsPromoSentinel/1.0")
		if method == http.MethodGet {
			req.Header.Set("Range", "bytes=0-0")
		}
		resp, err := client.Do(req)
		if err != nil {
			return 0, err
		}
		resp.Body.Close() //nolint:errcheck // close on read-only response body
		return resp.StatusCode, nil
	}
	if code, err := try(http.MethodHead); err == nil && code >= 200 && code < 400 {
		return true
	}
	code, err := try(http.MethodGet)
	return err == nil && code >= 200 && code < 400
}

// parsePromoDate is deliberately tolerant. The prompt asks for YYYY-MM-DD but
// LLMs routinely emit RFC3339, slashed, or long-form dates; since validatePromo
// now hard-rejects an unparsable expiry, a strict parser would silently starve
// the feed of legitimate promos. Try the common shapes, first match wins.
func parsePromoDate(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	layouts := []string{
		"2006-01-02",
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006/01/02",
		"01/02/2006",
		"January 2, 2006",
		"Jan 2, 2006",
		"2 January 2006",
	}
	for _, l := range layouts {
		if t, err := time.Parse(l, s); err == nil {
			return &t
		}
	}
	return nil
}

func floatPtrIfSet(v float64) *float64 {
	if v == 0 {
		return nil
	}
	return &v
}
