package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"maplerewards/internal/knowledge"
	"maplerewards/internal/model"
)

// ProServices bundles the Pro-tier service handles the AI exposes as gated tools.
// Kept as a struct (rather than separate AIService fields) because they're
// always passed together and the registry iterates them as a unit.
type ProServices struct {
	BuyPoints     *BuyPointsService
	Stack         *StackService
	MissedRewards *MissedRewardsService
	SQC           *SQCService
	Devaluation   *DevaluationService
	AwardWatch    *AwardWatchService
}

// AIService provides AI-powered credit card rewards advice using Claude.
type AIService struct {
	apiKey  string
	modelID string // strong model (Sonnet) — complex / tool-heavy turns
	// fastModelID is the cheap model (Haiku) used for simple turns that
	// don't need multi-step award/trip/points reasoning. Routing between
	// the two is the single biggest chat-cost lever — Haiku is ~3-5x
	// cheaper and handles the bulk of "which card for X" style questions.
	fastModelID    string
	httpClient     *http.Client
	walletRepo     WalletRepository
	cardRepo       CardRepository
	transferRepo   TransferRepository
	valuationRepo  ValuationRepository
	optimizerSvc   *OptimizerService
	tavilySvc      *TavilyService
	serpSvc        *SerpAPIService
	knowledgeBase  *knowledge.KnowledgeBase
	awardSearchSvc *AwardSearchService
	pro            ProServices
	tools          *toolRegistry
}

func NewAIService(
	apiKey string,
	walletRepo WalletRepository,
	cardRepo CardRepository,
	transferRepo TransferRepository,
	valuationRepo ValuationRepository,
	optimizerSvc *OptimizerService,
	tavilySvc *TavilyService,
	kb *knowledge.KnowledgeBase,
	awardSearchSvc *AwardSearchService,
	serpSvc *SerpAPIService,
	pro ProServices,
) *AIService {
	// Model is env-overridable so we can A/B against Haiku 4.5 for cost
	// or move to a future Sonnet revision without a redeploy. Default
	// stays on the most recent Sonnet alias Anthropic supports.
	modelID := os.Getenv("ANTHROPIC_MODEL")
	if modelID == "" {
		modelID = "claude-sonnet-4-6"
	}
	// Cheap model for simple turns. Env-overridable so the routing can be
	// disabled (set ANTHROPIC_FAST_MODEL == ANTHROPIC_MODEL) or retargeted
	// without a redeploy.
	fastModelID := os.Getenv("ANTHROPIC_FAST_MODEL")
	if fastModelID == "" {
		fastModelID = "claude-haiku-4-5-20251001"
	}
	s := &AIService{
		apiKey:      apiKey,
		modelID:     modelID,
		fastModelID: fastModelID,
		httpClient: &http.Client{
			Timeout: 90 * time.Second, // longer than callClaude legacy default — tool-use rounds need headroom
		},
		walletRepo:     walletRepo,
		cardRepo:       cardRepo,
		transferRepo:   transferRepo,
		valuationRepo:  valuationRepo,
		optimizerSvc:   optimizerSvc,
		tavilySvc:      tavilySvc,
		serpSvc:        serpSvc,
		knowledgeBase:  kb,
		awardSearchSvc: awardSearchSvc,
		pro:            pro,
	}
	s.registerTools()
	return s
}

// ChatRequest represents a user's chat message with context.
type ChatRequest struct {
	SessionID    string              `json:"session_id"`
	Message      string              `json:"message"`
	History      []model.ChatMessage `json:"history,omitempty"`
	ResearchMode bool                `json:"research_mode,omitempty"`
}

// ChatResponse contains the AI's reply.
type ChatResponse struct {
	Reply   string              `json:"reply"`
	History []model.ChatMessage `json:"history"`
}

