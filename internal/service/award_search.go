package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"maplerewards/internal/knowledge"
	"maplerewards/internal/model"
)

// AwardCache is the minimal cache contract award search needs. Satisfied by
// *cache.Cache; declared here so the service stays decoupled from Redis and
// tests can plug in an in-memory double.
type AwardCache interface {
	GetAwardSearch(ctx context.Context, key string) ([]byte, bool, error)
	SetAwardSearch(ctx context.Context, key string, payload []byte, ttl time.Duration) error
}

// awardCacheTTL is the freshness window for award-search responses. Raised
// to 6h: award availability does not move minute-to-minute, and the cache
// is the primary shield against re-burning the paid Apify/Seats.aero quota
// on popular routes. 6h trades a small staleness risk for a large cut in
// upstream scrape volume — the dominant cost lever.
const awardCacheTTL = 6 * time.Hour

// Source labels exposed to the frontend so the user sees provenance. Keep
// these strings stable — the SPA pattern-matches on them.
const (
	sourceLabelGoogleFlights = "Google Flights"
	sourceLabelSeatsAero     = "Seats.aero"
	sourceLabelApify         = "Apify"
	sourceLabelEstimate      = "estimate"
)

// AwardSearchService combines YAML knowledge base (award chart costs per program)
// and SerpAPI Google Flights (real cabin-specific cash prices in CAD) to produce
// AwardSearchResult[] for POST /api/v1/trip/award-search.
// Optionally uses Seats.aero for live award availability if configured.
type AwardSearchService struct {
	apifySvc     *ApifyAwardService
	seatsAeroSvc *SeatsAeroService
	flightSvc    *SerpAPIService
	walletRepo   WalletRepository
	kb           *knowledge.KnowledgeBase
	cache        AwardCache
}

// NewAwardSearchService creates the award search service. cache may be nil
// (tests / cmd/worker) — when nil, every call hits live data sources.
func NewAwardSearchService(
	apifySvc *ApifyAwardService,
	seatsAeroSvc *SeatsAeroService,
	flightSvc *SerpAPIService,
	walletRepo WalletRepository,
	kb *knowledge.KnowledgeBase,
	cache AwardCache,
) *AwardSearchService {
	return &AwardSearchService{
		apifySvc:     apifySvc,
		seatsAeroSvc: seatsAeroSvc,
		flightSvc:    flightSvc,
		walletRepo:   walletRepo,
		kb:           kb,
		cache:        cache,
	}
}

// seatsAeroSources are the VALID Seats.aero `sources` IDs we query. Seats.aero
// is a fast JSON API (~2s) — one call covers every source listed here at no
// extra latency — so unlike the Apify scraper there is no reason to trim it.
//
// The previous 6-entry list was an Apify-era hand-me-down and was actively
// wrong for Seats.aero: "avios" and "lufthansa" are NOT Seats.aero source IDs
// (Seats.aero indexes BA award space under partner programs, not "avios"; M&M
// isn't indexed at all), so those two silently returned nothing — which is
// why a Mumbai→Toronto business search only ever surfaced Aeroplan + United
// even though Etihad had real space (founder-reported, confirmed via the live
// partner API). This is the full set of premium-cabin programs a Canadian
// points-holder can realistically transfer into or book through, so the user
// sees the whole landscape (Star Alliance, SkyTeam, oneworld, EK/EY/SQ).
var seatsAeroSources = []string{
	"aeroplan", "united", "flyingblue", "virginatlantic", "eurobonus",
	"etihad", "emirates", "qatar", "singapore", "lifemiles",
	"alaska", "american", "delta", "turkish", "qantas",
}

// apifyAwardSources is the SMALL list passed to the Apify scraper. Apify
// runtime scales linearly with issuer count (14 issuers → 110s+ timeout), so
// it stays trimmed to the highest-yield Canadian programs. Apify is a Pro-only
// supplementary source; Seats.aero (above) is the primary breadth source.
var apifyAwardSources = []string{
	"aeroplan", "united", "flyingblue", "virginatlantic",
}

// issuerProgramName maps Seats.aero source slugs to user-friendly names.
var issuerProgramName = map[string]string{
	"aeroplan":       "Aeroplan (Air Canada)",
	"flyingblue":     "Flying Blue (Air France/KLM)",
	"eurobonus":      "SAS EuroBonus",
	"united":         "United MileagePlus",
	"delta":          "Delta SkyMiles",
	"american":       "American AAdvantage",
	"alaska":         "Alaska Mileage Plan",
	"avios":          "British Airways Avios",
	"virginatlantic": "Virgin Atlantic Flying Club",
	"lufthansa":      "Lufthansa Miles & More",
	"singapore":      "Singapore KrisFlyer",
	"emirates":       "Emirates Skywards",
	"turkish":        "Turkish Miles&Smiles",
	"qatar":          "Qatar Privilege Club",
	"etihad":         "Etihad Guest",
	"lifemiles":      "Avianca LifeMiles",
	"qantas":         "Qantas Frequent Flyer",
	// Legacy slug alias
	"flying-blue": "Flying Blue (Air France/KLM)",
}

