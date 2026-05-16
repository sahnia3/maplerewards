package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

/* feed_aggregator pulls RSS / Atom from a curated set of rewards-card
 * blogs and subreddits, dedupes by URL, categorizes by keyword on the
 * title + summary, and caches the merged result in Redis for 2 hours.
 *
 * Why RSS instead of scraping HTML: free, reliable, mostly real-time,
 * no rate limits we need to worry about, no anti-bot dance. Every blog
 * here exposes a feed; Reddit exposes `.rss` per subreddit.
 *
 * Why a single aggregated cache key instead of per-source: callers
 * always want the merged feed. Splitting per-source would require
 * a fan-in step on every request. */

// ── Public types ─────────────────────────────────────────────────────────────

// FeedArticle is what the handler returns to the frontend.
type FeedArticle struct {
	ID          string    `json:"id"`           // hex of sha256(url) — stable across refreshes
	Title       string    `json:"title"`
	URL         string    `json:"url"`          // canonical article URL, opens in new tab
	Excerpt     string    `json:"excerpt"`      // plain-text summary, ~280 chars max
	Source      string    `json:"source"`       // human-readable site name
	Category    string    `json:"category"`     // devaluation / bonus / offer / news
	ImageURL    string    `json:"image_url"`    // first image found in feed item; may be empty
	PublishedAt time.Time `json:"published_at"`
}

// FeedCache is the minimal cache contract the aggregator depends on.
// Satisfied by *cache.Cache; declared here so tests can plug in a double.
type FeedCache interface {
	GetFeed(ctx context.Context, key string) ([]byte, bool, error)
	SetFeed(ctx context.Context, key string, payload []byte, ttl time.Duration) error
}

// ── Sources ──────────────────────────────────────────────────────────────────

type feedSource struct {
	Name string // human-readable label shown in the UI
	URL  string // RSS or Atom feed URL
}

// feedSources is the curated list. Order doesn't affect the merged feed
// (it's resorted by publish date) but keeping Canadian sources first
// signals intent if the parse logs ever surface.
var feedSources = []feedSource{
	{"Prince of Travel",     "https://princeoftravel.com/feed/"},
	{"Milesopedia",          "https://milesopedia.com/feed/"},
	{"Doctor of Credit",     "https://www.doctorofcredit.com/feed/"},
	{"The Points Guy",       "https://thepointsguy.com/feed/"},
	{"One Mile at a Time",   "https://onemileatatime.com/feed/"},
	{"View From The Wing",   "https://viewfromthewing.com/feed/"},
	{"r/AmexCanada",         "https://www.reddit.com/r/AmexCanada/.rss"},
	{"r/Aeroplan",           "https://www.reddit.com/r/Aeroplan/.rss"},
	{"r/CreditCardsCanada",  "https://www.reddit.com/r/CreditCardsCanada/.rss"},
	{"r/churning",           "https://www.reddit.com/r/churning/.rss"},
}

const (
	feedCacheKey  = "articles:v3"
	feedCacheTTL  = 2 * time.Hour
	feedMaxItems  = 80
	feedFetchTime = 10 * time.Second
)

// ── Relevance gate ───────────────────────────────────────────────────────────
//
// The source list (Doctor of Credit, The Points Guy, View From The Wing, OMAAT,
// even rewards subreddits) publishes a lot of content that has nothing to do
// with credit-card rewards: airline cancellations, gift-card store promos
// (Kroger / Chipotle / White Castle), tax advice, banking trivia. We aggregate
// these sources because they ALSO cover cards/points well — but every item
// must pass the relevance gate before it makes it into the feed.
//
// Two positive lists. An article qualifies if it matches at least one of:
//   1) cardKeywords  — issuer brands, card product names, "credit card", etc.
//   2) pointsKeywords — loyalty program names, "miles", "redeem", "transfer", etc.
// Anything matching neither is dropped at aggregation time.