// Chat processes a user message with their wallet context and returns AI advice.
func (s *AIService) Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	if s.apiKey == "" {
		return nil, fmt.Errorf("ANTHROPIC_API_KEY not configured")
	}

	// Build wallet context
	walletContext := s.buildWalletContext(ctx, req.SessionID)

	// Build category context
	categoryContext := s.buildCategoryContext(ctx)

	// Build card catalog context (all 40+ cards)
	catalogContext := s.buildCardCatalogContext(ctx)

	// Detect travel queries — if so we fetch real-time data from multiple sources.
	isTravelQuery := containsTravelKeywords(req.Message)
	tavilyAvailable := s.tavilySvc != nil && s.tavilySvc.IsAvailable()

	var researchContext string

	if isTravelQuery {
		// ── STEP 1: Parse the travel query for structured data ────────
		parsed := parseTravelQuery(req.Message)

		// ── STEP 2: SerpAPI — get REAL flight prices from Google Flights ──
		var flightDataContext string
		if parsed != nil && s.serpSvc != nil && s.serpSvc.IsAvailable() {
			serpCtx, serpCancel := context.WithTimeout(ctx, 15*time.Second)
			defer serpCancel()
			flights, serpErr := s.serpSvc.SearchFlights(
				serpCtx, parsed.Origin, parsed.Destination,
				parsed.Date, parsed.Cabin, parsed.Passengers,
			)
			if serpErr == nil && len(flights) > 0 {
				flightDataContext = formatSerpFlightsForPrompt(flights, parsed)
			}
		}

		// ── STEP 3: Award search — points costs + CPP from YAML/KB ───
		var awardContext string
		if parsed != nil && s.awardSearchSvc != nil {
			if parsed.SessionID == "" {
				parsed.SessionID = req.SessionID
			}
			awardResults, aErr := s.awardSearchSvc.Search(ctx, *parsed)
			if aErr == nil && len(awardResults) > 0 {
				awardContext = formatAwardResultsForPrompt(awardResults, parsed)
			}
		}

		// ── STEP 4: Tavily — targeted web search for supplementary data ──
		var travelWebContext string
		if tavilyAvailable && parsed != nil {
			// Build a SPECIFIC query instead of passing raw user message
			travelQuery := buildTargetedTravelQuery(parsed)
			travelResults, tErr := s.tavilySvc.SearchTravel(ctx, travelQuery)
			if tErr == nil && len(travelResults) > 0 {
				travelWebContext = FormatTravelResultsForPrompt(travelResults)
			}
		} else if tavilyAvailable {
			// Fallback: can't parse route, just do generic travel search
			travelResults, tErr := s.tavilySvc.SearchTravel(ctx, req.Message)
			if tErr == nil && len(travelResults) > 0 {
				travelWebContext = FormatTravelResultsForPrompt(travelResults)
			}
		}

		// ── Assemble — structured data FIRST, web snippets LAST ──────
		if flightDataContext != "" {
			researchContext += flightDataContext + "\n"
		}
		if awardContext != "" {
			researchContext += awardContext + "\n"
		}
		if travelWebContext != "" {
			researchContext += travelWebContext + "\n"
		}

		// If we got NO data at all, warn the AI
		if flightDataContext == "" && awardContext == "" && travelWebContext == "" {
			researchContext += "\n## ⚠️ Limited Data Available\n" +
				"Could not fetch live flight prices. Use the award charts from the knowledge base and clearly tell the user these are ESTIMATED prices. " +
				"Recommend they check Google Flights or airline websites for current cash prices.\n\n"
		}
	} else if tavilyAvailable && req.ResearchMode {
		// Non-travel research mode
		results, err := s.tavilySvc.Search(ctx, req.Message)
		if err == nil && len(results) > 0 {
			researchContext = FormatResultsForPrompt(results)
		}
	}

	walletPrograms := s.collectWalletPrograms(ctx, req.SessionID)
	systemPrompt := s.buildSystemPrompt(walletContext, categoryContext, catalogContext, researchContext, walletPrograms)

	// Build message history for the API call. Cap BEFORE the call — this is
	// the cost-control boundary; the post-call trim only bounds storage.
	messages := s.buildMessages(CapHistoryForLLM(req.History), req.Message)

	// Call Claude API
	reply, err := s.callClaude(ctx, systemPrompt, messages)
	if err != nil {
		return nil, fmt.Errorf("AI service error: %w", err)
	}

	// Build updated history
	newHistory := append(req.History,
		model.ChatMessage{Role: "user", Content: req.Message},
		model.ChatMessage{Role: "assistant", Content: reply},
	)

	// Keep history bounded (last 20 messages)
	if len(newHistory) > 20 {
		newHistory = newHistory[len(newHistory)-20:]
	}

	return &ChatResponse{
		Reply:   reply,
		History: newHistory,
	}, nil
}