// yamlFallbackPrograms are programs that need YAML-only lookup when they
// are NOT returned by Seats.aero (e.g., programs in our knowledge base
// but not in the seatsAeroSources list). Currently empty since Seats.aero
// covers all our key programs including Avios.
var yamlFallbackPrograms = []string{}

// Search runs both APIs (Seats.aero + Amadeus) in parallel and returns sorted
// AwardSearchResult. Both APIs are synchronous (~2-5s each), so the total
// response time is ~3-5 seconds. Successful searches are written to Redis
// with a 6-hour TTL so repeated probes of a popular route (Aeroplan
// alerters, ICP debugging) hit warm cache.
func (s *AwardSearchService) Search(ctx context.Context, req model.AwardSearchRequest) ([]model.AwardSearchResult, error) {
	start := time.Now()

	if req.Passengers <= 0 {
		req.Passengers = 1
	}
	if req.Cabin == "" {
		req.Cabin = "economy"
	}

	slog.Info("[award-search] starting",
		"origin", req.Origin, "dest", req.Destination,
		"date", req.Date, "cabin", req.Cabin,
	)

	// ── Cache lookup ──────────────────────────────────────────────────────
	// Key intentionally omits session/wallet — wallet-relative fields
	// (PointsAvailable, CanAfford, CardBreakdowns) are recomputed below from
	// the live wallet snapshot. Cache only the program/points/CPP body.
	//
	// Refresh=true skips the GET so the user can force a fresh upstream pull
	// (used by the "Refresh live" button on the SPA). The SET path still
	// runs, so the next normal request will hit the warm copy.
	cacheKey := awardCacheKey(req)
	if s.cache != nil && !req.Refresh {
		if data, hit, err := s.cache.GetAwardSearch(ctx, cacheKey); err != nil {
			slog.Warn("[award-search] cache get failed", "err", err)
		} else if hit {
			var cached []model.AwardSearchResult
			if err := json.Unmarshal(data, &cached); err == nil && len(cached) > 0 {
				// FetchedAt on the first row is the canonical timestamp for
				// the whole bundle — all rows are written together.
				age := time.Since(cached[0].FetchedAt)
				if age < awardCacheTTL {
					slog.Info("[award-search] cache hit",
						"key", cacheKey, "ageSec", int(age.Seconds()),
						"count", len(cached))
					// Re-overlay live wallet state — balances change between
					// hits even if the route data is still fresh.
					return s.overlayWallet(ctx, req, cached), nil
				}
				slog.Info("[award-search] cache hit but stale", "ageSec", int(age.Seconds()))
			}
		}
	}

	// ── Load wallet ───────────────────────────────────────────────────────
	walletBalances, err := s.loadWalletBalances(ctx, req.SessionID)
	if err != nil {
		slog.Warn("[award-search] wallet load failed (proceeding with zero balances)", "err", err)
		walletBalances = map[string]walletEntry{}
	}

	// ── Compute date range ────────────────────────────────────────────────
	startDate, endDate := computeDateRange(req.Date, req.FlexDays)

	// ── Run data sources in parallel ─────────────────────────────────────
	var (
		apifyItems          []AwardItem
		awardItems          []AwardItem
		flightPrices        []FlightResult
		economyFlightPrices []FlightResult // populated only when cabin != "economy"
		apifyErr            error
		awardErr            error
		wg                  sync.WaitGroup
	)

	cabinIsPremium := strings.ToLower(req.Cabin) != "economy" && strings.ToLower(req.Cabin) != ""
	if cabinIsPremium {
		wg.Add(4)
	} else {
		wg.Add(3)
	}

	// Goroutines below all wrap with a panic recovery — without it any nil-deref
	// or schema-drift unmarshal in an external API path would kill the whole API
	// process (unrecovered goroutine panics terminate Go programs).
	recoverGoroutine := func(name string, errOut *error) {
		if rec := recover(); rec != nil {
			slog.Error("[award-search] goroutine panic recovered",
				"goroutine", name, "panic", rec,
			)
			if errOut != nil {
				*errOut = fmt.Errorf("%s panicked: %v", name, rec)
			}
		}
	}

	// Goroutine 1: Apify flight-award-scraper — REAL live award availability
	go func() {
		defer wg.Done()
		defer recoverGoroutine("apify", &apifyErr)
		if s.apifySvc == nil || !s.apifySvc.IsAvailable() {
			slog.Info("[award-search] apify not available (no APIFY_TOKEN)")
			return
		}
		// Pro-gate: the live Apify scrape is the expensive, premium data
		// path. Free users still get Seats.aero + SerpAPI (goroutines 2 &
		// 3). Single biggest Apify cost lever for a free-heavy user base.
		if !req.IsPro {
			slog.Info("[award-search] apify skipped for non-Pro user")
			return
		}
		apifyItems, apifyErr = s.apifySvc.SearchAwards(
			ctx,
			strings.ToUpper(req.Origin),
			strings.ToUpper(req.Destination),
			startDate, endDate,
			req.Cabin,
			apifyAwardSources, // small list — Apify scraper scales w/ issuer count
		)
		if apifyErr != nil {
			slog.Warn("[award-search] apify failed", "err", apifyErr)
		} else {
			slog.Info("[award-search] apify returned", "items", len(apifyItems))
		}
	}()

	// Goroutine 2: Seats.aero — award availability (mileage costs per program)
	go func() {
		defer wg.Done()
		defer recoverGoroutine("seats.aero", &awardErr)
		if !s.seatsAeroSvc.IsAvailable() {
			awardErr = fmt.Errorf("seats.aero not configured")
			slog.Info("[award-search] seats.aero not available (no SEATSAERO_API_KEY)")
			return
		}
		awardItems, awardErr = s.seatsAeroSvc.SearchAwards(
			ctx,
			strings.ToUpper(req.Origin),
			strings.ToUpper(req.Destination),
			startDate, endDate,
			req.Cabin,
			seatsAeroSources,
		)
		if awardErr != nil {
			slog.Error("[award-search] seats.aero failed", "err", awardErr)
		} else {
			slog.Info("[award-search] seats.aero returned", "items", len(awardItems))
		}
	}()

	// Goroutine 3: SerpAPI Google Flights — real cash price for this cabin in CAD
	go func() {
		defer wg.Done()
		defer recoverGoroutine("serpapi", nil)
		if s.flightSvc == nil || !s.flightSvc.IsAvailable() {
			slog.Warn("[award-search] serpapi not available (no SERPAPI_KEY)")
			return
		}
		var err error
		flightPrices, err = s.flightSvc.SearchFlights(
			ctx,
			req.Origin, req.Destination, req.Date, req.Cabin, req.Passengers,
		)
		if err != nil {
			slog.Error("[award-search] serpapi failed", "err", err)
			flightPrices = nil
		} else {
			slog.Info("[award-search] serpapi returned", "prices", len(flightPrices))
		}
	}()

	// Goroutine 4 (premium cabins only): a second SerpAPI call for economy
	// cash on the same route. Surfaces the "would I actually pay this in cash?"
	// baseline — a 9.96¢ biz redemption looks magical until you realize you'd
	// have bought economy for $1200, not business for $8000. Costs one extra
	// SerpAPI quota call per biz/first search; small price for honesty.
	if cabinIsPremium {
		go func() {
			defer wg.Done()
			defer recoverGoroutine("serpapi-economy", nil)
			if s.flightSvc == nil || !s.flightSvc.IsAvailable() {
				return
			}
			prices, err := s.flightSvc.SearchFlights(
				ctx,
				req.Origin, req.Destination, req.Date, "economy", req.Passengers,
			)
			if err != nil {
				slog.Warn("[award-search] economy cash lookup failed", "err", err)
				return
			}
			economyFlightPrices = prices
			slog.Info("[award-search] economy cash baseline fetched", "prices", len(prices))
		}()
	}

	wg.Wait()
	slog.Info("[award-search] all APIs done", "elapsed", time.Since(start))

	// ── Merge Apify results into awardItems (Apify takes priority) ───────
	// Source-label tracking: we tag every retained item with the upstream
	// that produced it so the UI can render an honest provenance line.
	itemSource := map[string]string{} // key=issuer|date → label
	if apifyErr == nil && len(apifyItems) > 0 {
		// Apify results are LIVE — they override Seats.aero for same issuer+date.
		// When the two collide, prefer Apify's TaxesCash (Seats.aero never
		// supplies taxes), but only if Apify actually returned a number.
		apifyByKey := map[string]AwardItem{}
		for _, item := range apifyItems {
			apifyByKey[item.Issuer+"|"+item.Date] = item
			itemSource[item.Issuer+"|"+item.Date] = sourceLabelApify
		}

		var mergedSeats []AwardItem
		for _, item := range awardItems {
			key := item.Issuer + "|" + item.Date
			if apifyItem, collision := apifyByKey[key]; collision {
				// Collision — Apify wins, but if Apify lacks taxes and
				// Seats.aero somehow has them, keep them. (Almost never
				// happens today but cheap insurance.)
				if apifyItem.TaxesCash == nil && item.TaxesCash != nil {
					apifyItem.TaxesCash = item.TaxesCash
					apifyItem.TaxesIncluded = true
					apifyByKey[key] = apifyItem
				}
				continue
			}
			mergedSeats = append(mergedSeats, item)
			itemSource[key] = sourceLabelSeatsAero
		}

		// Reassemble in Apify-first order.
		var merged []AwardItem
		for _, item := range apifyItems {
			merged = append(merged, apifyByKey[item.Issuer+"|"+item.Date])
		}
		merged = append(merged, mergedSeats...)
		awardItems = merged
		awardErr = nil // We have live data
		slog.Info("[award-search] merged apify+seats.aero", "total", len(awardItems))
	} else {
		for _, item := range awardItems {
			itemSource[item.Issuer+"|"+item.Date] = sourceLabelSeatsAero
		}
	}

	// ── Determine cash price (CAD) ────────────────────────────────────────
	cashPriceCAD := s.pickCashPrice(flightPrices, req.Origin, req.Destination, req.Cabin, req.Passengers)
	cashFromGoogle := len(flightPrices) > 0
	cashSource := "zone_fallback"
	if cashFromGoogle {
		cashSource = "google_flights"
	}
	// Economy cash baseline for premium-cabin searches. Falls through to 0 if
	// the parallel economy probe came up empty — in that case the frontend
	// hides the secondary CPP and only shows the cabin-matched one.
	var economyCashCAD float64
	if cabinIsPremium && len(economyFlightPrices) > 0 {
		economyCashCAD = s.pickCashPrice(economyFlightPrices, req.Origin, req.Destination, "economy", req.Passengers)
	}
	slog.Info("[award-search] cash price determined",
		"cashPriceCAD", cashPriceCAD, "source", cashSource,
		"economyCashCAD", economyCashCAD)

	fetchedAt := time.Now().UTC()

	// ── Build results from live Seats.aero data ──────────────────────────
	var results []model.AwardSearchResult

	if awardErr == nil && len(awardItems) > 0 {
		seen := map[string]bool{} // deduplicate by (issuer, date)
		for _, item := range awardItems {
			if item.MileageCost <= 0 {
				continue
			}
			key := item.Issuer + "|" + item.Date
			if seen[key] {
				continue
			}
			seen[key] = true

			r := s.buildResult(item, cashPriceCAD, req, walletBalances)
			r.FetchedAt = fetchedAt
			r.SourceLabel = itemSource[key]
			if r.SourceLabel == "" {
				r.SourceLabel = sourceLabelSeatsAero
			}
			r.CashIsEstimate = !cashFromGoogle
			// The award space is genuinely live. But a value rating is only
			// trustworthy when the CASH side is a real fare too. With a
			// zone-fallback cash guess we keep the real points + a clearly
			// labelled route benchmark, but suppress CPP/rating entirely —
			// no rating computed off a fabricated number (user-confirmed).
			r.Rated = cashFromGoogle
			if !r.Rated {
				r.CPP = 0
				r.RealisticCPP = 0
				r.ValueRating = ""
			} else if economyCashCAD > 0 && r.PointsCost > 0 {
				r.EconomyCashCAD = economyCashCAD
				r.RealisticCPP = computeCPP(economyCashCAD, r.PointsCost)
			}
			results = append(results, r)
		}
		slog.Info("[award-search] live results built", "count", len(results))
	}

	// ── YAML fallback for unsupported programs & zero-result programs ─────
	issuersSeen := map[string]bool{}
	for _, r := range results {
		issuersSeen[r.Program] = true
	}

	// Programs to fall back on: yamlFallbackPrograms always; all sources if no live results
	fallbackPrograms := append([]string{}, yamlFallbackPrograms...)
	if awardErr != nil || len(awardItems) == 0 {
		fallbackPrograms = append(fallbackPrograms, seatsAeroSources...)
	}

	fallbackCount := 0
	for _, prog := range fallbackPrograms {
		if issuersSeen[prog] {
			continue
		}
		r := s.buildYAMLResult(prog, req, cashPriceCAD, walletBalances, startDate)
		if r != nil {
			r.FetchedAt = fetchedAt
			r.SourceLabel = sourceLabelEstimate
			r.CashIsEstimate = !cashFromGoogle
			// Points here are an award-chart estimate, not live award
			// space — so this row is never "rated" regardless of cash.
			r.Rated = false
			r.CPP = 0
			r.RealisticCPP = 0
			r.ValueRating = ""
			results = append(results, *r)
			fallbackCount++
		}
	}
	slog.Info("[award-search] YAML fallback results added", "count", fallbackCount)

	// ── Sort: rated rows first (best ¢/pt), then unrated by cheapest award ─
	sort.Slice(results, func(i, j int) bool {
		ri, rj := results[i], results[j]
		if ri.Rated != rj.Rated {
			return ri.Rated // trustworthy-rated rows on top
		}
		if ri.Rated {
			return ri.CPP > rj.CPP
		}
		return ri.PointsCost < rj.PointsCost // unrated: fewest points = best award
	})

	// ── Cache write ───────────────────────────────────────────────────────
	// Cache only non-empty result sets (a transient upstream blip returning 0
	// rows must not be cached as "no availability" for the whole TTL window).
	if s.cache != nil && len(results) > 0 {
		if payload, err := json.Marshal(results); err == nil {
			if err := s.cache.SetAwardSearch(ctx, cacheKey, payload, awardCacheTTL); err != nil {
				slog.Warn("[award-search] cache set failed", "err", err)
			}
		}
	}

	slog.Info("[award-search] done",
		"totalResults", len(results), "totalElapsed", time.Since(start),
		"cashFromGoogle", cashFromGoogle)

	return results, nil
}