var (
	cardKeywords = regexp.MustCompile(`(?i)` + strings.Join([]string{
		// Generic vocabulary
		`\bcredit\s+card`, `\brewards?\s+card`, `\bcharge\s+card`,
		`\bannual\s+fee`, `\bwelcome\s+bonus`, `\bsign[-\s]?up\s+bonus`, `\bSUB\b`,
		`\bsignup\s+offer`, `\bpublic\s+offer`, `\btargeted\s+offer`, `\belevated\s+offer`,
		`\bcashback\b`, `\bcash\s+back\b`, `\bearn\s+rate`, `\bmultiplier`,
		`\bminimum\s+spend`, `\bspend\s+threshold`,
		`\bcategory\s+cap`, `\bspend\s+cap`,
		`\b\d+\s*x\s+(?:points?|miles?)`,
		// Canadian issuer brands
		`\bRBC\b`, `\bTD\b`, `\bBMO\b`, `\bCIBC\b`, `\bScotia(?:bank)?\b`,
		`\bNational\s+Bank`, `\bDesjardins\b`, `\bMBNA\b`, `\bTangerine\b`,
		`\bSimplii\b`, `\bRogers\s+Bank`, `\bBrim\b`, `\bPC\s+Financial`,
		`\bCanadian\s+Tire\s+(?:Triangle|Mastercard)`,
		// US issuer brands (still relevant — many users transfer/value)
		`\bAmex\b`, `\bAmerican\s+Express`, `\bChase\b`, `\bCiti\b`, `\bCapital\s+One`,
		`\bWells\s+Fargo`, `\bUS\s+Bank`, `\bBarclays\b`, `\bSynchrony`,
		// Major card product names
		`\bCobalt\b`, `\bAventura\b`, `\bAvion\b`, `\bInfinite\b`,
		`\bWorld\s+Elite`, `\bPlatinum\b`, `\bSapphire\b`, `\bMomentum\b`,
		`\bPassport\b`, `\bGold\s+Card`, `\bGold\s+Rewards`,
		`\bAir\s+Miles\b`, `\bPC\s+Optimum`, `\bCostco\s+Mastercard`,
	}, "|"))

	pointsKeywords = regexp.MustCompile(`(?i)` + strings.Join([]string{
		// Program names
		`\bAeroplan\b`, `\bAir\s+Canada\s+(?:Rewards|Vacations|Bistro)`,
		`\bSPG\b`, `\bMarriott\s+Bonvoy`, `\bBonvoy\b`,
		`\bHyatt\b`, `\bHilton\s+Honors`, `\bIHG\s+One\s+Rewards?`, `\bAccor\s+Live`,
		`\bUnited\s+MileagePlus`, `\bDelta\s+SkyMiles?`, `\bAmerican\s+AAdvantage`,
		`\bAlaska\s+Mileage(?:\s+Plan)?`, `\bJetBlue\s+TrueBlue`,
		`\bSouthwest\s+Rapid\s+Rewards?`, `\bBritish\s+Airways?\s+(?:Avios|Executive)`,
		`\bAvios\b`, `\bSingapore\s+KrisFlyer`, `\bANA\s+Mileage`,
		`\bLifeMiles?\b`, `\bFlying\s+Blue`, `\bTAP\s+Miles`, `\bVirgin\s+(?:Red|Atlantic)`,
		`\bWestJet\s+Rewards?`, `\bScene\s*\+`, `\bScene\b\+`, `\bMembership\s+Rewards`, `\bMR\s+(?:points|transfer|rate)`,
		`\bUltimate\s+Rewards`, `\bThankYou\s+(?:points|rewards)`, `\bVenture\s+Miles`,
		// Generic
		`\bpoints?\s+transfer`, `\btransfer\s+partner`, `\bredeem(?:ed|ing)?\s+(?:points?|miles?)`,
		`\bsweet\s+spot`, `\baward\s+(?:chart|space|seat|booking|sale)`,
		`\bpoints?\s+devalu`, `\bmiles?\s+devalu`,
		`\bCPP\b`, `\bcents?\s+per\s+(?:point|mile)`,
		`\bSQC\b`, `\bstatus\s+qualifying`,
		`\belite\s+status`, `\b(?:loyalty|frequent\s+flyer)\s+program`,
		`\bbuy\s+points?`, `\bpoints?\s+sale`, `\bmiles?\s+bonus`,
	}, "|"))
)

