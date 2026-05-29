package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"time"

	"maplerewards/internal/repo"
)

// IssuerWatchService fetches each curated issuer page on a fixed cadence,
// hashes the rendered text, diffs against the previous snapshot, and when
// the page has changed it stores a row + an AI-summarized one-liner.
type IssuerWatchService struct {
	repo       *repo.IssuerPageRepo
	httpClient *http.Client
	// Optional: when set, the service asks Claude to summarize what changed.
	// When empty, the diff is stored without an AI summary (the snippet still
	// lets a human skim the change).
	anthropicKey string
}

// NewIssuerWatchService constructs the service. Pass an empty anthropicKey to
// disable AI summaries (the worker will still store the raw change snippet).
func NewIssuerWatchService(r *repo.IssuerPageRepo, anthropicKey string) *IssuerWatchService {
	return &IssuerWatchService{
		repo: r,
		// SSRF-safe: refuse to connect to private/internal/metadata addresses
		// even though issuer URLs are admin-seeded (defense in depth).
		httpClient:   newSSRFSafeClient(30 * time.Second),
		anthropicKey: anthropicKey,
	}
}

// SweepResult is the per-sweep summary the worker logs.
type SweepResult struct {
	PagesChecked   int
	PagesChanged   int
	PagesUnchanged int
	PagesFailed    int
}

// SweepAll re-checks every active page. One slow fetch shouldn't poison the
// whole sweep — failures are counted but don't abort.
func (s *IssuerWatchService) SweepAll(ctx context.Context, batchSize int) (SweepResult, error) {
	pages, err := s.repo.ListActiveWithSnapshots(ctx, batchSize)
	if err != nil {
		return SweepResult{}, fmt.Errorf("list issuer pages: %w", err)
	}
	res := SweepResult{}
	for _, p := range pages {
		probeCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
		changed, err := s.probeOne(probeCtx, p)
		cancel()
		res.PagesChecked++
		switch {
		case err != nil:
			res.PagesFailed++
			_ = s.repo.RecordCheckFailure(ctx, p.ID)
			slog.Warn("[issuer-watch] probe failed", "page", p.Label, "err", err)
		case changed:
			res.PagesChanged++
		default:
			res.PagesUnchanged++
		}
	}
	return res, nil
}

// probeOne fetches one page, normalises it to text, hashes, and writes a
// change row when it differs from the prior snapshot. Returns whether a
// change was detected.
func (s *IssuerWatchService) probeOne(ctx context.Context, p repo.PageWithSnapshot) (bool, error) {
	body, err := s.fetch(ctx, p.URL)
	if err != nil {
		return false, err
	}
	text := htmlToText(body)
	hash := sha256Hex(text)

	// First run for this page — store the snapshot, no diff to make.
	if p.LastHash == nil || *p.LastHash == "" {
		return false, s.repo.RecordSnapshot(ctx, p.ID, hash, text)
	}

	// Same hash — bump check timestamp only.
	if *p.LastHash == hash {
		return false, s.repo.RecordCheckOnly(ctx, p.ID)
	}

	// Trivial diff guard: don't alert on noise. Many issuer pages contain a
	// timestamp or A/B-test marker that flips the hash without changing
	// content. Require ≥ 80 chars of diff to count as meaningful.
	added, removed := lineDiff(p.LastText, text)
	netDiff := joinDiff(added, removed)
	if len(strings.TrimSpace(netDiff)) < 80 {
		return false, s.repo.RecordSnapshot(ctx, p.ID, hash, text)
	}

	// Build the snippet shown in the UI — first ~500 chars of the diff is
	// usually the lead change.
	snippet := truncate(netDiff, 500)

	summary, confidence := "Page content changed — review.", (*float64)(nil)
	if s.anthropicKey != "" {
		if aiSummary, conf, err := s.summarizeWithAI(ctx, p.Label, snippet); err == nil {
			summary = aiSummary
			confidence = &conf
		} else {
			slog.Warn("[issuer-watch] AI summarize failed (using fallback)", "page", p.Label, "err", err)
		}
	}

	if err := s.repo.InsertChange(ctx, p.ID, summary, snippet, confidence); err != nil {
		return false, fmt.Errorf("insert change: %w", err)
	}
	if err := s.repo.RecordSnapshot(ctx, p.ID, hash, text); err != nil {
		return true, fmt.Errorf("record snapshot: %w", err)
	}
	return true, nil
}

func (s *IssuerWatchService) fetch(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	// Issuer sites cloak content from generic crawlers; identifying as a
	// Chrome user-agent makes the cooperative ones serve us the real page.
	req.Header.Set("User-Agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "en-CA,en;q=0.9")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("http get: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck // close on read-only response body
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("http status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024)) // cap at 2 MB
	if err != nil {
		return "", fmt.Errorf("read body: %w", err)
	}
	return string(body), nil
}

// ── Text extraction + diffing ──────────────────────────────────────────────

var (
	rxScript = regexp.MustCompile(`(?is)<script[^>]*>.*?</script>`)
	rxStyle  = regexp.MustCompile(`(?is)<style[^>]*>.*?</style>`)
	rxComment = regexp.MustCompile(`(?s)<!--.*?-->`)
	rxTag    = regexp.MustCompile(`<[^>]+>`)
	rxWS     = regexp.MustCompile(`[ \t]+`)
	rxBlank  = regexp.MustCompile(`\n[\n]+`)
)

// htmlToText is a deliberately small HTML→text reducer. Good enough for
// monitoring — strip script/style, replace tags with newlines, collapse
// whitespace. We don't try to faithfully render a page; we just want a
// stable text representation that diffs cleanly across hashes.
func htmlToText(html string) string {
	s := html
	s = rxScript.ReplaceAllString(s, "")
	s = rxStyle.ReplaceAllString(s, "")
	s = rxComment.ReplaceAllString(s, "")
	s = rxTag.ReplaceAllString(s, "\n")
	s = rxWS.ReplaceAllString(s, " ")
	s = rxBlank.ReplaceAllString(s, "\n")
	return strings.TrimSpace(s)
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// lineDiff returns added and removed lines using a simple set difference. We
// don't bother with longest-common-subsequence — issuer pages are short and
// re-ordered lines are vanishingly rare.
func lineDiff(oldText, newText string) (added, removed []string) {
	oldSet := map[string]struct{}{}
	for _, l := range strings.Split(oldText, "\n") {
		l = strings.TrimSpace(l)
		if l != "" {
			oldSet[l] = struct{}{}
		}
	}
	newSet := map[string]struct{}{}
	for _, l := range strings.Split(newText, "\n") {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		newSet[l] = struct{}{}
		if _, ok := oldSet[l]; !ok {
			added = append(added, l)
		}
	}
	for l := range oldSet {
		if _, ok := newSet[l]; !ok {
			removed = append(removed, l)
		}
	}
	return added, removed
}

func joinDiff(added, removed []string) string {
	var b strings.Builder
	for _, a := range added {
		b.WriteString("+ ")
		b.WriteString(a)
		b.WriteString("\n")
	}
	for _, r := range removed {
		b.WriteString("- ")
		b.WriteString(r)
		b.WriteString("\n")
	}
	return b.String()
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