// awardCacheKey constructs the Redis suffix from the route inputs. Programs
// are NOT part of the key because the service always consults the same
// hard-coded seatsAeroSources list — if that ever becomes per-request,
// hash the sorted slice into the key.
func awardCacheKey(req model.AwardSearchRequest) string {
	// Tier MUST be part of the key. Pro searches include the live Apify scrape
	// (gated on req.IsPro in Search); free searches do not. Without this, the
	// two tiers would share one entry within the 6h TTL — leaking paid Apify
	// availability to free users, or serving Pro users the degraded free body.
	tier := "free"
	if req.IsPro {
		tier = "pro"
	}
	return fmt.Sprintf("%s:%s:%s:%s:%d:%d:%s",
		strings.ToUpper(req.Origin),
		strings.ToUpper(req.Destination),
		req.Date,
		strings.ToLower(req.Cabin),
		req.Passengers,
		req.FlexDays,
		tier,
	)
}

// overlayWallet refreshes the wallet-relative fields on a cached bundle.
// The cache stores route data; balances are live so users see correct
// CanAfford / CardBreakdowns even on a warm hit.
func (s *AwardSearchService) overlayWallet(
	ctx context.Context,
	req model.AwardSearchRequest,
	cached []model.AwardSearchResult,
) []model.AwardSearchResult {
	balances, err := s.loadWalletBalances(ctx, req.SessionID)
	if err != nil {
		// Wallet load failure on the warm path shouldn't poison the
		// response — just zero the wallet fields and ship the route data.
		balances = map[string]walletEntry{}
	}
	for i := range cached {
		wb, _ := balances[cached[i].Program]
		cached[i].PointsAvailable = wb.balance
		cached[i].CanAfford = wb.balance >= int64(cached[i].PointsCost)
		cached[i].CardBreakdowns = wb.breakdowns
	}
	return cached
}