func isCardRelevant(title, summary string) bool {
	combined := title + " " + summary
	return cardKeywords.MatchString(combined) || pointsKeywords.MatchString(combined)
}

// ── Category classification ──────────────────────────────────────────────────
// Cheap keyword-based bucketing on title + summary. The first category
// whose keywords match wins. Default for relevant-but-uncategorized articles
// is "news". The categories map 1:1 to the filter pills on the frontend.

type category struct {
	slug     string
	keywords *regexp.Regexp
}

var feedCategories = []category{
	{"devaluation", regexp.MustCompile(`(?i)\b(devalu|sunset|retired?|dropped|cut|reduce[sd]?|nerf|worse|losing|losing\s+value|increase[sd]?\s+award)\b`)},
	{"bonus",       regexp.MustCompile(`(?i)\b(welcome\s+bonus|sign[-\s]?up\s+bonus|\bSUB\b|elevated|increased\s+offer|public\s+offer|new\s+highest|targeted|best\s+ever)\b`)},
	{"offer",       regexp.MustCompile(`(?i)\b(promotion|cashback|points?\s+earn|earn\s+points?|rebate|amex\s+offer|points?\s+sale|bonus\s+points?)\b`)},
	{"guide",       regexp.MustCompile(`(?i)\b(guide|how\s+to|review|comparison|vs\.?\s|sweet\s+spot|best\s+way)\b`)},
}

func classify(title, summary string) string {
	combined := title + " " + summary
	for _, c := range feedCategories {
		if c.keywords.MatchString(combined) {
			return c.slug
		}
	}
	return "news"
}

// ── Parser structs — supports both RSS 2.0 and Atom 1.0 ─────────────────────

type rssFeed struct {
	Channel struct {
		Items []struct {
			Title       string    `xml:"title"`
			Link        string    `xml:"link"`
			Description string    `xml:"description"`
			Content     string    `xml:"http://purl.org/rss/1.0/modules/content/ encoded"`
			PubDate     string    `xml:"pubDate"`
			Enclosure   struct {
				URL  string `xml:"url,attr"`
				Type string `xml:"type,attr"`
			} `xml:"enclosure"`
			Media struct {
				URL string `xml:"url,attr"`
			} `xml:"http://search.yahoo.com/mrss/ content"`
			Thumbnail struct {
				URL string `xml:"url,attr"`
			} `xml:"http://search.yahoo.com/mrss/ thumbnail"`
			Other struct{} `xml:"-"` // catch-all placeholder; ignored on marshal
		} `xml:"item"`
	} `xml:"channel"`
}

type atomFeed struct {
	Entries []struct {
		Title   string `xml:"title"`
		Links   []struct {
			Href string `xml:"href,attr"`
			Rel  string `xml:"rel,attr"`
			Type string `xml:"type,attr"`
		} `xml:"link"`
		Summary   string `xml:"summary"`
		Content   string `xml:"content"`
		Published string `xml:"published"`
		Updated   string `xml:"updated"`
	} `xml:"entry"`
}

// ── Service ──────────────────────────────────────────────────────────────────

type FeedAggregatorService struct {
	cache  FeedCache
	client *http.Client
	logger *slog.Logger
}

func NewFeedAggregatorService(cache FeedCache, logger *slog.Logger) *FeedAggregatorService {
	if logger == nil {
		logger = slog.Default()
	}
	return &FeedAggregatorService{
		cache: cache,
		client: &http.Client{
			Timeout: feedFetchTime,
		},
		logger: logger,
	}
}

// Articles returns the aggregated, deduped, date-sorted slice of articles.
// On cache hit (warm path) the call returns instantly. On miss it fans out
// to every source in parallel, caps total time at feedFetchTime, and writes
// the result to the cache before returning.
func (s *FeedAggregatorService) Articles(ctx context.Context, category string) ([]FeedArticle, error) {
	all, err := s.cachedAll(ctx)
	if err != nil {
		return nil, err
	}

	if category == "" || category == "all" {
		return all, nil
	}

	filtered := make([]FeedArticle, 0, len(all))
	for _, a := range all {
		if a.Category == category {
			filtered = append(filtered, a)
		}
	}
	return filtered, nil
}

