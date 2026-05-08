package service

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"maplerewards/internal/knowledge"
	"maplerewards/internal/model"
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
}

// NewAwardSearchService creates the award search service.
func NewAwardSearchService(
	apifySvc *ApifyAwardService,
	seatsAeroSvc *SeatsAeroService,
	flightSvc *SerpAPIService,
	walletRepo WalletRepository,
	kb *knowledge.KnowledgeBase,
) *AwardSearchService {
	return &AwardSearchService{
		apifySvc:     apifySvc,
		seatsAeroSvc: seatsAeroSvc,
		flightSvc:    flightSvc,
		walletRepo:   walletRepo,
		kb:           kb,
	}
}

// seatsAeroSources are the loyalty program IDs supported by Seats.aero.
// These are passed to the Seats.aero `sources` parameter.
//
// Trimmed to the 6 programs that matter for ~95% of Canadian award queries.
// Apify actor runtime scales linearly with issuer count — 14 issuers took
// 110+ seconds and timed out the chat dispatcher. Six finishes in 25-40s,
// covering: Aeroplan (Canadian flag program), Avios (RBC Avion 1:1 partner),
// Flying Blue (Amex MR 1:1), United (Aeroplan Star partner), Virgin Atlantic
// (Amex MR sweet spot), Lufthansa (Star Alliance backup).
//
// Programs dropped: Delta/American/Alaska/Singapore/Emirates/Turkish/Qatar/
// Etihad/EuroBonus — viable for niche routes but marginal for Canadian Toronto-
// out flights. The LLM still sees them in CANONICAL PROGRAM SLUGS and can
// answer with YAML data; they just don't get live-scraped.
var seatsAeroSources = []string{
	"aeroplan",
	"flyingblue",
	"avios",
	"united",
	"virginatlantic",
	"lufthansa",
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
// response time is ~3-5 seconds.
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
		apifyItems   []AwardItem
		awardItems   []AwardItem
		flightPrices []FlightResult
		apifyErr     error
		awardErr     error
		wg           sync.WaitGroup
	)

	wg.Add(3)

	// Goroutine 1: Apify flight-award-scraper — REAL live award availability
	go func() {
		defer wg.Done()
		if s.apifySvc == nil || !s.apifySvc.IsAvailable() {
			slog.Info("[award-search] apify not available (no APIFY_TOKEN)")
			return
		}
		apifyItems, apifyErr = s.apifySvc.SearchAwards(
			ctx,
			strings.ToUpper(req.Origin),
			strings.ToUpper(req.Destination),
			startDate, endDate,
			req.Cabin,
			seatsAeroSources, // reuse same issuer list
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

	wg.Wait()
	slog.Info("[award-search] all APIs done", "elapsed", time.Since(start))

	// ── Merge Apify results into awardItems (Apify takes priority) ───────
	if apifyErr == nil && len(apifyItems) > 0 {
		// Apify results are LIVE — they override Seats.aero for same issuer+date
		apifySeen := map[string]bool{}
		for _, item := range apifyItems {
			apifySeen[item.Issuer+"|"+item.Date] = true
		}
		// Keep Seats.aero results that Apify didn't cover
		var mergedSeats []AwardItem
		for _, item := range awardItems {
			if !apifySeen[item.Issuer+"|"+item.Date] {
				mergedSeats = append(mergedSeats, item)
			}
		}
		awardItems = append(apifyItems, mergedSeats...)
		awardErr = nil // We have live data
		slog.Info("[award-search] merged apify+seats.aero", "total", len(awardItems))
	}

	// ── Determine cash price (CAD) ────────────────────────────────────────
	cashPriceCAD := s.pickCashPrice(flightPrices, req.Origin, req.Destination, req.Cabin, req.Passengers)
	cashSource := "zone_fallback"
	if len(flightPrices) > 0 {
		cashSource = "google_flights"
	}
	slog.Info("[award-search] cash price determined",
		"cashPriceCAD", cashPriceCAD, "source", cashSource)

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
			results = append(results, *r)
			fallbackCount++
		}
	}
	slog.Info("[award-search] YAML fallback results added", "count", fallbackCount)

	// ── Sort by CPP descending ────────────────────────────────────────────
	sort.Slice(results, func(i, j int) bool {
		return results[i].CPP > results[j].CPP
	})

	slog.Info("[award-search] done",
		"totalResults", len(results), "totalElapsed", time.Since(start))

	return results, nil
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
	valueRating := rateValue(cpp)

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
		PointsCost:      totalPoints,
		TaxesCash:       item.TaxesCash,
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
	valueRating := rateValue(cpp)

	wb, _ := walletBalances[prog]
	canAfford := wb.balance >= int64(totalPts)

	return &model.AwardSearchResult{
		Date:            date,
		Program:         prog,
		ProgramName:     resolveIssuerName(prog),
		PointsCost:      totalPts,
		TaxesCash:       0,
		CashPriceCAD:    cashPriceCAD,
		CPP:             cpp,
		ValueRating:     valueRating,
		SeatsAvailable:  0,
		Source:          "estimated",
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
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil {
		return nil, err
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

func rateValue(cpp float64) string {
	if cpp >= 7.0 {
		return "excellent"
	}
	if cpp >= 4.0 {
		return "good"
	}
	return "poor"
}

// ── Booking URL builder ───────────────────────────────────────────────────────

// awardBookingURL generates the booking URL for each issuer.
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
		// No deep link — send to the Air France award search page
		return "https://wwws.airfrance.us/search/advanced"

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
		return fmt.Sprintf(
			"https://www.miles-and-more.com/us/en/earn-miles/flights/flights.html?from=%s&to=%s",
			origin, dest)

	case "singapore":
		return "https://www.singaporeair.com/en_UK/ppsclub-krisflyer/use-miles/redeem-flights/"

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

	case "virginatlantic":
		return "https://www.virginatlantic.com/flight-search#book-with-miles"

	case "emirates":
		return fmt.Sprintf("https://www.emirates.com/us/english/book/?from=%s&to=%s", origin, dest)

	case "turkish":
		return "https://www.turkishairlines.com/en-us/flights/award-ticket/"

	case "qatar":
		return "https://www.qatarairways.com/en/Privilege-Club/use-qmiles/book-awards.html"

	case "etihad":
		return "https://www.etihad.com/en-us/manage/book-with-miles"
	}

	// Generic fallback — Google Flights
	return fmt.Sprintf(
		"https://www.google.com/travel/flights?q=flights+from+%s+to+%s+on+%s",
		origin, dest, date)
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