// ── buildResult constructs an AwardSearchResult from a live AwardItem. ───────

func (s *AwardSearchService) buildResult(
	item AwardItem,
	cashPriceCAD float64,
	req model.AwardSearchRequest,
	walletBalances map[string]walletEntry,
) model.AwardSearchResult {
	totalPoints := item.MileageCost * req.Passengers

	cpp := computeCPP(cashPriceCAD, totalPoints)
	valueRating := rateValue(cpp, req.Cabin)

	wb, _ := walletBalances[item.Issuer]
	canAfford := wb.balance >= int64(totalPoints)

	// Convert AwardSegment → model.AwardSegmentInfo
	segments := make([]model.AwardSegmentInfo, len(item.Segments))
	for i, seg := range item.Segments {
		segments[i] = model.AwardSegmentInfo{
			Origin:        seg.Origin,
			Destination:   seg.Destination,
			Airline:       seg.Airline,
			FlightNumber:  seg.FlightNumber,
			DepartureTime: seg.DepartureTime,
			ArrivalTime:   seg.ArrivalTime,
			Aircraft:      seg.Aircraft,
		}
	}

	return model.AwardSearchResult{
		Date:            item.Date,
		Program:         item.Issuer,
		ProgramName:     resolveIssuerName(item.Issuer),
		Cabin:           req.Cabin,
		PointsCost:      totalPoints,
		TaxesCash:       item.TaxesCash,
		TaxesIncluded:   item.TaxesIncluded,
		CashPriceCAD:    cashPriceCAD,
		CPP:             cpp,
		ValueRating:     valueRating,
		SeatsAvailable:  item.SeatsAvailable,
		Source:          "live",
		BookingURL:      awardBookingURL(item.Issuer, req.Origin, req.Destination, item.Date, req.Cabin, req.Passengers),
		PointsAvailable: wb.balance,
		CanAfford:       canAfford,
		CardBreakdowns:  wb.breakdowns,
		Segments:        segments,
	}
}