func (s *FeedAggregatorService) cachedAll(ctx context.Context) ([]FeedArticle, error) {
	if s.cache != nil {
		if data, hit, err := s.cache.GetFeed(ctx, feedCacheKey); err == nil && hit {
			var out []FeedArticle
			if err := json.Unmarshal(data, &out); err == nil {
				return out, nil
			}
		}
	}

	fresh := s.fetchAll(ctx)

	if s.cache != nil && len(fresh) > 0 {
		if data, err := json.Marshal(fresh); err == nil {
			if err := s.cache.SetFeed(ctx, feedCacheKey, data, feedCacheTTL); err != nil {
				s.logger.Warn("feed cache set failed", "err", err)
			}
		}
	}

	return fresh, nil
}

// fetchAll concurrently fetches every source, merges, dedupes, sorts.
func (s *FeedAggregatorService) fetchAll(ctx context.Context) []FeedArticle {
	var (
		mu       sync.Mutex
		articles []FeedArticle
		wg       sync.WaitGroup
	)

	for _, src := range feedSources {
		wg.Add(1)
		go func(src feedSource) {
			defer wg.Done()
			// Recover panics so a malformed feed (HTML schema drift, nil deref)
			// doesn't crash the entire API process. WaitGroup still releases.
			defer func() {
				if r := recover(); r != nil {
					s.logger.Error("feed source panic recovered", "source", src.Name, "err", r)
				}
			}()
			items, err := s.fetchSource(ctx, src)
			if err != nil {
				s.logger.Warn("feed source fetch failed", "source", src.Name, "err", err)
				return
			}
			mu.Lock()
			articles = append(articles, items...)
			mu.Unlock()
		}(src)
	}
	wg.Wait()

	// Dedupe by URL — different sources occasionally syndicate the same post.
	seen := make(map[string]struct{}, len(articles))
	dedup := make([]FeedArticle, 0, len(articles))
	for _, a := range articles {
		if _, dup := seen[a.URL]; dup {
			continue
		}
		seen[a.URL] = struct{}{}
		dedup = append(dedup, a)
	}

	// Date descending. Items without a parseable date sort last.
	sort.Slice(dedup, func(i, j int) bool {
		return dedup[i].PublishedAt.After(dedup[j].PublishedAt)
	})

	if len(dedup) > feedMaxItems {
		dedup = dedup[:feedMaxItems]
	}
	return dedup
}

// fetchSource hits one feed URL, tries RSS first, falls back to Atom.
func (s *FeedAggregatorService) fetchSource(ctx context.Context, src feedSource) ([]FeedArticle, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src.URL, nil)
	if err != nil {
		return nil, err
	}
	// Reddit blocks the Go default UA. Set a polite browser-y UA.
	req.Header.Set("User-Agent", "MapleRewards/1.0 (+https://maplerewards.app)")
	req.Header.Set("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("source %s status %d", src.Name, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20)) // 4MB cap
	if err != nil {
		return nil, err
	}

	if articles := parseRSS(body, src.Name); len(articles) > 0 {
		return articles, nil
	}
	if articles := parseAtom(body, src.Name); len(articles) > 0 {
		return articles, nil
	}
	return nil, errors.New("no parseable items")
}

// ── Parsers ──────────────────────────────────────────────────────────────────

