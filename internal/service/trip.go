package service

import (
	"context"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"log/slog"

	"maplerewards/internal/cache"
	"maplerewards/internal/knowledge"
	"maplerewards/internal/model"
)

// TripService evaluates redemption options for flights/hotels using the user's
// wallet, the rewards knowledge base, and live web search for cash pricing.
type TripService struct {
	walletRepo   WalletRepository
	cardRepo     CardRepository
	transferRepo TransferRepository
	tavilySvc    *TavilyService
	flightSvc    *SerpAPIService
	apifySvc     *ApifyAwardService // optional; nil disables live award probes
	cache        *cache.Cache       // optional; nil disables Apify probe caching
	kb           *knowledge.KnowledgeBase
}

func NewTripService(
	walletRepo WalletRepository,
	cardRepo CardRepository,
	transferRepo TransferRepository,
	tavilySvc *TavilyService,
	flightSvc *SerpAPIService,
	apifySvc *ApifyAwardService,
	cacheClient *cache.Cache,
	kb *knowledge.KnowledgeBase,
) *TripService {
	return &TripService{
		walletRepo:   walletRepo,
		cardRepo:     cardRepo,
		transferRepo: transferRepo,
		tavilySvc:    tavilySvc,
		flightSvc:    flightSvc,
		apifySvc:     apifySvc,
		cache:        cacheClient,
		kb:           kb,
	}
}

// ── Slug mapping ────────────────────────────────────────────────────────────
// DB uses hyphens ("marriott-bonvoy"), YAML uses underscores ("marriott_bonvoy").

var slugToYAML = map[string]string{
	"marriott-bonvoy": "marriott_bonvoy",
	"world-of-hyatt":  "world_of_hyatt",
	"hilton-honors":   "hilton_honors",
	"ihg-rewards":     "ihg_one_rewards",
	"amex-mr":         "amex_mr",
	"rbc-avion":       "rbc_avion",
	"td-rewards":      "td_rewards",
	"scene-plus":      "scene_plus",
	"air-miles":       "air_miles",
	"cibc-aventura":   "cibc_aventura",
	"bmo-rewards":     "bmo_rewards",
	"pc-optimum":      "pc_optimum",
	"flying-blue":     "flying_blue",
}

func yamlKey(dbSlug string) string {
	if k, ok := slugToYAML[dbSlug]; ok {
		return k
	}
	return dbSlug
}

// ── Verified fallback booking URLs ──────────────────────────────────────────
// Used when the program has no booking_url in rewards.yaml.

var fallbackBookingURLs = map[string]string{
	"amex-mr":       "https://global.americanexpress.com/travel",
	"rbc-avion":     "https://www.rbcrewards.com",
	"td-rewards":    "https://www.expediafortd.com",
	"cibc-aventura": "https://rewards.cibc.com/travel",
	"bmo-rewards":   "https://www.bmorewards.com",
	"scene-plus":    "https://www.scene.ca",
	"air-miles":     "https://www.airmiles.ca/earn-and-use/use-miles",
	"national-bank": "https://rewardscenter.bnc.ca",
	"pc-optimum":    "https://www.pcoptimum.ca",
}

// ── Airline ↔ Program mapping ────────────────────────────────────────────────

var airlineForProgram = map[string]string{
	"aeroplan":       "Air Canada",
	"avios":          "British Airways",
	"flying-blue":    "Air France",
	"united":         "United Airlines",
	"delta":          "Delta Air Lines",
	"american":       "American Airlines",
	"alaska":         "Alaska Airlines",
	"lufthansa":      "Lufthansa",
	"singapore":      "Singapore Airlines",
	"emirates":       "Emirates",
	"turkish":        "Turkish Airlines",
	"qatar":          "Qatar Airways",
	"etihad":         "Etihad Airways",
	"virginatlantic": "Virgin Atlantic",
	"eurobonus":      "SAS",
}

// programForAirline maps airline names (lowercase) to program slugs.
var programForAirline = map[string]string{
	"air canada":          "aeroplan",
	"british airways":     "avios",
	"air france":          "flying-blue",
	"klm":                 "flying-blue",
	"klm royal dutch":     "flying-blue",
	"united airlines":     "united",
	"united":              "united",
	"delta air lines":     "delta",
	"delta":               "delta",
	"american airlines":   "american",
	"american":            "american",
	"alaska airlines":     "alaska",
	"alaska":              "alaska",
	"lufthansa":           "lufthansa",
	"singapore airlines":  "singapore",
	"emirates":            "emirates",
	"turkish airlines":    "turkish",
	"qatar airways":       "qatar",
	"etihad airways":      "etihad",
	"etihad":              "etihad",
	"virgin atlantic":     "virginatlantic",
	"sas":                 "eurobonus",
	"scandinavian airlines": "eurobonus",
}

// matchAirlineToProgram finds the program slug for a given airline name.
func matchAirlineToProgram(airline string) string {
	key := strings.ToLower(strings.TrimSpace(airline))
	if slug, ok := programForAirline[key]; ok {
		return slug
	}
	// Try partial match
	for k, slug := range programForAirline {
		if strings.Contains(key, k) || strings.Contains(k, key) {
			return slug
		}
	}
	return ""
}

// ── Zone classification ─────────────────────────────────────────────────────