// ── buildYAMLResult constructs an estimated AwardSearchResult from the KB. ───

func (s *AwardSearchService) buildYAMLResult(
	prog string,
	req model.AwardSearchRequest,
	cashPriceCAD float64,
	walletBalances map[string]walletEntry,
	date string,
) *model.AwardSearchResult {
	if s.kb == nil {
		return nil
	}

	key := yamlKey(prog)
	kbProg, ok := s.kb.Programs[key]
	if !ok {
		return nil
	}

	// Look up points from award chart
	zone := classifyRoute(req.Origin, req.Destination)
	cabin := strings.ToLower(req.Cabin)
	pts := lookupAwardChartPoints(kbProg, zone, cabin)
	if pts <= 0 {
		return nil
	}

	totalPts := int(pts) * req.Passengers
	cpp := computeCPP(cashPriceCAD, totalPts)
	valueRating := rateValue(cpp, req.Cabin)

	wb, _ := walletBalances[prog]
	canAfford := wb.balance >= int64(totalPts)

	// YAML fallback: we have no upstream tax figure. Leave TaxesCash nil and
	// TaxesIncluded=false so the UI clearly marks this as an estimate-only
	// row. Source="estimated" likewise prevents downstream code (e.g. the
	// future award_search_log → medians job) from treating zone-fallback
	// CPPs as observed live data.
	return &model.AwardSearchResult{
		Date:            date,
		Program:         prog,
		ProgramName:     resolveIssuerName(prog),
		Cabin:           req.Cabin,
		PointsCost:      totalPts,
		TaxesCash:       nil,
		TaxesIncluded:   false,
		CashPriceCAD:    cashPriceCAD,
		CPP:             cpp,
		ValueRating:     valueRating,
		SeatsAvailable:  0,
		Source:          "estimated",
		SourceLabel:     sourceLabelEstimate,
		FetchedAt:       time.Now().UTC(),
		BookingURL:      awardBookingURL(prog, req.Origin, req.Destination, date, req.Cabin, req.Passengers),
		PointsAvailable: wb.balance,
		CanAfford:       canAfford,
		CardBreakdowns:  wb.breakdowns,
		Segments:        nil,
	}
}