func parseRSS(body []byte, sourceName string) []FeedArticle {
	var feed rssFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil
	}
	if len(feed.Channel.Items) == 0 {
		return nil
	}

	out := make([]FeedArticle, 0, len(feed.Channel.Items))
	for _, item := range feed.Channel.Items {
		link := strings.TrimSpace(item.Link)
		if link == "" {
			continue
		}
		title := htmlTextOnly(item.Title)
		summary := excerpt(item.Description, item.Content)
		/* Relevance gate — drop items unrelated to credit cards / points
		 * BEFORE they get aggregated. Source blogs publish lots of
		 * adjacent content (airline operational news, retail gift-card
		 * promos) that we don't want surfacing here. */
		if !isCardRelevant(title, summary) {
			continue
		}
		published := parseFeedDate(item.PubDate)

		image := firstNonEmpty(item.Media.URL, item.Thumbnail.URL)
		if image == "" && strings.HasPrefix(item.Enclosure.Type, "image/") {
			image = item.Enclosure.URL
		}
		if image == "" {
			image = firstImageInHTML(item.Content + item.Description)
		}

		out = append(out, FeedArticle{
			ID:          urlHash(link),
			Title:       title,
			URL:         link,
			Excerpt:     summary,
			Source:      sourceName,
			Category:    classify(title, summary),
			ImageURL:    image,
			PublishedAt: published,
		})
	}
	return out
}

func parseAtom(body []byte, sourceName string) []FeedArticle {
	var feed atomFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return nil
	}
	if len(feed.Entries) == 0 {
		return nil
	}

	out := make([]FeedArticle, 0, len(feed.Entries))
	for _, entry := range feed.Entries {
		// Prefer rel="alternate" links; fall back to first href.
		var link string
		for _, l := range entry.Links {
			if l.Rel == "alternate" || l.Rel == "" {
				link = l.Href
				break
			}
		}
		if link == "" && len(entry.Links) > 0 {
			link = entry.Links[0].Href
		}
		link = strings.TrimSpace(link)
		if link == "" {
			continue
		}

		title := htmlTextOnly(entry.Title)
		summary := excerpt(entry.Summary, entry.Content)
		/* Same relevance gate as RSS path — credit-card/points only. */
		if !isCardRelevant(title, summary) {
			continue
		}
		dateStr := entry.Published
		if dateStr == "" {
			dateStr = entry.Updated
		}
		published := parseFeedDate(dateStr)

		image := firstImageInHTML(entry.Content + entry.Summary)

		out = append(out, FeedArticle{
			ID:          urlHash(link),
			Title:       title,
			URL:         link,
			Excerpt:     summary,
			Source:      sourceName,
			Category:    classify(title, summary),
			ImageURL:    image,
			PublishedAt: published,
		})
	}
	return out
}

// ── Helpers ──────────────────────────────────────────────────────────────────

var (
	htmlTagRe = regexp.MustCompile(`<[^>]+>`)
	imgSrcRe  = regexp.MustCompile(`(?i)<img[^>]+src=["']([^"']+)["']`)
	wsRe      = regexp.MustCompile(`\s+`)
)

func htmlTextOnly(s string) string {
	s = htmlTagRe.ReplaceAllString(s, " ")
	s = wsRe.ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

func excerpt(primary, secondary string) string {
	source := primary
	if strings.TrimSpace(source) == "" {
		source = secondary
	}
	plain := htmlTextOnly(source)
	if len(plain) > 280 {
		// Cut on word boundary if possible.
		cut := plain[:280]
		if idx := strings.LastIndex(cut, " "); idx > 200 {
			cut = cut[:idx]
		}
		plain = cut + "…"
	}
	return plain
}

func firstImageInHTML(html string) string {
	m := imgSrcRe.FindStringSubmatch(html)
	if len(m) < 2 {
		return ""
	}
	return m[1]
}

func firstNonEmpty(strs ...string) string {
	for _, s := range strs {
		if strings.TrimSpace(s) != "" {
			return s
		}
	}
	return ""
}

// parseFeedDate tries the formats commonly seen across RSS + Atom.
func parseFeedDate(s string) time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}
	}
	layouts := []string{
		time.RFC1123Z, time.RFC1123, time.RFC3339, time.RFC822Z, time.RFC822,
		"Mon, 2 Jan 2006 15:04:05 -0700",
		"Mon, 2 Jan 2006 15:04:05 MST",
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05-07:00",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t
		}
	}
	return time.Time{}
}

func urlHash(u string) string {
	h := sha256.Sum256([]byte(u))
	return hex.EncodeToString(h[:])[:16]
}