var northAmericaAirports = map[string]bool{
	"YYZ": true, "YVR": true, "YUL": true, "YOW": true, "YYC": true, "YEG": true,
	"YWG": true, "YHZ": true, "YQB": true, "YXE": true, "YQR": true, "YYJ": true,
	"JFK": true, "LAX": true, "SFO": true, "ORD": true, "MIA": true, "DFW": true,
	"SEA": true, "BOS": true, "ATL": true, "DEN": true, "HNL": true, "LAS": true,
	"MSP": true, "DTW": true, "PHL": true, "IAD": true, "EWR": true, "IAH": true,
	"MCO": true, "FLL": true, "CUN": true, "MEX": true, "SJU": true, "NAS": true,
}
var europeAirports = map[string]bool{
	"LHR": true, "CDG": true, "FRA": true, "AMS": true, "MAD": true, "FCO": true,
	"BCN": true, "MUC": true, "ZRH": true, "LIS": true, "VIE": true, "CPH": true,
	"OSL": true, "ARN": true, "HEL": true, "DUB": true, "EDI": true, "MAN": true,
	"BRU": true, "GVA": true, "ATH": true, "IST": true, "WAW": true, "PRG": true,
}
var asiaAirports = map[string]bool{
	"NRT": true, "HND": true, "HKG": true, "SIN": true, "BKK": true, "ICN": true,
	"PVG": true, "PEK": true, "TPE": true, "KUL": true, "DEL": true, "BOM": true,
	"MNL": true, "CGK": true, "KIX": true, "CTS": true, "SGN": true, "HAN": true,
}
var middleEastAfricaAirports = map[string]bool{
	"DXB": true, "DOH": true, "AUH": true, "JED": true, "RUH": true,
	"TLV": true, "AMM": true, "CAI": true, "ADD": true, "NBO": true,
	"JNB": true, "CPT": true, "CMN": true,
}

// classifyRoute maps an origin-destination pair to an award chart zone.
func classifyRoute(origin, dest string) string {
	orig := strings.ToUpper(origin)
	dst := strings.ToUpper(dest)

	origNA := northAmericaAirports[orig]
	dstNA := northAmericaAirports[dst]

	if origNA && dstNA {
		return "north_america"
	}
	if europeAirports[dst] {
		return "atlantic"
	}
	if asiaAirports[dst] {
		return "pacific"
	}
	if middleEastAfricaAirports[dst] {
		return "middle_east_africa"
	}
	// Default: assume transatlantic-like pricing
	_ = orig
	return "atlantic"
}

// ── cardEntry ───────────────────────────────────────────────────────────────

type cardEntry struct {
	cardID   string
	cardName string
	balance  int64
}

// ── Cash price extraction ───────────────────────────────────────────────────

var pricePatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)(?:CA?\$|CAD\s*)\s*([\d,]+(?:\.\d{1,2})?)`),
	regexp.MustCompile(`(?i)\$([\d,]+(?:\.\d{1,2})?)\s*(?:CAD|cdn|canadian)`),
	regexp.MustCompile(`\$([\d,]+(?:\.\d{1,2})?)`),
}

// cabinMinPrice returns the minimum plausible cash price for a flight based
// on cabin class and route zone.  This prevents the regex from picking up
// economy fares, tax amounts, or promotional "save $X" text when searching
// for business or first class prices.
func cabinMinPrice(cabin, zone string) float64 {
	mins := map[string]map[string]float64{
		"north_america":      {"economy": 150, "business": 800, "first": 2000},
		"atlantic":           {"economy": 400, "business": 3000, "first": 7000},
		"pacific":            {"economy": 500, "business": 3500, "first": 8000},
		"middle_east_africa": {"economy": 450, "business": 3000, "first": 7000},
	}
	if zm, ok := mins[zone]; ok {
		if p, ok := zm[cabin]; ok {
			return p
		}
	}
	return 200
}

// extractPriceFromResults parses CAD prices from Tavily search result text.
// minPrice filters out values that are too low for the cabin class being searched.
// Returns the median of plausible prices, or 0 if none.
func extractPriceFromResults(results []tavilyResult, minPrice float64) float64 {
	if minPrice <= 0 {
		minPrice = 200
	}
	var prices []float64
	for _, r := range results {
		for _, pat := range pricePatterns {
			matches := pat.FindAllStringSubmatch(r.Content, -1)
			for _, match := range matches {
				if len(match) > 1 {
					cleaned := strings.ReplaceAll(match[1], ",", "")
					if p, err := strconv.ParseFloat(cleaned, 64); err == nil && p >= minPrice && p <= 50000 {
						prices = append(prices, p)
					}
				}
			}
		}
	}
	if len(prices) == 0 {
		return 0
	}
	sort.Float64s(prices)
	// Use 75th percentile — lower prices tend to be economy fares, sale
	// prices, or connecting-flight prices that slipped through the filter.
	// The 75th percentile better represents what a typical direct booking costs.
	idx := len(prices) * 3 / 4
	if idx >= len(prices) {
		idx = len(prices) - 1
	}
	return prices[idx]
}

// ── TravelPricing ───────────────────────────────────────────────────────────

type travelPricing struct {
	cashPriceCAD float64 // per-person (flights) or per-night (hotels)
	source       string  // "live_search" | "knowledge_base" | "estimated"
}

// ── EvaluateTrip ────────────────────────────────────────────────────────────

func (s *TripService) EvaluateTrip(ctx context.Context, req model.TripRequest) ([]model.RedemptionOption, error) {
	// Carry Pro status down to resolveFlightPoints so the live Apify probe
	// only fires for Pro users (free users get the KB/zone estimate).
	ctx = withProCtx(ctx, req.IsPro)

	// ── Compute Nights from Date / CheckoutDate ─────────────────────────
	if req.TripType == "hotel" && req.Date != "" && req.CheckoutDate != "" {
		checkin, err1 := time.Parse("2006-01-02", req.Date)
		checkout, err2 := time.Parse("2006-01-02", req.CheckoutDate)
		if err1 == nil && err2 == nil && checkout.After(checkin) {
			req.Nights = int(checkout.Sub(checkin).Hours() / 24)
		}
	}
	if req.Passengers <= 0 {
		req.Passengers = 1
	}
	if req.TripType == "hotel" && req.Nights <= 0 {
		req.Nights = 1
	}

	// ── Load wallet ─────────────────────────────────────────────────────
	user, err := s.walletRepo.GetUserBySession(ctx, req.SessionID)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}
	userCards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil {
		return nil, fmt.Errorf("could not load wallet: %w", err)
	}

	// ── Aggregate balances per program ──────────────────────────────────
	type programBalance struct {
		programID   string
		programName string
		programSlug string
		balance     int64
		baseCPP     float64
		cards       []cardEntry
	}

	programMap := map[string]*programBalance{}
	for _, uc := range userCards {
		if uc.Card == nil || uc.Card.LoyaltyProgram == nil {
			continue
		}
		prog := uc.Card.LoyaltyProgram
		ce := cardEntry{cardID: uc.CardID, cardName: uc.Card.Name, balance: uc.PointBalance}
		if pb, ok := programMap[prog.ID]; ok {
			pb.balance += uc.PointBalance
			pb.cards = append(pb.cards, ce)
		} else {
			programMap[prog.ID] = &programBalance{
				programID: prog.ID, programName: prog.Name, programSlug: prog.Slug,
				balance: uc.PointBalance, baseCPP: prog.BaseCPP,
				cards: []cardEntry{ce},
			}
		}
	}

	// ── Seed programs from knowledge base so results are never empty ────
	if s.kb != nil {
		hasSlug := map[string]bool{}
		for _, pb := range programMap {
			hasSlug[pb.programSlug] = true
		}
		for key, prog := range s.kb.Programs {
			slug := strings.ReplaceAll(key, "_", "-")
			if hasSlug[slug] {
				continue
			}
			// Only add programs that have an award chart or hotel properties
			if len(prog.AwardChart) == 0 && len(prog.CategoryChart) == 0 &&
				len(prog.AwardTiers) == 0 && len(prog.Properties) == 0 {
				continue
			}
			cpp := prog.CPPRange.Low
			if cpp <= 0 {
				cpp = 1.0
			}
			programMap["kb-"+key] = &programBalance{
				programID: "kb-" + key, programName: prog.Name, programSlug: slug,
				balance: 0, baseCPP: cpp,
			}
		}
	}

	// ── Transfer graph ──────────────────────────────────────────────────
	type transferEdge struct {
		toProgramID, toProgramName, toProgramSlug string
		ratio, baseCPP                            float64
	}
	transferGraph := map[string][]transferEdge{}
	for pid, pb := range programMap {
		if pb.balance <= 0 {
			continue
		}
		routes, err := s.transferRepo.GetTransferRoutes(ctx, pid)
		if err != nil {
			continue
		}
		for _, tp := range routes {
			if tp.ToProgram == nil {
				continue
			}
			transferGraph[pid] = append(transferGraph[pid], transferEdge{
				toProgramID: tp.ToProgramID, toProgramName: tp.ToProgram.Name,
				toProgramSlug: tp.ToProgram.Slug, ratio: tp.TransferRatio,
				baseCPP: tp.ToProgram.BaseCPP,
			})
		}
	}

	cabin := strings.ToLower(req.Cabin)
	if cabin == "" {
		if req.TripType == "hotel" {
			cabin = "standard"
		} else {
			cabin = "economy"
		}
	}

	// ── Collect program slugs for flight pricing ────────────────────────
	var programSlugs []string
	for _, pb := range programMap {
		programSlugs = append(programSlugs, pb.programSlug)
	}

	// ── Fetch per-airline flight prices (Apify primary, Tavily fallback) ─
	var flightPrices map[string]*travelPricing
	if req.TripType == "flight" {
		flightPrices = s.fetchFlightPrices(ctx, req, programSlugs)
	}

	// ── Helper: savingsRating ────────────────────────────────────────────
	savingsRating := func(cpp float64) string {
		if cpp >= 1.5 {
			return "good"
		} else if cpp >= 0.8 {
			return "fair"
		}
		return "bad"
	}

	// ── Helper: build card breakdowns ───────────────────────────────────
	buildCardBreakdowns := func(pb *programBalance, ratio float64) []model.CardContribution {
		out := make([]model.CardContribution, 0, len(pb.cards))
		for _, ce := range pb.cards {
			out = append(out, model.CardContribution{
				CardName: ce.cardName, CardID: ce.cardID,
				ProgramName: pb.programName, PointsHeld: ce.balance,
				TransferRatio: ratio, PointsAfterTransfer: int64(float64(ce.balance) * ratio),
			})
		}
		return out
	}

	options := make([]model.RedemptionOption, 0)

	// ── Direct redemption options ───────────────────────────────────────
	for _, pb := range programMap {
		ptReq, propertyName, hotelCat, propertyCash := s.resolvePointsRequired(
			ctx, pb.programSlug, req.Origin, req.Destination, cabin, req.TripType, req.Date)
		if ptReq <= 0 {
			continue
		}

		// Scale by passengers / nights
		totalPts := ptReq * int64(req.Passengers)
		if req.TripType == "hotel" {
			totalPts = ptReq * int64(req.Nights) * int64(req.Passengers)
		}

		// Compute CPP & cash price — per-program pricing
		var cpp, cashPrice float64
		var dataSource string

		if req.TripType == "hotel" && propertyCash > 0 {
			// Hotels: use per-property YAML prices (unique per hotel chain)
			cashPrice = propertyCash * float64(req.Nights) * float64(req.Passengers)
			cpp = cashPrice / float64(totalPts) * 100
			dataSource = "knowledge_base"
		} else if req.TripType == "flight" {
			// Flights: use per-airline price from Apify/Tavily
			if fp, ok := flightPrices[pb.programSlug]; ok && fp.cashPriceCAD > 0 {
				cashPrice = fp.cashPriceCAD * float64(req.Passengers)
				cpp = cashPrice / float64(totalPts) * 100
				dataSource = fp.source
			} else {
				// Zone-based estimate fallback
				cpp = pb.baseCPP
				cashPrice = float64(totalPts) * pb.baseCPP / 100.0
				dataSource = "estimated"
			}
		} else {
			// Fallback to baseCPP
			cpp = pb.baseCPP
			cashPrice = float64(totalPts) * pb.baseCPP / 100.0
			dataSource = "estimated"
		}

		// Guard against absurd CPP from a bad KB row / tiny pts figure
		// reaching the UI with a misleading "great value" rating.
		cpp = sanitizeCPP(cpp, pb.baseCPP)

		// Resolve airline name for flights
		airlineName := airlineForProgram[pb.programSlug]

		url := s.resolveBookingURL(pb.programSlug, req.Origin, req.Destination, req.Date, req.CheckoutDate, cabin, req.TripType, req.Passengers)
		canAfford := pb.balance >= totalPts

		options = append(options, model.RedemptionOption{
			ProgramName:     pb.programName,
			ProgramSlug:     pb.programSlug,
			PointsAvailable: pb.balance,
			EstimatedCPP:    math.Round(cpp*100) / 100,
			EstimatedValue:  math.Round(cashPrice*100) / 100,
			TransferPath:    "Direct",
			TransferRatio:   1.0,
			BookingURL:      url,
			Notes:           fmt.Sprintf("Redeem %s directly for %s class", pb.programName, cabin),

			PointsRequired: totalPts,
			CanAfford:      canAfford,
			SavingsRating:  savingsRating(math.Round(cpp*100) / 100),
			ValuePerPoint:  math.Round(cpp*100) / 100,
			CardBreakdowns: buildCardBreakdowns(pb, 1.0),

			CashPriceCAD:  math.Round(cashPrice*100) / 100,
			DataSource:    dataSource,
			PropertyName:  propertyName,
			HotelCategory: hotelCat,
			AirlineName:   airlineName,
		})
	}

	// ── Transfer options ────────────────────────────────────────────────
	for _, pb := range programMap {
		if pb.balance <= 0 {
			continue
		}
		edges, ok := transferGraph[pb.programID]
		if !ok {
			continue
		}
		for _, edge := range edges {
			transferredPoints := int64(float64(pb.balance) * edge.ratio)
			if transferredPoints <= 0 {
				continue
			}

			ptReq, propertyName, hotelCat, propertyCash := s.resolvePointsRequired(
				ctx, edge.toProgramSlug, req.Origin, req.Destination, cabin, req.TripType, req.Date)
			if ptReq <= 0 {
				continue
			}

			totalPts := ptReq * int64(req.Passengers)
			if req.TripType == "hotel" {
				totalPts = ptReq * int64(req.Nights) * int64(req.Passengers)
			}

			var cpp, cashPrice float64
			var dataSource string

			if req.TripType == "hotel" && propertyCash > 0 {
				// Hotels: use per-property YAML prices
				cashPrice = propertyCash * float64(req.Nights) * float64(req.Passengers)
				cpp = cashPrice / float64(totalPts) * 100
				dataSource = "knowledge_base"
			} else if req.TripType == "flight" {
				// Flights: per-airline price from Apify/Tavily
				if fp, ok := flightPrices[edge.toProgramSlug]; ok && fp.cashPriceCAD > 0 {
					cashPrice = fp.cashPriceCAD * float64(req.Passengers)
					cpp = cashPrice / float64(totalPts) * 100
					dataSource = fp.source
				} else {
					cpp = edge.baseCPP
					cashPrice = float64(totalPts) * edge.baseCPP / 100.0
					dataSource = "estimated"
				}
			} else {
				cpp = edge.baseCPP
				cashPrice = float64(totalPts) * edge.baseCPP / 100.0
				dataSource = "estimated"
			}

			cpp = sanitizeCPP(cpp, edge.baseCPP)

			airlineName := airlineForProgram[edge.toProgramSlug]

			url := s.resolveBookingURL(edge.toProgramSlug, req.Origin, req.Destination, req.Date, req.CheckoutDate, cabin, req.TripType, req.Passengers)
			canAfford := transferredPoints >= totalPts

			options = append(options, model.RedemptionOption{
				ProgramName:     edge.toProgramName,
				ProgramSlug:     edge.toProgramSlug,
				PointsAvailable: transferredPoints,
				EstimatedCPP:    math.Round(cpp*100) / 100,
				EstimatedValue:  math.Round(cashPrice*100) / 100,
				TransferPath:    fmt.Sprintf("%s → %s", pb.programName, edge.toProgramName),
				TransferRatio:   edge.ratio,
				BookingURL:      url,
				Notes:           fmt.Sprintf("Transfer %s to %s (%.1f:1) for %s class", pb.programName, edge.toProgramName, edge.ratio, cabin),

				PointsRequired: totalPts,
				CanAfford:      canAfford,
				SavingsRating:  savingsRating(math.Round(cpp*100) / 100),
				ValuePerPoint:  math.Round(cpp*100) / 100,
				CardBreakdowns: buildCardBreakdowns(pb, edge.ratio),

				CashPriceCAD:  math.Round(cashPrice*100) / 100,
				DataSource:    dataSource,
				PropertyName:  propertyName,
				HotelCategory: hotelCat,
				AirlineName:   airlineName,
			})
		}
	}

	// Sort: affordable first, then by ValuePerPoint descending
	sort.Slice(options, func(i, j int) bool {
		if options[i].CanAfford != options[j].CanAfford {
			return options[i].CanAfford
		}
		return options[i].ValuePerPoint > options[j].ValuePerPoint
	})

	if len(options) > 10 {
		options = options[:10]
	}

	return options, nil
}

// ── resolvePointsRequired ───────────────────────────────────────────────────
// Returns (ptsPerUnit, propertyName, hotelCategory, cashCADPerUnit).
// ptsPerUnit is one-way per person (flights) or per night (hotels).

func (s *TripService) resolvePointsRequired(ctx context.Context, slug, origin, dest, cabin, tripType, date string) (int64, string, int, float64) {
	if s.kb == nil {
		return 0, "", 0, 0
	}

	key := yamlKey(slug)

	if tripType == "hotel" {
		return s.resolveHotelPoints(key, dest, cabin)
	}
	return s.resolveFlightPoints(ctx, key, slug, origin, dest, cabin, date)
}

// resolveFlightPoints looks up flight award pricing. For Aeroplan with a live
// Apify integration wired and a 24h-warm cache, returns the cheapest probed
// point cost — that's strictly more accurate than zone-chart estimates which
// can't see dynamic pricing. Cold misses fall back to the static chart and
// trigger a background prime so the next call (theirs or a different user's
// same route) reads live data.
//
// `date` (YYYY-MM-DD) drives the cache key and Apify scrape window. Empty
// date skips the live path entirely — the existing zone-chart logic is the
// only sensible answer when the caller doesn't know when they're flying.
func (s *TripService) resolveFlightPoints(ctx context.Context, yamlKey, slug, origin, dest, cabin, date string) (int64, string, int, float64) {
	// Live-data fast path: Aeroplan only for v1, where Apify coverage is good.
	if (yamlKey == "aeroplan" || slug == "aeroplan") && date != "" && s.cache != nil && s.apifySvc != nil && s.apifySvc.IsAvailable() {
		if pts, ok, _ := s.cache.GetApifyFlightMinPoints(ctx, "aeroplan", origin, dest, date, cabin); ok && pts > 0 {
			return int64(pts), "", 0, 0
		}
		// Cache cold. Only Pro users trigger a live (paid) Apify scrape;
		// free users fall through to the zone-chart estimate below. This
		// gates the single biggest variable Apify cost.
		if proFromCtx(ctx) {
			// Fresh context: the request's ctx dies when EvaluateTrip
			// returns, and Apify takes 60-120s to complete.
			go s.primeApifyFlightProbe(origin, dest, date, cabin)
		}
	}

	// 1. Try exact route match from kb.Flights
	for _, f := range s.kb.Flights {
		if !strings.EqualFold(f.From, origin) || !strings.EqualFold(f.To, dest) {
			continue
		}
		if f.Program != yamlKey && f.Program != slug {
			continue
		}
		var pts int
		switch cabin {
		case "economy":
			pts = f.EconomyPts
		case "business":
			pts = f.BusinessPts
		case "first":
			pts = f.FirstPts
		}
		if pts > 0 {
			return int64(pts), "", 0, 0
		}
	}

	// 2. Fall back to zone-based award chart
	prog, ok := s.kb.Programs[yamlKey]
	if !ok || len(prog.AwardChart) == 0 {
		return 0, "", 0, 0
	}

	zone := classifyRoute(origin, dest)

	// Try exact zone match first, then try alternate zone names
	cabinMap, ok := prog.AwardChart[zone]
	if !ok {
		// Avios uses "north_america_transatlantic" instead of "atlantic"
		alternates := map[string][]string{
			"atlantic":          {"north_america_transatlantic", "europe_short_haul"},
			"north_america":     {"north_america_short"},
			"pacific":           {"asia"},
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
		// Last resort: use any available zone's pricing
		for _, cm := range prog.AwardChart {
			cabinMap = cm
			break
		}
	}

	if pts, found := cabinMap[cabin]; found && pts > 0 {
		return int64(pts), "", 0, 0
	}
	return 0, "", 0, 0
}

// primeApifyFlightProbe runs an Apify scrape for the given route/cabin/date,
// finds the cheapest result, and writes it to the 24h cache. Best-effort;
// failures are logged and discarded — the cache simply stays cold so the next
// caller falls through to the static chart again.
//
// Designed to run in its own goroutine kicked off from resolveFlightPoints;
// uses its own background context with a 3-minute ceiling because Apify
// actor runs commonly take 60-120s.
func (s *TripService) primeApifyFlightProbe(origin, dest, date, cabin string) {
	// Background goroutine: a panic here would crash the entire API process
	// because the parent http handler has already returned. Recover and log.
	defer func() {
		if r := recover(); r != nil {
			slog.Error("[trip-apify-prime] panic recovered",
				"err", r, "origin", origin, "dest", dest, "date", date, "cabin", cabin)
		}
	}()
	if s.apifySvc == nil || s.cache == nil || !s.apifySvc.IsAvailable() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// Apify can't scrape dates more than 60 days out — gate before paying for
	// an actor run that will just return an error.
	if t, err := time.Parse("2006-01-02", date); err == nil {
		if t.Before(time.Now()) || t.After(time.Now().AddDate(0, 0, 60)) {
			return
		}
	}

	items, err := s.apifySvc.SearchAwards(ctx, origin, dest, date, date, cabin, []string{"aeroplan"})
	if err != nil {
		slog.Warn("[trip-apify-prime] scrape failed",
			"origin", origin, "dest", dest, "date", date, "cabin", cabin, "err", err)
		return
	}

	min := 0
	for _, it := range items {
		if it.MileageCost <= 0 {
			continue
		}
		if min == 0 || it.MileageCost < min {
			min = it.MileageCost
		}
	}
	if min == 0 {
		// No availability — don't poison the cache with zero; let it expire
		// naturally so subsequent searches retry.
		slog.Info("[trip-apify-prime] no live availability",
			"origin", origin, "dest", dest, "date", date, "cabin", cabin)
		return
	}

	// 7-day TTL: award point costs are stable week-to-week and this cache is
	// the main shield against re-running the paid Apify scrape for the same
	// route. Longer TTL = far fewer scrapes for a small staleness tradeoff.
	if err := s.cache.SetApifyFlightMinPoints(ctx, "aeroplan", origin, dest, date, cabin, min, 7*24*time.Hour); err != nil {
		slog.Warn("[trip-apify-prime] cache set failed", "err", err)
		return
	}
	slog.Info("[trip-apify-prime] primed",
		"origin", origin, "dest", dest, "date", date, "cabin", cabin, "min_points", min)
}

// resolveHotelPoints looks up hotel points pricing from the knowledge base.
func (s *TripService) resolveHotelPoints(yamlKey, destination, roomType string) (int64, string, int, float64) {
	prog, ok := s.kb.Programs[yamlKey]
	if !ok || prog == nil {
		return 0, "", 0, 0
	}

	// Normalize destination for property lookup
	destKey := strings.ToLower(strings.ReplaceAll(destination, " ", "_"))

	// Try property-level data first (most accurate — has real cash prices)
	if properties, ok := prog.Properties[destKey]; ok && len(properties) > 0 {
		// Sort by points (ascending) for consistent selection
		sorted := make([]knowledge.Property, len(properties))
		copy(sorted, properties)
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].PtsPerNight < sorted[j].PtsPerNight
		})

		var pick knowledge.Property
		switch roomType {
		case "standard":
			pick = sorted[0]
		case "suite":
			pick = sorted[len(sorted)-1]
		default: // "deluxe"
			pick = sorted[len(sorted)/2]
		}
		return int64(pick.PtsPerNight), pick.Name, pick.Category, pick.CashCAD
	}

	// Fallback: category chart (Marriott, Hyatt)
	if len(prog.CategoryChart) > 0 {
		catKeys := map[string][]string{
			"standard": {"cat3", "cat4", "cat2"},
			"deluxe":   {"cat5", "cat6", "cat4"},
			"suite":    {"cat7", "cat8", "cat6"},
		}
		for _, ck := range catKeys[roomType] {
			if v, found := prog.CategoryChart[ck]; found {
				return int64(v), "", 0, 0
			}
		}
	}

	// Fallback: award tiers (Hilton, IHG)
	if len(prog.AwardTiers) > 0 {
		tierKeys := map[string][]string{
			"standard": {"mid", "budget"},
			"deluxe":   {"luxury", "mid"},
			"suite":    {"ultra_luxury", "luxury"},
		}
		for _, tk := range tierKeys[roomType] {
			if v, found := prog.AwardTiers[tk]; found {
				return int64(v), "", 0, 0
			}
		}
	}

	return 0, "", 0, 0
}

// ── resolveBookingURL ───────────────────────────────────────────────────────
// Builds deep-linked URLs that land on each program's search/booking page
// with route, dates, cabin, and passengers pre-filled.

func (s *TripService) resolveBookingURL(slug, origin, dest, date, checkoutDate, cabin, tripType string, passengers int) string {
	if passengers <= 0 {
		passengers = 1
	}

	if tripType == "flight" {
		return s.resolveFlightBookingURL(slug, origin, dest, date, cabin, passengers)
	}
	return s.resolveHotelBookingURL(slug, dest, date, checkoutDate)
}

func (s *TripService) resolveFlightBookingURL(slug, origin, dest, date, cabin string, passengers int) string {
	origin = strings.ToUpper(origin)
	dest = strings.ToUpper(dest)

	switch slug {
	case "aeroplan":
		url := fmt.Sprintf("https://www.aircanada.com/aeroplan/redeem/availability/outbound?org0=%s&dest0=%s&ADT=%d&YTH=0&CHD=0&INF=0&INS=0&tripType=O&marketCode=INT",
			origin, dest, passengers)
		if date != "" {
			url += fmt.Sprintf("&departureDate0=%s", date)
		}
		return url

	case "avios":
		cabinCode := "M"
		switch cabin {
		case "business":
			cabinCode = "J"
		case "first":
			cabinCode = "F"
		}
		url := fmt.Sprintf("https://www.britishairways.com/travel/redeem/execclub/_gf/en_gb?eId=106019&from=%s&to=%s&cabin=%s",
			origin, dest, cabinCode)
		if date != "" {
			if t, err := time.Parse("2006-01-02", date); err == nil {
				url += fmt.Sprintf("&depDate=%s", t.Format("02/01/06"))
			}
		}
		return url

	case "flying-blue":
		return "https://wwws.airfrance.us/search/advanced"

	case "united":
		url := fmt.Sprintf("https://www.united.com/en/us/fsr/choose-flights?f=%s&t=%s&tt=1&sc=7&px=%d&taxng=1&newHP=True",
			origin, dest, passengers)
		if date != "" {
			url += "&d=" + date
		}
		return url

	case "delta":
		url := fmt.Sprintf("https://www.delta.com/flight-search/book-a-flight?tripType=ONE_WAY&originAirport=%s&destinationAirport=%s&paxCount=%d&awardTravel=true",
			origin, dest, passengers)
		if date != "" {
			url += "&departureDate=" + date
		}
		return url

	case "american":
		url := fmt.Sprintf("https://www.aa.com/booking/find-flights?tripType=oneWay&origin=%s&destination=%s&pax=%d&redeemMiles=true",
			origin, dest, passengers)
		if date != "" {
			url += "&departDate=" + date
		}
		return url

	case "alaska":
		url := fmt.Sprintf("https://www.alaskaair.com/shopping/flights?allcarriers=n&prior=award&A=%s&B=%s&D=%d",
			origin, dest, passengers)
		if date != "" {
			url += "&O=" + date
		}
		return url

	case "eurobonus":
		url := fmt.Sprintf("https://www.flysas.com/en/us/book/flights/?origin=%s&destination=%s&adt=%d&award=true",
			origin, dest, passengers)
		if date != "" {
			url += "&outboundDate=" + date
		}
		return url

	case "virginatlantic":
		return "https://www.virginatlantic.com/flight-search#book-with-miles"

	case "lufthansa":
		return fmt.Sprintf("https://www.miles-and-more.com/us/en/earn-miles/flights/flights.html?from=%s&to=%s", origin, dest)

	case "singapore":
		return "https://www.singaporeair.com/en_UK/ppsclub-krisflyer/use-miles/redeem-flights/"

	case "emirates":
		return fmt.Sprintf("https://www.emirates.com/us/english/book/?from=%s&to=%s", origin, dest)

	case "turkish":
		return "https://www.turkishairlines.com/en-us/flights/award-ticket/"

	case "qatar":
		return "https://www.qatarairways.com/en/Privilege-Club/use-qmiles/book-awards.html"

	case "etihad":
		return "https://www.etihad.com/en-us/manage/book-with-miles"
	}

	// Fallback: Google Flights search with route and date
	url := fmt.Sprintf("https://www.google.com/travel/flights?q=flights+from+%s+to+%s",
		origin, dest)
	if date != "" {
		url += fmt.Sprintf("+on+%s", date)
	}
	if cabin != "" && cabin != "economy" {
		url += fmt.Sprintf("+%s+class", cabin)
	}
	return url
}

func (s *TripService) resolveHotelBookingURL(slug, dest, checkinDate, checkoutDate string) string {
	destEncoded := strings.ReplaceAll(dest, " ", "+")

	switch slug {
	case "marriott-bonvoy":
		// Marriott hotel search — verified working: findHotels.mi with correct param names
		url := fmt.Sprintf("https://www.marriott.com/search/findHotels.mi?destinationAddress.destination=%s", destEncoded)
		if checkinDate != "" {
			if t, err := time.Parse("2006-01-02", checkinDate); err == nil {
				url += fmt.Sprintf("&fromDate=%s", t.Format("01/02/2006"))
			}
		}
		if checkoutDate != "" {
			if t, err := time.Parse("2006-01-02", checkoutDate); err == nil {
				url += fmt.Sprintf("&toDate=%s", t.Format("01/02/2006"))
			}
		}
		return url

	case "world-of-hyatt":
		// Hyatt requires a property code in the URL path — no general city search deep link.
		// Fall through to Google Hotels which works reliably.
		url := fmt.Sprintf("https://www.google.com/travel/hotels/%s", destEncoded)
		if checkinDate != "" && checkoutDate != "" {
			url += fmt.Sprintf("?dates=%s,%s&q=hyatt+%s", checkinDate, checkoutDate, destEncoded)
		}
		return url

	case "hilton-honors":
		// Hilton hotel search — verified working as-is
		url := fmt.Sprintf("https://www.hilton.com/en/search/?query=%s", destEncoded)
		if checkinDate != "" {
			url += fmt.Sprintf("&arrivalDate=%s", checkinDate)
		}
		if checkoutDate != "" {
			url += fmt.Sprintf("&departureDate=%s", checkoutDate)
		}
		return url

	case "ihg-rewards":
		// IHG hotel search with dates
		url := fmt.Sprintf("https://www.ihg.com/hotels/us/en/find-hotels/hotel/list?qDest=%s", destEncoded)
		if checkinDate != "" {
			if t, err := time.Parse("2006-01-02", checkinDate); err == nil {
				url += fmt.Sprintf("&qCiD=%d&qCiMy=%s", t.Day(), t.Format("012006"))
			}
		}
		if checkoutDate != "" {
			if t, err := time.Parse("2006-01-02", checkoutDate); err == nil {
				url += fmt.Sprintf("&qCoD=%d&qCoMy=%s", t.Day(), t.Format("012006"))
			}
		}
		return url
	}

	// Verified fallback URLs for bank programs
	if url, ok := fallbackBookingURLs[slug]; ok {
		return url
	}

	// Google Hotels deep link with dates
	url := fmt.Sprintf("https://www.google.com/travel/hotels/%s", destEncoded)
	if checkinDate != "" && checkoutDate != "" {
		url += fmt.Sprintf("?dates=%s,%s", checkinDate, checkoutDate)
	}
	return url
}

// ── fetchFlightPrices ────────────────────────────────────────────────────────
// Fetches real per-airline flight prices.
// Primary: Amadeus Flight Offers Search (synchronous, ~2s)
// Fallback: Per-airline Tavily web searches
// Last resort: Zone-based estimates

func (s *TripService) fetchFlightPrices(ctx context.Context, req model.TripRequest, slugs []string) map[string]*travelPricing {
	results := map[string]*travelPricing{}
	cabin := strings.ToLower(req.Cabin)

	// ── 1. Try SerpAPI Google Flights (real cabin-specific prices in CAD) ─
	if s.flightSvc != nil && s.flightSvc.IsAvailable() {
		serpCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()

		flights, err := s.flightSvc.SearchFlights(serpCtx, req.Origin, req.Destination, req.Date, cabin, req.Passengers)
		if err == nil && len(flights) > 0 {
			for _, f := range flights {
				slug := matchAirlineToProgram(f.Airline)
				if slug == "" {
					continue
				}
				results[slug] = &travelPricing{
					cashPriceCAD: f.Price,
					source:       "live_search",
				}
			}
		}
	}

	// ── 2. Tavily fallback for programs not covered by Apify ─────────────
	// Run concurrent per-airline searches for any missing programs.
	// Uses cabin-aware minimum price thresholds so we don't pick up economy
	// fares when searching for business/first class.
	zone := classifyRoute(req.Origin, req.Destination)
	minPrice := cabinMinPrice(cabin, zone)

	if s.tavilySvc != nil && s.tavilySvc.IsAvailable() {
		var missing []string
		for _, slug := range slugs {
			if _, ok := results[slug]; ok {
				continue
			}
			airline := airlineForProgram[slug]
			if airline != "" {
				missing = append(missing, slug)
			}
		}

		if len(missing) > 0 {
			var mu sync.Mutex
			var wg sync.WaitGroup

			tavilyCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
			defer cancel()

			for _, slug := range missing {
				wg.Add(1)
				go func(s2 string) {
					defer wg.Done()
					// Tavily / price-extract can panic on weird HTML; survive it.
					defer func() {
						if r := recover(); r != nil {
							slog.Error("[trip] tavily-price goroutine panic recovered",
								"err", r, "program", s2)
						}
					}()
					airline := airlineForProgram[s2]
					// Specific query targeting actual ticket prices, not blog posts
					query := fmt.Sprintf("%s %s class one way %s to %s cash fare price CAD booking",
						airline, cabin, req.Origin, req.Destination)

					tavilyResults, err := s.tavilySvc.SearchTravel(tavilyCtx, query)
					if err != nil || len(tavilyResults) == 0 {
						return
					}
					price := extractPriceFromResults(tavilyResults, minPrice)
					if price > 0 {
						mu.Lock()
						results[s2] = &travelPricing{cashPriceCAD: price, source: "live_search"}
						mu.Unlock()
					}
				}(slug)
			}
			wg.Wait()
		}
	}

	// ── 3. Zone-based estimates for anything still missing ───────────────
	// These represent realistic mid-range cash prices for one-way flights.
	// Business class transatlantic is typically $4,000–$7,000 CAD one-way.
	estimates := map[string]map[string]float64{
		"north_america":      {"economy": 400, "business": 1500, "first": 3500},
		"atlantic":           {"economy": 800, "business": 5000, "first": 10000},
		"pacific":            {"economy": 1000, "business": 6000, "first": 14000},
		"middle_east_africa": {"economy": 900, "business": 5500, "first": 12000},
	}
	for _, slug := range slugs {
		if _, ok := results[slug]; ok {
			continue
		}
		if zoneMap, ok := estimates[zone]; ok {
			if price, ok := zoneMap[cabin]; ok {
				results[slug] = &travelPricing{cashPriceCAD: price, source: "estimated"}
			}
		}
	}

	return results
}

// sanitizeCPP guards against absurd cents-per-point values reaching the UI.
// A bad knowledge-base row (e.g. PtsPerNight=1, or a tiny flight pts figure)
// makes cashPrice/pts*100 blow up to tens of thousands of ¢/pt; the option
// then gets a misleading "good" SavingsRating and sorts to #1. Anything
// non-finite, non-positive, or above a sane ceiling falls back to the
// program's trustworthy baseline CPP.
func sanitizeCPP(cpp, fallback float64) float64 {
	const maxPlausibleCPP = 25.0 // ¢/pt — well above any real Canadian redemption
	if math.IsNaN(cpp) || math.IsInf(cpp, 0) || cpp <= 0 || cpp > maxPlausibleCPP {
		return fallback
	}
	return cpp
}