// ── Wallet helpers ────────────────────────────────────────────────────────────

type walletEntry struct {
	balance    int64
	breakdowns []model.CardContribution
}

func (s *AwardSearchService) loadWalletBalances(ctx context.Context, sessionID string) (map[string]walletEntry, error) {
	// Worker probes pass the watch's owner-session, which may be empty (or
	// stale) — return an empty wallet so the caller can proceed with no
	// personalization rather than crashing the sweep.
	if sessionID == "" {
		return map[string]walletEntry{}, nil
	}
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return map[string]walletEntry{}, nil
	}
	userCards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, err
	}

	// Map program slug → aggregated balance + card breakdowns
	entries := map[string]walletEntry{}
	for _, uc := range userCards {
		if uc.Card == nil || uc.Card.LoyaltyProgram == nil {
			continue
		}
		prog := uc.Card.LoyaltyProgram
		slug := prog.Slug
		// Normalize DB slug to issuer key (e.g. "flying-blue" → "flyingblue")
		issuerKey := slugToIssuer(slug)

		contrib := model.CardContribution{
			CardName:            uc.Card.Name,
			CardID:              uc.CardID,
			ProgramName:         prog.Name,
			PointsHeld:          uc.PointBalance,
			TransferRatio:       1.0,
			PointsAfterTransfer: uc.PointBalance,
		}

		e := entries[issuerKey]
		e.balance += uc.PointBalance
		e.breakdowns = append(e.breakdowns, contrib)
		entries[issuerKey] = e
	}
	return entries, nil
}

// slugToIssuer maps DB program slugs to award scraper issuer keys.
func slugToIssuer(slug string) string {
	m := map[string]string{
		"aeroplan":     "aeroplan",
		"avios":        "avios",
		"flying-blue":  "flyingblue",
		"united":       "united",
		"delta":        "delta",
		"american":     "american",
		"alaska":       "alaska",
		"eurobonus":    "eurobonus",
		"lufthansa":    "lufthansa",
		"singapore":    "singapore",
	}
	if v, ok := m[slug]; ok {
		return v
	}
	return slug
}

// ── Cash price helpers ────────────────────────────────────────────────────────