func (s *AIService) buildWalletContext(ctx context.Context, sessionID string) string {
	if sessionID == "" {
		return "The user has not set up a wallet yet. Encourage them to add their credit cards first."
	}

	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		// Session doesn't exist yet — caller hasn't run /wallet/anonymous to seed
		// one. Treat the same as no wallet rather than panicking on nil deref.
		return "The user has not set up a wallet yet. Encourage them to add their credit cards first."
	}

	cards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil || len(cards) == 0 {
		return "The user's wallet is empty. Suggest they add their credit cards."
	}

	// Group cards by loyalty program to build program-level balance summaries.
	type programSummary struct {
		name     string
		baseCPP  float64
		balance  int64
		flexible bool // true for flexible transferable currencies like Amex MR
	}
	programMap := make(map[string]*programSummary)
	programOrder := []string{}

	for _, uc := range cards {
		if uc.Card == nil || uc.Card.LoyaltyProgram == nil {
			continue
		}
		prog := uc.Card.LoyaltyProgram
		if _, exists := programMap[prog.Name]; !exists {
			// Determine whether this is a flexible points currency.
			flexible := prog.Name == "Amex MR" || prog.Name == "RBC Avion" ||
				prog.Name == "TD Rewards" || prog.Name == "CIBC Aventura" ||
				prog.Name == "BMO Rewards"
			programMap[prog.Name] = &programSummary{
				name:     prog.Name,
				baseCPP:  prog.BaseCPP,
				flexible: flexible,
			}
			programOrder = append(programOrder, prog.Name)
		}
		programMap[prog.Name].balance += uc.PointBalance
	}

	var sb strings.Builder
	sb.WriteString("Your loyalty program balances:\n")
	for _, progName := range programOrder {
		ps := programMap[progName]
		if ps.balance <= 0 {
			continue
		}
		lowValue := float64(ps.balance) * ps.baseCPP / 100.0 //nolint:unconvert
		// Flexible currencies (transferable to airlines) can achieve up to 2.0× base CPP;
		// airline/hotel programs top out at ~1.5× base CPP.
		multiplier := 1.5
		if ps.flexible {
			multiplier = 2.0
		}
		highValue := lowValue * multiplier
		fmt.Fprintf(&sb, "- %s: %s pts (≈ $%.0f–$%.0f value @ %.1f–%.1f¢/pt)\n",
			ps.name,
			formatPoints(ps.balance),
			lowValue,
			highValue,
			ps.baseCPP,
			ps.baseCPP*multiplier,
		)
	}

	sb.WriteString("\nCards in wallet:\n")
	for _, uc := range cards {
		if uc.Card == nil {
			continue
		}
		progName := ""
		if uc.Card.LoyaltyProgram != nil {
			progName = uc.Card.LoyaltyProgram.Name
		}
		feeStr := "no fee"
		if uc.Card.AnnualFee > 0 {
			feeStr = fmt.Sprintf("$%.0f/yr", uc.Card.AnnualFee)
		}
		fmt.Fprintf(&sb, "- %s (%s, %s)", uc.Card.Name, progName, feeStr)
		if uc.PointBalance > 0 {
			fmt.Fprintf(&sb, " — %s pts", formatPoints(uc.PointBalance))
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

// formatPoints formats an integer point balance with comma separators (e.g. 35000 → "35,000").
func formatPoints(pts int64) string {
	s := fmt.Sprintf("%d", pts)
	if len(s) <= 3 {
		return s
	}
	// Insert commas from right to left every 3 digits.
	result := make([]byte, 0, len(s)+len(s)/3)
	offset := len(s) % 3
	if offset == 0 {
		offset = 3
	}
	result = append(result, s[:offset]...)
	for i := offset; i < len(s); i += 3 {
		result = append(result, ',')
		result = append(result, s[i:i+3]...)
	}
	return string(result)
}

func (s *AIService) buildCategoryContext(ctx context.Context) string {
	categories, err := s.cardRepo.ListCategories(ctx)
	if err != nil || len(categories) == 0 {
		return ""
	}

	var slugs []string
	for _, c := range categories {
		slugs = append(slugs, c.Slug)
	}
	return "Available spending categories: " + strings.Join(slugs, ", ")
}

// buildCardCatalogContext used to inject every card (~5-7K tokens per request)
// into the system prompt so the AI could reference any card by name. That was
// expensive and mostly wasted — typical chats reference 1-3 cards. We now emit
// a compact summary (counts + issuers) and rely on the `lookup_card` tool to
// fetch detail on demand. Token usage dropped by ~80% per chat turn.
func (s *AIService) buildCardCatalogContext(ctx context.Context) string {
	cards, err := s.cardRepo.ListCards(ctx)
	if err != nil || len(cards) == 0 {
		return ""
	}

	issuerCounts := map[string]int{}
	freeCount := 0
	for _, c := range cards {
		issuerCounts[c.Issuer]++
		if c.AnnualFee == 0 {
			freeCount++
		}
	}

	// Order issuers by card count desc for a stable, scannable list.
	type ic struct {
		name  string
		count int
	}
	rows := make([]ic, 0, len(issuerCounts))
	for name, count := range issuerCounts {
		rows = append(rows, ic{name, count})
	}
	sort.Slice(rows, func(i, j int) bool { return rows[i].count > rows[j].count })

	var sb strings.Builder
	sb.WriteString("## Canadian Card Catalog (summary)\n")
	fmt.Fprintf(&sb, "We model %d Canadian cards (%d no-fee). ", len(cards), freeCount)
	sb.WriteString("Issuer breakdown: ")
	for i, r := range rows {
		if i > 0 {
			sb.WriteString(", ")
		}
		fmt.Fprintf(&sb, "%s (%d)", r.name, r.count)
	}
	sb.WriteString(".\n\n")
	sb.WriteString("To pull details for any specific card, use the `lookup_card` tool with a name or issuer query — DO NOT guess card details from memory. The tool returns annual fee, welcome bonus, network, loyalty program, and category multipliers for matching cards.\n")
	return sb.String()
}

// collectWalletPrograms returns the slugs of all loyalty programs the user
// holds points in (via cards in their wallet). Returns nil for anonymous
// users so the FormatForPrompt filter falls through to "show everything".
func (s *AIService) collectWalletPrograms(ctx context.Context, sessionID string) []string {
	if sessionID == "" || s.walletRepo == nil {
		return nil
	}
	user, err := s.walletRepo.GetUserBySession(ctx, sessionID)
	if err != nil || user == nil {
		return nil
	}
	cards, err := s.walletRepo.GetUserCards(ctx, user.ID)
	if err != nil || len(cards) == 0 {
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(cards))
	for _, uc := range cards {
		if uc.Card == nil || uc.Card.LoyaltyProgram == nil {
			continue
		}
		slug := uc.Card.LoyaltyProgram.Slug
		if slug == "" {
			slug = uc.Card.LoyaltyProgram.Name
		}
		if slug == "" || seen[slug] {
			continue
		}
		seen[slug] = true
		out = append(out, slug)
	}
	return out
}

func (s *AIService) buildSystemPrompt(walletContext, categoryContext, catalogContext, researchContext string, walletPrograms []string) string {
	var sb strings.Builder

	sb.WriteString(`You are Maple, MapleRewards' friendly and expert Canadian credit card rewards assistant.

Your role:
- Help users maximize the value of their credit card points and rewards in Canada
- Provide specific, data-backed advice about which card to use for each purchase
- Explain point valuations, transfer partners, and redemption strategies
- Answer questions about Canadian credit cards, loyalty programs (Aeroplan, Amex MR, Scene+, PC Optimum, etc.)
- Be conversational but concise — users want quick, actionable advice

`)
	// Inject knowledge base — prefer YAML-loaded data, fall back to hardcoded.
	// Filter to the user's wallet programs when non-empty to keep the prompt
	// focused and reduce token bloat for users who only hold a few currencies.
	var knowledgeStr string
	if s.knowledgeBase != nil {
		knowledgeStr = s.knowledgeBase.FormatForPrompt(walletPrograms)
	} else {
		knowledgeStr = buildStaticKnowledgeBase()
	}
	sb.WriteString(knowledgeStr)
	sb.WriteString(`
Rules:
- Always reference the user's actual cards when giving advice
- If they ask about a card they don't have, explain the card and suggest adding it to their wallet
- When discussing point values, use specific CPP numbers
- Round dollar amounts to 2 decimal places
- Be honest about limitations — if you're unsure, say so
- Never make up card details or multiplier rates
- Keep responses under 500 words unless the user asks for a detailed breakdown
- Use markdown formatting for clarity (bold, bullet points, etc.)

## ⚠️ CRITICAL: DATA PRIORITY FOR TRAVEL QUERIES
When travel data is provided below, you MUST follow this strict priority:

**PRIORITY 1 — LIVE FLIGHT PRICES (Google Flights table):**
These are REAL prices from Google Flights in CAD. ALWAYS quote these exact dollar amounts.
NEVER make up prices or use ranges when exact numbers are provided.
Say: "A business class flight on [airline] is currently **$X,XXX CAD** (as of today)."

**PRIORITY 2 — STRUCTURED AWARD SEARCH RESULTS (points table):**
These show exact points costs per program, CPP values, and booking links.
ALWAYS quote the exact points numbers and include the booking links.
Say: "Via Aeroplan, that's **55,000 points** one-way, giving you **X.X¢/point** value."

**PRIORITY 3 — Web research snippets:**
Use these for supplementary context (travel tips, seasonal advice) but NOT for prices
when Priority 1 or 2 data is available.

**NEVER do these things:**
- Do NOT say "approximately" or "around" when you have exact numbers from LIVE data tables
- Do NOT give price ranges ($1,200–$1,800) when a LIVE table shows $1,456 specifically
- Do NOT omit booking links when they are in the data
- Do NOT ignore the CPP calculations — always tell the user if a redemption is good value
- Do NOT present ESTIMATED/knowledge-base points costs as exact — say "starting from ~X points (published rate)" and note that actual availability may differ
- Do NOT confuse LIVE data (marked "live" in Source column) with ESTIMATED data (marked "estimated")
- When award search results show Source="estimated", ALWAYS caveat: "These are published award chart rates. Actual prices vary by date — check the airline's website for live availability."

TRAVEL RESPONSE FORMAT — Always structure travel answers like this:
1. **💰 Cash Price** — Quote the exact price from the flight data table
2. **✈️ Points Options** — List each program with exact points cost, CPP, and value rating
3. **🏦 Your Wallet** — Compare what they have vs. what they need (if wallet data exists)
4. **📊 Best Value** — Recommend which option gives the highest CPP
5. **🔗 Book It** — Include direct booking links from the data
6. **📝 Next Steps** — Actionable steps the user can take right now

Additional travel rules:
- For transfers: explain which card → which program → ratio
- When dates are FLEXIBLE, suggest best months to travel for that route
- Always note: "Check the [Travel page](/trip-planner) for the full redemption calculator"
- If NO live data is available, be upfront: "I don't have live prices right now — check Google Flights for current pricing"

`)


	// Add research context if available
	if researchContext != "" {
		sb.WriteString(researchContext)
	}

	sb.WriteString(walletContext)
	sb.WriteString("\n\n")
	sb.WriteString(categoryContext)
	sb.WriteString("\n\n")
	sb.WriteString(catalogContext)

	return sb.String()
}

// buildStaticKnowledgeBase returns a hardcoded reference of Canadian loyalty program data.
func buildStaticKnowledgeBase() string {
	return `## Knowledge Base — Canadian Loyalty Programs

### CPP Benchmarks (cents per point)
| Program | Base CPP | Good Redemption | Sweet Spot |
|---------|----------|-----------------|------------|
| Aeroplan | 1.5¢ | 1.8-2.2¢ | 3-6¢ (partner Business/First) |
| Amex MR | 1.0¢ | 1.5-2.0¢ | 2-4¢ (transfer to Aeroplan for J/F) |
| Scene+ | 0.8¢ | 1.0-1.2¢ | 1.2¢ (movies, dining credits) |
| PC Optimum | 0.7¢ | 0.8-1.0¢ | 1.0¢ (Shoppers 20x events) |
| RBC Avion | 1.0¢ | 1.2-1.5¢ | 2-3¢ (transfer to BA Avios for short-haul) |
| TD Rewards | 0.4¢ | 0.5-0.8¢ | 1.0¢ (Expedia for TD bookings) |
| CIBC Aventura | 1.0¢ | 1.2¢ | 1.5¢ (fixed-value travel) |
| BMO Rewards | 0.7¢ | 0.8-1.0¢ | 1.5¢ (transfer to Air Miles) |
| Air Miles | 10¢ | 12-15¢ | 15¢+ (dream miles for flights) |
| Marriott Bonvoy | 0.7¢ | 0.8-1.0¢ | 1.5¢ (5th night free at premium properties) |
| World of Hyatt | 1.5¢ | 2.0-2.5¢ | 3¢+ (Park Hyatt properties) |
| Hilton Honors | 0.4¢ | 0.5-0.7¢ | 0.7¢ (use 5th night free benefit) |

### Key Transfer Partners
- **Amex MR →** Aeroplan (1:1), British Airways Avios (1:1), Flying Blue (1:1), Marriott Bonvoy (1:1.2), Hilton (1:2)
- **RBC Avion →** British Airways Avios (1:1), Asia Miles (1:1), WestJet (100:1)
- **CIBC Aventura →** Aeroplan (1:1 for AP cards)
- **BMO Rewards →** Air Miles (varies)

### Aeroplan Award Chart (one-way per person)
| Destination | Economy | Business | First |
|-------------|---------|----------|-------|
| North America (short-haul <500mi) | 6,000 | 15,000 | — |
| North America | 12,500 | 30,000 | 45,000 |
| Atlantic (Europe) | 30,000 | 55,000 | 75,000 |
| Pacific (Asia) | 40,000 | 65,000 | 90,000 |
| Middle East / Africa | 35,000 | 60,000 | 85,000 |

### Aeroplan Sweet Spots
- **YYZ→LHR Business 55k** — best transatlantic value from Canada
- **ANA Business (The Room):** ~65k pts via Aeroplan — world-class product
- **Star Alliance partners** (Lufthansa, Swiss, ANA, Singapore) often have better availability than Air Canada metal
- **Stopovers:** Add a stopover on round-trips for 5,000 pts — massive value
- **Mini Round-the-World:** Up to 2 stopovers + 1 open jaw on long-haul RT

### BA Avios Award Chart (one-way per person from Canada)
| Route | Economy | Business | First |
|-------|---------|----------|-------|
| Transatlantic | 50,000 | 80,000 | 130,000 |
| Europe short-haul | 9,000 | 18,000 | — |
| North America short-haul | 7,500 | 15,000 | — |

### Flying Blue (Air France/KLM) Award Chart
| Destination | Economy | Business |
|-------------|---------|----------|
| Atlantic | 35,000 | 70,000 |
| Pacific | 45,000 | 80,000 |
Note: Flying Blue Promo Awards discount 25–50% on select routes monthly.

### Hotel Programs — Award Tier Overview
**Marriott Bonvoy:** Cat 1: 7,500 | Cat 3: 17,500 | Cat 5: 35,000 | Cat 7: 85,000 pts/nt
- 5th night free on award stays (book 5 nights, pay 4 in points)
- Best brands: Ritz-Carlton (Cat 7–8), St. Regis (Cat 7–8), Westin/Sheraton (Cat 4–6)

**World of Hyatt:** Cat 1: 3,500 | Cat 3: 12,000 | Cat 5: 20,000 | Cat 7: 30,000 pts/nt
- Best CPP of all hotel programs at 1.5–2.5¢/pt
- Park Hyatt properties = top-tier luxury (Cat 7)

**Hilton Honors:** Budget: 20,000 | Mid: 50,000 | Luxury: 95,000 pts/nt
- 5th night free on awards
- Waldorf Astoria properties 100k–150k pts/nt

**IHG One Rewards:** Budget: 10,000 | Mid: 25,000 | Luxury: 60,000 pts/nt
- 4th night free on point stays

### Specific Hotel Properties
**Toronto:**
- Hyatt Regency Toronto: 12,000 pts/nt (≈ $310 cash CAD) — best value
- Sheraton Centre Toronto: 35,000 pts/nt (≈ $330 cash)
- Westin Harbour Castle: 40,000 pts/nt (≈ $360 cash)
- Ritz-Carlton Toronto: 85,000 pts/nt (≈ $750 cash) — ultra luxury

**Paris:**
- Hyatt Regency Paris Étoile: 15,000 pts/nt (≈ $380 cash CAD)
- Park Hyatt Paris-Vendôme: 30,000 pts/nt (≈ $650 cash) — best luxury value
- Marriott Paris Opera: 50,000 pts/nt (≈ $480 cash)

**London:**
- Hyatt Regency Churchill: 20,000 pts/nt (≈ $450 cash CAD)
- Sheraton Grand Park Lane: 60,000 pts/nt (≈ $520 cash)
- Waldorf Hilton London: 95,000 pts/nt (≈ $560 cash)

**Dubai:**
- Sheraton Grand Dubai: 40,000 pts/nt (≈ $380 cash CAD)
- Conrad Dubai: 80,000 pts/nt (≈ $520 cash)
- W Dubai – The Palm: 85,000 pts/nt (≈ $700 cash)

**Maldives:**
- Park Hyatt Maldives Hadahaa: 25,000 pts/nt (≈ $900 cash CAD) — outstanding value

### Popular Flights from Canada (one-way per person)
| Route | Airline | Program | Economy | Business | Duration |
|-------|---------|---------|---------|----------|----------|
| YYZ→LHR | Air Canada | Aeroplan | 30k | 55k | 7.5h direct |
| YYZ→LHR | British Airways | Avios | 50k | 80k | 7.5h direct |
| YYZ→NRT | Air Canada | Aeroplan | 40k | 65k | 14h direct |
| YYZ→NRT | ANA | Aeroplan | 45k | 65k | best J class |
| YYZ→CDG | Air Canada | Aeroplan | 30k | 55k | 8h direct |
| YYZ→CDG | Air France | Flying Blue | 35k | 70k | 8h direct |
| YYZ→DXB | Emirates | Skywards | 60k | 90k | 13h direct |
| YVR→HNL | Air Canada | Aeroplan | 12.5k | 30k | 5.5h direct |
| YYZ→SIN | Singapore Airlines | Aeroplan | 45k | 67.5k | 18h w/stop |

### Top Card Strategies
- **Best everyday card:** Amex Cobalt — 5x on food/drink (effectively ~10% return at 2¢/pt)
- **Best no-fee card:** Tangerine Money-Back — 2% cashback in 2-3 categories
- **Best travel card:** Amex Platinum — lounge access, 3x dining, 2x travel, transfer to Aeroplan
- **Best groceries:** Amex Cobalt (5x) or Scotiabank Scene+ Visa (4x Scene+)
- **Best gas:** CIBC Dividend Visa (4% gas) or Rogers WE MC (1.5% cashback on everything)

### Category Multiplier Notes
- Amex Cobalt 5x categories (food, drink, streaming) share a $2,500/mo cap
- Scotiabank cards: check if Scene+ or Scotia Rewards — they're different programs
- CIBC cards earn Aventura (travel) or Aeroplan (direct) depending on card variant
`
}

// containsTravelKeywords returns true if the message appears to be about travel.
func containsTravelKeywords(msg string) bool {
	lower := strings.ToLower(msg)
	keywords := []string{
		"fly ", "flying", "flight", "flights",
		"hotel", "hotels", "resort", "stay at", "stay in", "staying",
		"book a", "book the", "booking",
		"travel to", "trip to", "visit ",
		"airline", "airport",
		"business class", "first class", "economy class",
		"aeroplan", "avios", "points for", "redeem", "redemption",
		"nights in", "nights at",
		"round trip", "round-trip", "one way", "one-way",
		"departure", "layover", "stopover", "nonstop", "non-stop", "direct flight",
		"flexible date", "flexible dates", "best time to fly", "best time to book",
		"cheapest", "award availability", "award space",
		"yyz", "yvr", "yul", "yyc", "yow", "yhz",  // Canadian airports
		"lhr", "cdg", "nrt", "hnd", "sin", "dxb", "bom", "del", "hkg", "icn", // Major intl airports
	}
	for _, kw := range keywords {
		if strings.Contains(lower, kw) {
			return true
		}
	}
	return false
}

// ── Travel query parser ─────────────────────────────────────────────────────

// cityToAirport maps common city names to their primary IATA airport code.
var cityToAirport = map[string]string{
	"toronto": "YYZ", "vancouver": "YVR", "montreal": "YUL", "ottawa": "YOW",
	"calgary": "YYC", "edmonton": "YEG", "winnipeg": "YWG", "halifax": "YHZ",
	"quebec city": "YQB", "victoria": "YYJ",
	"new york": "JFK", "los angeles": "LAX", "san francisco": "SFO", "chicago": "ORD",
	"miami": "MIA", "dallas": "DFW", "seattle": "SEA", "boston": "BOS",
	"atlanta": "ATL", "denver": "DEN", "honolulu": "HNL", "las vegas": "LAS",
	"washington": "IAD", "houston": "IAH", "orlando": "MCO",
	"london": "LHR", "paris": "CDG", "frankfurt": "FRA", "amsterdam": "AMS",
	"madrid": "MAD", "rome": "FCO", "barcelona": "BCN", "munich": "MUC",
	"zurich": "ZRH", "lisbon": "LIS", "vienna": "VIE", "copenhagen": "CPH",
	"oslo": "OSL", "stockholm": "ARN", "helsinki": "HEL", "dublin": "DUB",
	"edinburgh": "EDI", "manchester": "MAN", "brussels": "BRU", "geneva": "GVA",
	"athens": "ATH", "istanbul": "IST", "prague": "PRG",
	"tokyo": "NRT", "hong kong": "HKG", "singapore": "SIN", "bangkok": "BKK",
	"seoul": "ICN", "shanghai": "PVG", "beijing": "PEK", "taipei": "TPE",
	"kuala lumpur": "KUL", "delhi": "DEL", "mumbai": "BOM", "manila": "MNL",
	"dubai": "DXB", "doha": "DOH", "abu dhabi": "AUH", "cairo": "CAI",
	"johannesburg": "JNB", "cape town": "CPT", "nairobi": "NBO",
	"cancun": "CUN", "mexico city": "MEX", "havana": "HAV",
	"sydney": "SYD", "melbourne": "MEL", "auckland": "AKL",
}

// airportCodeRe matches 3-letter IATA airport codes.
var airportCodeRe = regexp.MustCompile(`\b([A-Z]{3})\b`)

// knownAirports is the set of all airport codes we recognize.
var knownAirports = func() map[string]bool {
	m := map[string]bool{}
	for _, code := range cityToAirport {
		m[code] = true
	}
	// Add all from the zone maps
	for code := range northAmericaAirports {
		m[code] = true
	}
	for code := range europeAirports {
		m[code] = true
	}
	for code := range asiaAirports {
		m[code] = true
	}
	for code := range middleEastAfricaAirports {
		m[code] = true
	}
	return m
}()

// parseTravelQuery extracts flight search parameters from a natural language message.
// Returns nil if not enough info is found (need at least origin + destination).
func parseTravelQuery(msg string) *model.AwardSearchRequest {
	lower := strings.ToLower(msg)
	upper := strings.ToUpper(msg)

	// ── Extract airport codes ────────────────────────────────────────────
	var codes []string
	for _, match := range airportCodeRe.FindAllString(upper, -1) {
		if knownAirports[match] {
			codes = append(codes, match)
		}
	}

	// ── Extract city names → airport codes ───────────────────────────────
	// Sort cities by name length (longest first) to avoid partial matches
	type cityEntry struct {
		name string
		code string
	}
	var cities []cityEntry
	for name, code := range cityToAirport {
		cities = append(cities, cityEntry{name, code})
	}
	sort.Slice(cities, func(i, j int) bool {
		return len(cities[i].name) > len(cities[j].name)
	})

	usedCities := map[string]bool{}
	for _, ce := range cities {
		if strings.Contains(lower, ce.name) && !usedCities[ce.code] {
			// Don't add if already found as explicit airport code
			alreadyHave := false
			for _, c := range codes {
				if c == ce.code {
					alreadyHave = true
					break
				}
			}
			if !alreadyHave {
				codes = append(codes, ce.code)
				usedCities[ce.code] = true
			}
		}
	}

	if len(codes) < 2 {
		return nil // Need at least origin and destination
	}

	origin := codes[0]
	dest := codes[1]

	// If first code is not a Canadian airport, try to find one for origin
	canadianCodes := map[string]bool{
		"YYZ": true, "YVR": true, "YUL": true, "YOW": true, "YYC": true,
		"YEG": true, "YWG": true, "YHZ": true, "YQB": true, "YYJ": true,
	}
	if !canadianCodes[origin] {
		// Try to find a Canadian airport in the codes
		for _, c := range codes {
			if canadianCodes[c] {
				origin = c
				// Use a non-Canadian code as dest
				for _, c2 := range codes {
					if c2 != origin {
						dest = c2
						break
					}
				}
				break
			}
		}
	}

	// ── Extract date ─────────────────────────────────────────────────────
	date := extractDate(lower)

	// ── Extract cabin class ──────────────────────────────────────────────
	cabin := "economy"
	if strings.Contains(lower, "business") {
		cabin = "business"
	} else if strings.Contains(lower, "first class") || strings.Contains(lower, "first-class") {
		cabin = "first"
	} else if strings.Contains(lower, "premium economy") || strings.Contains(lower, "premium") {
		cabin = "premium_economy"
	}

	return &model.AwardSearchRequest{
		Origin:      origin,
		Destination: dest,
		Date:        date,
		Cabin:       cabin,
		Passengers:  1,
	}
}

// extractDate tries to parse a date from a natural language string.
// Falls back to 30 days from now if no date is found.
func extractDate(msg string) string {
	now := time.Now()

	// Try ISO format: 2026-06-15
	isoRe := regexp.MustCompile(`\b(\d{4}-\d{2}-\d{2})\b`)
	if m := isoRe.FindString(msg); m != "" {
		if t, err := time.Parse("2006-01-02", m); err == nil && t.After(now) {
			return m
		}
	}

	// Try "Month Day" format: "June 15", "July 4th", "March 2026"
	months := map[string]time.Month{
		"january": time.January, "february": time.February, "march": time.March,
		"april": time.April, "may": time.May, "june": time.June,
		"july": time.July, "august": time.August, "september": time.September,
		"october": time.October, "november": time.November, "december": time.December,
		"jan": time.January, "feb": time.February, "mar": time.March,
		"apr": time.April, "jun": time.June, "jul": time.July,
		"aug": time.August, "sep": time.September, "oct": time.October,
		"nov": time.November, "dec": time.December,
	}

	monthDayRe := regexp.MustCompile(`(?i)\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b`)
	if m := monthDayRe.FindStringSubmatch(msg); len(m) > 2 {
		monthName := strings.ToLower(m[1])
		day := m[2]
		if mo, ok := months[monthName]; ok {
			year := now.Year()
			d, _ := time.Parse("2006-1-2", fmt.Sprintf("%d-%d-%s", year, mo, day))
			if d.Before(now) {
				d = d.AddDate(1, 0, 0) // next year
			}
			return d.Format("2006-01-02")
		}
	}

	// Try "in Month" format: "in July", "in December"
	inMonthRe := regexp.MustCompile(`(?i)\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b`)
	if m := inMonthRe.FindStringSubmatch(msg); len(m) > 1 {
		monthName := strings.ToLower(m[1])
		if mo, ok := months[monthName]; ok {
			year := now.Year()
			d := time.Date(year, mo, 15, 0, 0, 0, 0, time.UTC)
			if d.Before(now) {
				d = d.AddDate(1, 0, 0)
			}
			return d.Format("2006-01-02")
		}
	}

	// Try relative: "next month", "next week"
	if strings.Contains(msg, "next month") {
		return now.AddDate(0, 1, 0).Format("2006-01-02")
	}
	if strings.Contains(msg, "next week") {
		return now.AddDate(0, 0, 7).Format("2006-01-02")
	}
	if strings.Contains(msg, "tomorrow") {
		return now.AddDate(0, 0, 1).Format("2006-01-02")
	}

	// Default: 30 days out
	return now.AddDate(0, 0, 30).Format("2006-01-02")
}

// titleCabin upper-cases the first letter of a cabin label without panicking
// on an empty string — `req.Cabin[:1]` panics when Cabin == "".
func titleCabin(c string) string {
	if c == "" {
		return ""
	}
	return strings.ToUpper(c[:1]) + c[1:]
}

// formatAwardResultsForPrompt converts award search results into a structured
// markdown table that the AI can reference in its response.
func formatAwardResultsForPrompt(results []model.AwardSearchResult, req *model.AwardSearchRequest) string {
	var sb strings.Builder

	fmt.Fprintf(&sb, "\n## 🔍 STRUCTURED AWARD SEARCH RESULTS: %s → %s, %s, %s\n",
		strings.ToUpper(req.Origin), strings.ToUpper(req.Destination),
		titleCabin(req.Cabin), req.Date)
	sb.WriteString("These results are from our award search engine — quote exact numbers.\n\n")

	sb.WriteString("| Program | Points Cost | Cash Price (CAD) | CPP (¢/pt) | Value | Source | Booking |\n")
	sb.WriteString("|---------|------------|------------------|-----------|-------|--------|--------|\n")

	for _, r := range results {
		affordStr := "❌"
		if r.CanAfford {
			affordStr = "✅"
		}
		fmt.Fprintf(&sb, "| %s | %s pts %s | $%.0f | %.1f¢ | %s | %s | [Book](%s) |\n",
			r.ProgramName,
			formatPoints(int64(r.PointsCost)),
			affordStr,
			r.CashPriceCAD,
			r.CPP,
			r.ValueRating,
			r.Source,
			r.BookingURL,
		)
	}

	// Add wallet summary
	hasWalletData := false
	for _, r := range results {
		if r.PointsAvailable > 0 {
			hasWalletData = true
			break
		}
	}
	if hasWalletData {
		sb.WriteString("\n**Your wallet vs. requirements:**\n")
		for _, r := range results {
			if r.PointsAvailable <= 0 {
				continue
			}
			status := "✅ Can afford"
			if !r.CanAfford {
				shortfall := int64(r.PointsCost) - r.PointsAvailable
				status = fmt.Sprintf("❌ Short %s pts", formatPoints(shortfall))
			}
			fmt.Fprintf(&sb, "- %s: have %s, need %s — %s\n",
				r.ProgramName,
				formatPoints(r.PointsAvailable),
				formatPoints(int64(r.PointsCost)),
				status,
			)
		}
	}

	sb.WriteString("\n")
	return sb.String()
}

// formatSerpFlightsForPrompt converts raw SerpAPI flight results into a structured
// table the AI can quote directly — actual airline names, prices, durations.
func formatSerpFlightsForPrompt(flights []FlightResult, req *model.AwardSearchRequest) string {
	var sb strings.Builder

	cabinLabel := titleCabin(req.Cabin)

	fmt.Fprintf(&sb, "\n## ✈️ LIVE FLIGHT PRICES (Google Flights): %s → %s, %s class, %s\n",
		strings.ToUpper(req.Origin), strings.ToUpper(req.Destination),
		cabinLabel, req.Date)
	sb.WriteString("**These are REAL cash prices in CAD from Google Flights — quote these exact numbers.**\n\n")

	sb.WriteString("| Airline | Price (CAD) | Stops | Duration | Flight |\n")
	sb.WriteString("|---------|------------|-------|----------|--------|\n")

	for _, f := range flights {
		stopsStr := "Nonstop"
		if f.Stops == 1 {
			stopsStr = "1 stop"
		} else if f.Stops > 1 {
			stopsStr = fmt.Sprintf("%d stops", f.Stops)
		}
		durationStr := fmt.Sprintf("%dh %dm", f.TotalDuration/60, f.TotalDuration%60)
		fmt.Fprintf(&sb, "| %s | **$%.0f** | %s | %s | %s |\n",
			f.Airline, f.Price, stopsStr, durationStr, f.FlightNumber)
	}

	fmt.Fprintf(&sb, "\n**Cheapest cash option: $%.0f CAD** (%s)\n", flights[0].Price, flights[0].Airline)
	sb.WriteString("Use these cash prices to calculate CPP: (cash_price / points_cost) × 100\n\n")

	return sb.String()
}

// buildTargetedTravelQuery constructs a specific Tavily search query from parsed route data
// instead of passing the raw user message (which returns generic blog posts).
func buildTargetedTravelQuery(req *model.AwardSearchRequest) string {
	cabinLabel := req.Cabin
	if cabinLabel == "economy" {
		cabinLabel = ""
	} else {
		cabinLabel = " " + cabinLabel + " class"
	}

	// Extract month/year from date for seasonal context
	dateContext := ""
	if t, err := time.Parse("2006-01-02", req.Date); err == nil {
		dateContext = t.Format("January 2006")
	}

	// Build specific query that targets pricing data, not blog posts
	return fmt.Sprintf("%s to %s%s one way flight price CAD %s award availability points redemption",
		req.Origin, req.Destination, cabinLabel, dateContext)
}

// maxLLMHistoryMessages bounds how much prior conversation we replay to the
// model. 12 = 6 user/assistant turns — ample context, but a hard ceiling so
// a client that submits a 500-message history can't run our Anthropic bill
// to zero in one request. Must be applied BEFORE the API call (the post-call
// 20-msg trim only bounds what we store, not what we send/pay for).
const maxLLMHistoryMessages = 12

// maxLLMMessageChars clamps any single replayed message. A user can paste a
// novel; we don't pay to re-send it every turn. ~8000 chars ≈ 2k tokens.
const maxLLMMessageChars = 8000

// CapHistoryForLLM returns at most the last maxLLMHistoryMessages messages,
// each truncated to maxLLMMessageChars. Pure function — callers apply it to
// req.History before constructing the API payload.
func CapHistoryForLLM(history []model.ChatMessage) []model.ChatMessage {
	if len(history) > maxLLMHistoryMessages {
		history = history[len(history)-maxLLMHistoryMessages:]
	}
	out := make([]model.ChatMessage, len(history))
	for i, h := range history {
		if len(h.Content) > maxLLMMessageChars {
			h.Content = h.Content[:maxLLMMessageChars] + "…[truncated]"
		}
		out[i] = h
	}
	return out
}

func (s *AIService) buildMessages(history []model.ChatMessage, newMessage string) []claudeMessage {
	var msgs []claudeMessage

	for _, h := range history {
		msgs = append(msgs, claudeMessage{
			Role:    h.Role,
			Content: h.Content,
		})
	}

	msgs = append(msgs, claudeMessage{
		Role:    "user",
		Content: newMessage,
	})

	return msgs
}

// ── Claude API types ────────────────────────────────────────────────────────

type claudeMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type claudeRequest struct {
	Model     string          `json:"model"`
	MaxTokens int             `json:"max_tokens"`
	System    string          `json:"system"`
	Messages  []claudeMessage `json:"messages"`
}

type claudeResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	StopReason string `json:"stop_reason"`
	Error      *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

func (s *AIService) callClaude(ctx context.Context, systemPrompt string, messages []claudeMessage) (string, error) {
	reqBody := claudeRequest{
		Model:     s.modelID,
		MaxTokens: 4096,
		System:    systemPrompt,
		Messages:  messages,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", s.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("API call failed: %w", err)
	}
	defer resp.Body.Close() //nolint:errcheck // close on read-only response body

	respBody, err := readCappedBody(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("claude API error (HTTP %d): %s", resp.StatusCode, string(respBody))
	}

	var claudeResp claudeResponse
	if err := json.Unmarshal(respBody, &claudeResp); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}

	if claudeResp.Error != nil {
		return "", fmt.Errorf("claude error: %s", claudeResp.Error.Message)
	}

	// Extract text from response
	var textParts []string
	for _, block := range claudeResp.Content {
		if block.Type == "text" {
			textParts = append(textParts, block.Text)
		}
	}

	if len(textParts) == 0 {
		return "", fmt.Errorf("no text in Claude response")
	}

	return strings.Join(textParts, "\n"), nil
}