// pickCashPrice returns the cash price to use. If SerpAPI Google Flights
// returned results, take the median price (real cabin price in CAD).
// Otherwise fall back to zone-based estimates.
func (s *AwardSearchService) pickCashPrice(
	results []FlightResult,
	origin, dest, cabin string,
	passengers int,
) float64 {
	if len(results) > 0 {
		// Collect all prices, take median
		var prices []float64
		for _, r := range results {
			if r.Price > 0 {
				prices = append(prices, r.Price)
			}
		}
		if len(prices) > 0 {
			sort.Float64s(prices)
			return prices[len(prices)/2] * float64(passengers)
		}
	}

	// Zone-based fallback (used when scraper returns nothing)
	return zoneFallbackPrice(origin, dest, cabin) * float64(passengers)
}

// zoneFallbackPrice returns a realistic zone-based estimate in CAD.
func zoneFallbackPrice(origin, dest, cabin string) float64 {
	zone := classifyRoute(origin, dest)
	fallbacks := map[string]map[string]float64{
		"north_america":      {"economy": 600, "business": 2000, "first": 3500},
		"atlantic":           {"economy": 1400, "business": 5500, "first": 10000},
		"pacific":            {"economy": 1600, "business": 6500, "first": 14000},
		"middle_east_africa": {"economy": 1200, "business": 5000, "first": 11000},
	}
	if zm, ok := fallbacks[zone]; ok {
		if p, ok := zm[strings.ToLower(cabin)]; ok {
			return p
		}
	}
	return 1400 // default atlantic economy
}

// ── Date helpers ──────────────────────────────────────────────────────────────

func computeDateRange(centerDate string, flexDays int) (string, string) {
	t, err := time.Parse("2006-01-02", centerDate)
	if err != nil {
		return centerDate, centerDate
	}
	if flexDays < 0 {
		flexDays = 0
	}
	start := t.AddDate(0, 0, -flexDays).Format("2006-01-02")
	end := t.AddDate(0, 0, flexDays).Format("2006-01-02")
	return start, end
}

// ── CPP helpers ───────────────────────────────────────────────────────────────

func computeCPP(cashPriceCAD float64, totalPoints int) float64 {
	if totalPoints <= 0 {
		return 0
	}
	return (cashPriceCAD / float64(totalPoints)) * 100
}

// rateValue grades a CPP relative to realistic cabin baselines. Cash prices
// scale wildly by cabin — a $8000 TATL business fare divided by 80k points
// looks "excellent" at 10¢, but only if the user would actually pay $8000 in
// cash. Most people who fly business on points wouldn't, so the rating must
// reflect the cabin context, not the absolute number.
//
// Thresholds calibrated against industry consensus (TPG / Prince of Travel /
// Frequent Miler points valuations, 2026): the floor for "excellent" rises
// with the cash baseline so a partner biz redemption needs to clear a higher
// bar than a transcon economy hop to earn the badge. Floors raised in May
// 2026 to prevent last-minute-fare inflation (panic-priced biz cash makes
// every redemption look like 9-12¢) from auto-flagging as "excellent".
func rateValue(cpp float64, cabin string) string {
	c := strings.ToLower(strings.TrimSpace(cabin))
	switch c {
	case "first":
		switch {
		case cpp >= 12.0:
			return "excellent"
		case cpp >= 7.0:
			return "good"
		default:
			return "poor"
		}
	case "business":
		switch {
		case cpp >= 10.0:
			return "excellent"
		case cpp >= 5.0:
			return "good"
		default:
			return "poor"
		}
	case "premium_economy":
		switch {
		case cpp >= 3.0:
			return "excellent"
		case cpp >= 2.0:
			return "good"
		default:
			return "poor"
		}
	default: // economy or unknown
		switch {
		case cpp >= 2.5:
			return "excellent"
		case cpp >= 1.5:
			return "good"
		default:
			return "poor"
		}
	}
}

// ── Booking URL builder ───────────────────────────────────────────────────────

// googleFlightsDated returns a Google Flights URL scoped to the exact route
// AND date. Used for programs that have no usable dated award-search deep
// link — a routed, dated "all flights that day" view is genuinely actionable,
// unlike a bare airline homepage. Date is optional but normally present.
func googleFlightsDated(origin, dest, date string) string {
	if date != "" {
		return fmt.Sprintf(
			"https://www.google.com/travel/flights?q=flights%%20from%%20%s%%20to%%20%s%%20on%%20%s",
			origin, dest, date)
	}
	return fmt.Sprintf(
		"https://www.google.com/travel/flights?q=flights%%20from%%20%s%%20to%%20%s",
		origin, dest)
}

// awardBookingURL generates the booking URL for each issuer. Programs with a
// real dated award-search deep link use it; everything else falls through to
// googleFlightsDated so the link always lands on the searched route+date.
func awardBookingURL(issuer, origin, dest, date, cabin string, passengers int) string {
	origin = strings.ToUpper(origin)
	dest = strings.ToUpper(dest)

	switch issuer {
	case "aeroplan":
		url := fmt.Sprintf(
			"https://www.aircanada.com/aeroplan/redeem/availability/outbound"+
				"?org0=%s&dest0=%s&ADT=%d&YTH=0&CHD=0&INF=0&INS=0&tripType=O&marketCode=INT",
			origin, dest, passengers)
		if date != "" {
			url += "&departureDate0=" + date
		}
		return url

	case "flyingblue":
		// Air France/KLM award booking is a JS flow with no stable dated
		// deep link. A dated Google Flights view for the exact route is far
		// more actionable than their bare US advanced-search page.
		return googleFlightsDated(origin, dest, date)

	case "eurobonus":
		url := fmt.Sprintf(
			"https://www.flysas.com/en/us/book/flights/?origin=%s&destination=%s&adt=%d&award=true",
			origin, dest, passengers)
		if date != "" {
			url += "&outboundDate=" + date
		}
		return url

	case "united":
		url := fmt.Sprintf(
			"https://www.united.com/en/us/fsr/choose-flights?f=%s&t=%s&tt=1&sc=7&px=%d&taxng=1&newHP=True",
			origin, dest, passengers)
		if date != "" {
			url += "&d=" + date
		}
		return url

	case "delta":
		url := fmt.Sprintf(
			"https://www.delta.com/us/en/flight-search/results?"+
				"tripType=ONE_WAY&fromCity=%s&toCity=%s&paxCount=%d",
			origin, dest, passengers)
		if date != "" {
			url += "&departureDate=" + date
		}
		if cabin == "business" || cabin == "first" {
			url += "&cabinType=BUSINESS"
		}
		return url

	case "american":
		url := fmt.Sprintf(
			"https://www.aa.com/booking/flights?tripType=oneWay&origin=%s&destination=%s&numPax=%d",
			origin, dest, passengers)
		if date != "" {
			url += "&departDate=" + date
		}
		if cabin == "business" || cabin == "first" {
			url += "&cabin=B"
		}
		return url

	case "alaska":
		url := fmt.Sprintf(
			"https://www.alaskaair.com/search/results?A=%s&B=%s&D=%d",
			origin, dest, passengers)
		if date != "" {
			url += "&TripType=O&O=" + date
		}
		return url

	case "lufthansa":
		return googleFlightsDated(origin, dest, date)

	case "singapore":
		return googleFlightsDated(origin, dest, date)

	case "avios":
		// British Airways Avios
		cabinCode := "M"
		if cabin == "business" {
			cabinCode = "J"
		} else if cabin == "first" {
			cabinCode = "F"
		}
		url := fmt.Sprintf(
			"https://www.britishairways.com/travel/redeem/execclub/_gf/en_gb?eId=106019&from=%s&to=%s&cabin=%s",
			origin, dest, cabinCode)
		if date != "" {
			if t, err := time.Parse("2006-01-02", date); err == nil {
				url += "&depDate=" + t.Format("02/01/06")
			}
		}
		return url

	case "virginatlantic", "emirates", "turkish", "qatar", "etihad":
		return googleFlightsDated(origin, dest, date)
	}

	// Generic fallback — dated Google Flights for the exact route.
	return googleFlightsDated(origin, dest, date)
}

// ── Knowledge base helpers ────────────────────────────────────────────────────

func resolveIssuerName(issuer string) string {
	if name, ok := issuerProgramName[issuer]; ok {
		return name
	}
	return issuer
}

// lookupAwardChartPoints returns the points cost for a given program/zone/cabin.
func lookupAwardChartPoints(prog *knowledge.Program, zone, cabin string) int64 {
	if prog == nil || len(prog.AwardChart) == 0 {
		return 0
	}

	// Try exact zone
	cabinMap, ok := prog.AwardChart[zone]
	if !ok {
		// Try alternate zone names (e.g. Avios uses "north_america_transatlantic")
		alternates := map[string][]string{
			"atlantic":           {"north_america_transatlantic", "europe_short_haul"},
			"north_america":      {"north_america_short"},
			"pacific":            {"asia"},
			"middle_east_africa": {"middle_east"},
		}
		for _, alt := range alternates[zone] {
			if cm, found := prog.AwardChart[alt]; found {
				cabinMap = cm
				ok = true
				break
			}
		}
	}
	if !ok {
		// Last resort: use any available zone
		for _, cm := range prog.AwardChart {
			cabinMap = cm
			break
		}
	}

	if pts, found := cabinMap[cabin]; found && pts > 0 {
		return int64(pts)
	}
	return 0
}
