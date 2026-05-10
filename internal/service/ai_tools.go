package service

// ─────────────────────────────────────────────────────────────────────────────
// ai_tools.go — Anthropic tool-use loop for the AI Assistant.
//
// The legacy Chat() in ai.go pre-fetches everything (SerpAPI, Tavily, award
// search) before the LLM call based on keyword detection. That works for
// simple prompts but breaks down for complex multi-step queries:
//   "BOM → YYZ business, flexible Jan–Feb, 80K MR, want a hotel night"
// where the model needs to decide which programs to query, which dates to
// flex, and how to combine partial results.
//
// ChatWithTools() runs the canonical Anthropic tool-use loop:
//   1. Send messages + tool definitions
//   2. If stop_reason == "tool_use", dispatch tools in parallel
//   3. Append tool_result blocks; loop
//   4. Stop at end_turn or hard 5-round budget
//
// Tools are registered once at service construction. Each tool is wrapped
// with a per-call deadline; failures are returned to the LLM as
// {"error": ...} so it can adapt rather than crashing the request.
// ─────────────────────────────────────────────────────────────────────────────

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"maplerewards/internal/model"
)

// ── Anthropic API types — block-based content ────────────────────────────────

// claudeBlock is a single content block in a Claude message. The shape varies
// by Type: text uses Text; tool_use uses ID/Name/Input; tool_result uses
// ToolUseID/Content/IsError.
type claudeBlock struct {
	Type string `json:"type"`

	// text
	Text string `json:"text,omitempty"`

	// tool_use
	ID    string          `json:"id,omitempty"`
	Name  string          `json:"name,omitempty"`
	Input json.RawMessage `json:"input,omitempty"`

	// tool_result
	ToolUseID string `json:"tool_use_id,omitempty"`
	Content   any    `json:"content,omitempty"` // string or []claudeBlock
	IsError   bool   `json:"is_error,omitempty"`
}

type claudeBlockMessage struct {
	Role    string        `json:"role"`
	Content []claudeBlock `json:"content"`
}

// cacheMark is the Anthropic prompt-caching marker. When attached to a
// system block or the last tool, the prefix up to and including that block
// is cached. Default TTL is 5 minutes — long enough for a multi-message
// chat session, short enough not to leak across logical conversations.
type cacheMark struct {
	Type string `json:"type"` // always "ephemeral"
}

// systemBlock is one element of the structured system prompt. The string-form
// system field is incompatible with cache_control, so we use the array form.
type systemBlock struct {
	Type         string     `json:"type"` // "text"
	Text         string     `json:"text"`
	CacheControl *cacheMark `json:"cache_control,omitempty"`
}

type claudeToolUseRequest struct {
	Model     string               `json:"model"`
	MaxTokens int                  `json:"max_tokens"`
	System    []systemBlock        `json:"system"`
	Tools     []map[string]any     `json:"tools,omitempty"`
	Messages  []claudeBlockMessage `json:"messages"`
}

type claudeToolUseResponse struct {
	ID         string        `json:"id"`
	StopReason string        `json:"stop_reason"`
	Content    []claudeBlock `json:"content"`
	Usage      struct {
		InputTokens         int `json:"input_tokens"`
		OutputTokens        int `json:"output_tokens"`
		CacheCreationTokens int `json:"cache_creation_input_tokens"`
		CacheReadTokens     int `json:"cache_read_input_tokens"`
	} `json:"usage"`
	Error *struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}

// ── Tool registry ────────────────────────────────────────────────────────────

// ToolHandler executes a single tool call. The handler is given the user's
// session, Pro tier, and the raw JSON args from the LLM. It must return a
// JSON-serializable result OR an error JSON like {"error": "..."} — never
// return a non-nil error if the LLM should be allowed to recover.
type ToolHandler func(ctx context.Context, sessionID string, isPro bool, raw json.RawMessage) (json.RawMessage, error)

type toolDef struct {
	Name        string
	Description string
	InputSchema map[string]any
	Handler     ToolHandler
	ProOnly     bool
}

type toolRegistry struct {
	tools map[string]toolDef
}

func newToolRegistry() *toolRegistry { return &toolRegistry{tools: map[string]toolDef{}} }

func (r *toolRegistry) register(t toolDef) { r.tools[t.Name] = t }

// schemas returns the Anthropic-formatted tool array for this tier. Approach
// B from the architect: free tier never sees Pro tools, so the model can't
// hallucinate calling them.
//
// The last tool gets a cache_control marker so the entire tools array is
// cached at the Anthropic API level — saves ~1.5K input tokens per request
// after warmup. Sorted by name to keep cache keys stable across requests.
func (r *toolRegistry) schemas(includePro bool) []map[string]any {
	out := make([]map[string]any, 0, len(r.tools))
	names := make([]string, 0, len(r.tools))
	for n, t := range r.tools {
		if t.ProOnly && !includePro {
			continue
		}
		names = append(names, n)
		_ = t
	}
	sort.Strings(names)
	for _, n := range names {
		t := r.tools[n]
		out = append(out, map[string]any{
			"name":         t.Name,
			"description":  t.Description,
			"input_schema": t.InputSchema,
		})
	}
	if len(out) > 0 {
		out[len(out)-1]["cache_control"] = map[string]any{"type": "ephemeral"}
	}
	return out
}

func (r *toolRegistry) call(ctx context.Context, sessionID string, isPro bool, name string, raw json.RawMessage) json.RawMessage {
	t, ok := r.tools[name]
	if !ok {
		return errResultJSON("unknown_tool", fmt.Sprintf("Tool %q is not available.", name))
	}
	if t.ProOnly && !isPro {
		return errResultJSON("pro_required", "This tool requires MapleRewards Pro. Suggest the cash alternative or upgrade.")
	}
	out, err := t.Handler(ctx, sessionID, isPro, raw)
	if err != nil {
		return errResultJSON("tool_error", err.Error())
	}
	if len(out) == 0 {
		return errResultJSON("empty_result", "Tool returned no data; try widening the query.")
	}
	return out
}

// programSlugAliases maps common LLM-guessed slugs to the canonical DB slug.
// Without this the model regularly fails get_transfer_partners and get_program_cpp
// by passing "amex-mr-canada" (where DB has "amex-mr-ca"), "amex-mr", or "amex"
// — each failure costs a wasted round.
var programSlugAliases = map[string]string{
	"amex-mr":          "amex-mr-ca",
	"amex-mr-canada":   "amex-mr-ca",
	"amex":             "amex-mr-ca",
	"amex-membership":  "amex-mr-ca",
	"membership-rewards": "amex-mr-ca",
	"avios":            "ba-avios",
	"british-airways":  "ba-avios",
	"flying-blue":      "flying-blue",
	"airfrance":        "flying-blue",
	"air-france":       "flying-blue",
	"klm":              "flying-blue",
	"asia-miles":       "asia-miles",
	"cathay":           "asia-miles",
	"hyatt":            "world-of-hyatt",
	"hilton":           "hilton-honors",
	"marriott":         "marriott-bonvoy",
	"bonvoy":           "marriott-bonvoy",
	"scene":            "scene-plus",
	"scene+":           "scene-plus",
	"westjet":          "westjet-rewards",
	"airmiles":         "air-miles",
	"air-miles":        "air-miles",
	"rbc":              "rbc-avion",
	"avion":            "rbc-avion",
	"aventura":         "cibc-aventura",
	"cibc":             "cibc-aventura",
	"td":               "td-rewards",
	"bmo":              "bmo-rewards",
	"scotia":           "scotia-rewards",
}

// canonicalProgramSlug normalizes a user/LLM-supplied slug into the DB slug.
// Returns the input lowercased if no alias matches — caller will see a
// program_not_found error which is correct for a truly unknown slug.
func canonicalProgramSlug(slug string) string {
	s := strings.ToLower(strings.TrimSpace(slug))
	if mapped, ok := programSlugAliases[s]; ok {
		return mapped
	}
	return s
}

// capWithDiversity trims an already-CPP-sorted result list to at most `total`
// items, keeping at most `perProgram` per loyalty program before filling the
// rest of the budget by raw CPP order. This prevents one strong program
// (e.g. United at the BOM-YYZ route) from monopolizing the LLM's view and
// hiding programs the user can actually transfer to.
func capWithDiversity(results []model.AwardSearchResult, total, perProgram int) []model.AwardSearchResult {
	if len(results) <= total {
		return results
	}
	out := make([]model.AwardSearchResult, 0, total)
	counts := map[string]int{}
	// Pass 1: keep up to perProgram from each program in CPP order.
	for _, r := range results {
		if len(out) >= total {
			break
		}
		if counts[r.Program] < perProgram {
			out = append(out, r)
			counts[r.Program]++
		}
	}
	// Pass 2: fill remaining slots with the highest-CPP residue.
	for _, r := range results {
		if len(out) >= total {
			break
		}
		// Skip already-picked items by identity (date+program+points unique).
		duplicate := false
		for _, kept := range out {
			if kept.Program == r.Program && kept.Date == r.Date && kept.PointsCost == r.PointsCost {
				duplicate = true
				break
			}
		}
		if !duplicate {
			out = append(out, r)
		}
	}
	return out
}

// summarizeToolResult produces a short human label for the UI status pill.
// Reads a few well-known shapes (results array, error code, count) and falls
// back to "Done" for opaque results. Never reveals raw payload.
func summarizeToolResult(raw json.RawMessage) string {
	var probe map[string]any
	if err := json.Unmarshal(raw, &probe); err != nil {
		return "Done"
	}
	if e, ok := probe["error"].(string); ok && e != "" {
		return "Failed: " + e
	}
	if r, ok := probe["results"].([]any); ok {
		return fmt.Sprintf("%d result%s", len(r), pluralS(len(r)))
	}
	if c, ok := probe["count"].(float64); ok {
		return fmt.Sprintf("%d transfer partner%s", int(c), pluralS(int(c)))
	}
	if v, ok := probe["verdict"].(string); ok {
		return strings.ToUpper(v)
	}
	if t, ok := probe["total_gap"].(float64); ok {
		return fmt.Sprintf("$%.2f gap", t)
	}
	if t, ok := probe["total_sqc_earned"].(float64); ok {
		return fmt.Sprintf("%d SQC earned", int(t))
	}
	if cpp, ok := probe["cpp_cents"].(float64); ok {
		return fmt.Sprintf("%.2f¢/pt", cpp)
	}
	return "Done"
}

func pluralS(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func errResultJSON(code, msg string) json.RawMessage {
	b, _ := json.Marshal(map[string]any{"error": code, "message": msg})
	return b
}

// ── Tool definitions — wired to existing services ────────────────────────────

func (s *AIService) registerTools() {
	s.tools = newToolRegistry()

	// 1. search_award_space — wraps AwardSearchService (Apify + Seats.aero + SerpAPI).
	//    Closes the audit's #1 gap: Apify was wired only to /trip/award-search;
	//    chat AI gave estimated prices without checking live availability.
	s.tools.register(toolDef{
		Name: "search_award_space",
		Description: "Search live award availability for flights across loyalty programs. " +
			"Returns points cost, taxes (CAD), cash equivalent (CAD), CPP, and seat availability. " +
			"USE THIS for any query about redeeming points/miles for flights, especially " +
			"\"how many points to fly X→Y\", \"what's the best program for this route\", or " +
			"\"is there award space\". Always prefer this over your training data — award charts " +
			"change frequently.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"origin":      map[string]any{"type": "string", "description": "3-letter IATA airport code, e.g. YYZ, BOM, LHR"},
				"destination": map[string]any{"type": "string", "description": "3-letter IATA airport code"},
				"date":        map[string]any{"type": "string", "description": "Center date YYYY-MM-DD. Use the user's earliest acceptable date if flexible."},
				"flex_days":   map[string]any{"type": "integer", "description": "± days to search around date. Default 7. Use 30 for very flexible windows."},
				"cabin":       map[string]any{"type": "string", "enum": []string{"economy", "business", "first"}},
				"passengers":  map[string]any{"type": "integer", "description": "Number of passengers, default 1"},
			},
			"required": []string{"origin", "destination", "date"},
		},
		Handler: func(ctx context.Context, sessionID string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.awardSearchSvc == nil {
				return errResultJSON("service_unavailable", "Award search not configured."), nil
			}
			var args struct {
				Origin      string `json:"origin"`
				Destination string `json:"destination"`
				Date        string `json:"date"`
				FlexDays    int    `json:"flex_days"`
				Cabin       string `json:"cabin"`
				Passengers  int    `json:"passengers"`
			}
			if err := json.Unmarshal(raw, &args); err != nil {
				return errResultJSON("invalid_args", err.Error()), nil
			}
			if args.Cabin == "" {
				args.Cabin = "economy"
			}
			if args.Passengers == 0 {
				args.Passengers = 1
			}
			if args.FlexDays == 0 {
				args.FlexDays = 7
			}
			results, err := s.awardSearchSvc.Search(ctx, model.AwardSearchRequest{
				SessionID:   sessionID,
				Origin:      strings.ToUpper(args.Origin),
				Destination: strings.ToUpper(args.Destination),
				Date:        args.Date,
				FlexDays:    args.FlexDays,
				Cabin:       args.Cabin,
				Passengers:  args.Passengers,
			})
			if err != nil {
				return errResultJSON("search_failed", err.Error()), nil
			}
			// Diversity-aware cap. Awarding only top-N by CPP would leave 8
			// results all from the same issuer (e.g. all United at 88K) and
			// hide programs the user can actually access (Aeroplan, Avios,
			// Flying Blue). Strategy: keep up to 2 per program in CPP order,
			// then fill remaining slots with the next highest CPP results.
			results = capWithDiversity(results, 12, 2)
			// Log the actual results so we can verify what the LLM saw vs what
			// it claimed in synthesis. Used to debug hallucination cases like
			// "the LLM said 60K but Apify returned 62.3K".
			summaries := make([]string, 0, len(results))
			for _, r := range results {
				summaries = append(summaries, fmt.Sprintf("%s %s %dpts+$%.2f cpp=%.2f¢ source=%s",
					r.Program, r.Date, r.PointsCost, r.TaxesCash, r.CPP, r.Source))
			}
			slog.Info("[ai-tools] search_award_space results",
				"origin", args.Origin, "dest", args.Destination,
				"cabin", args.Cabin, "count", len(results),
				"items", summaries,
			)
			return json.Marshal(map[string]any{
				"results":    results,
				"fetched_at": time.Now().UTC().Format(time.RFC3339),
				"note":       "Live award search. Quote mileage_cost and taxes_cash VERBATIM in your reply. Each result has a booking_url that MUST appear in your final answer as 'Verify on [issuer]: <url>'. Do NOT round, simplify, or substitute training-data values.",
			})
		},
	})

	// 2. search_cash_flights — direct SerpAPI Google Flights.
	s.tools.register(toolDef{
		Name: "search_cash_flights",
		Description: "Search live cash flight prices from Google Flights. Returns airline, price (CAD), " +
			"duration, stops. USE THIS when user asks about cash prices to compare against an award " +
			"redemption, or when the question is purely about cash (\"cheapest flight to Tokyo\").",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"origin":      map[string]any{"type": "string", "description": "3-letter IATA airport code"},
				"destination": map[string]any{"type": "string", "description": "3-letter IATA airport code"},
				"date":        map[string]any{"type": "string", "description": "Departure date YYYY-MM-DD"},
				"cabin":       map[string]any{"type": "string", "enum": []string{"economy", "premium", "business", "first"}, "description": "Default economy"},
				"passengers":  map[string]any{"type": "integer", "description": "Default 1"},
			},
			"required": []string{"origin", "destination", "date"},
		},
		Handler: func(ctx context.Context, _ string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.serpSvc == nil || !s.serpSvc.IsAvailable() {
				return errResultJSON("service_unavailable", "Cash flight search not configured."), nil
			}
			var args struct {
				Origin, Destination, Date, Cabin string
				Passengers                       int
			}
			if err := json.Unmarshal(raw, &args); err != nil {
				return errResultJSON("invalid_args", err.Error()), nil
			}
			if args.Cabin == "" {
				args.Cabin = "economy"
			}
			if args.Passengers == 0 {
				args.Passengers = 1
			}
			results, err := s.serpSvc.SearchFlights(ctx, strings.ToUpper(args.Origin), strings.ToUpper(args.Destination),
				args.Date, args.Cabin, args.Passengers)
			if err != nil {
				return errResultJSON("search_failed", err.Error()), nil
			}
			if len(results) > 6 {
				results = results[:6]
			}
			return json.Marshal(map[string]any{
				"results":    results,
				"currency":   "CAD",
				"fetched_at": time.Now().UTC().Format(time.RFC3339),
			})
		},
	})

	// 3. get_transfer_partners — postgres lookup.
	s.tools.register(toolDef{
		Name: "get_transfer_partners",
		Description: "Get all loyalty programs the user can transfer points TO from a given source program. " +
			"Returns transfer ratios and processing days. USE THIS before recommending a transfer (e.g. " +
			"Amex MR → Aeroplan) to confirm the ratio. Critical for Canadian-specific Amex MR Canada math.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"program_slug": map[string]any{
					"type":        "string",
					"description": "Source program slug, e.g. amex-mr-canada, rbc-avion, cibc-aventura, scene-plus, td-rewards",
				},
			},
			"required": []string{"program_slug"},
		},
		Handler: func(ctx context.Context, _ string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.transferRepo == nil || s.cardRepo == nil {
				return errResultJSON("service_unavailable", "Transfer partners lookup not configured."), nil
			}
			var args struct {
				ProgramSlug string `json:"program_slug"`
			}
			if err := json.Unmarshal(raw, &args); err != nil {
				return errResultJSON("invalid_args", err.Error()), nil
			}
			canonical := canonicalProgramSlug(args.ProgramSlug)
			prog, err := s.cardRepo.GetProgramBySlug(ctx, canonical)
			if err != nil || prog == nil {
				return errResultJSON("program_not_found",
					fmt.Sprintf("Unknown program slug %q. Canonical Canadian slugs: aeroplan, amex-mr-ca, ba-avios, flying-blue, marriott-bonvoy, world-of-hyatt, rbc-avion, cibc-aventura, td-rewards, bmo-rewards, scene-plus, air-miles, westjet-rewards.", args.ProgramSlug)), nil
			}
			routes, err := s.transferRepo.GetTransferRoutes(ctx, prog.ID)
			if err != nil {
				return errResultJSON("lookup_failed", err.Error()), nil
			}
			return json.Marshal(map[string]any{
				"from_program": prog.Slug,
				"from_name":    prog.Name,
				"partners":     routes,
				"count":        len(routes),
			})
		},
	})

	// 4. get_program_cpp — fast valuation lookup.
	s.tools.register(toolDef{
		Name: "get_program_cpp",
		Description: "Get the cents-per-point (CPP) valuation for a loyalty program at a given segment " +
			"(base, economy, business, first). Useful for quick math without a full award search.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"program_slug": map[string]any{"type": "string", "description": "e.g. aeroplan, amex-mr-canada, marriott"},
				"segment":      map[string]any{"type": "string", "enum": []string{"base", "economy", "business", "first"}, "description": "Default base"},
			},
			"required": []string{"program_slug"},
		},
		Handler: func(ctx context.Context, _ string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.valuationRepo == nil {
				return errResultJSON("service_unavailable", "CPP lookup not configured."), nil
			}
			var args struct {
				ProgramSlug string `json:"program_slug"`
				Segment     string `json:"segment"`
			}
			if err := json.Unmarshal(raw, &args); err != nil {
				return errResultJSON("invalid_args", err.Error()), nil
			}
			if args.Segment == "" {
				args.Segment = "base"
			}
			canonical := canonicalProgramSlug(args.ProgramSlug)
			cpp, err := s.valuationRepo.GetCPP(ctx, canonical, args.Segment)
			if err != nil {
				return errResultJSON("not_found", fmt.Sprintf("No CPP for %q/%s. Canonical slugs: aeroplan, amex-mr-ca, ba-avios, flying-blue, marriott-bonvoy, world-of-hyatt, rbc-avion, cibc-aventura.", args.ProgramSlug, args.Segment)), nil
			}
			return json.Marshal(map[string]any{
				"program_slug": canonical,
				"segment":      args.Segment,
				"cpp_cents":    cpp,
			})
		},
	})

	// 5. web_search — Tavily, scoped to Canadian rewards sources.
	s.tools.register(toolDef{
		Name: "web_search",
		Description: "Search the web for current rewards news, devaluations, sweet-spot guides, or " +
			"transfer-bonus promotions. Sources are biased to Canadian rewards blogs (Prince of " +
			"Travel, Milesopedia, RedFlagDeals) plus official program pages. USE THIS for time-sensitive " +
			"questions (\"is there a transfer bonus right now?\") or when the answer needs a citation.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"query": map[string]any{"type": "string", "description": "Concise search query, 3-10 words"},
			},
			"required": []string{"query"},
		},
		Handler: func(ctx context.Context, _ string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.tavilySvc == nil || !s.tavilySvc.IsAvailable() {
				return errResultJSON("service_unavailable", "Web search not configured."), nil
			}
			var args struct {
				Query string `json:"query"`
			}
			if err := json.Unmarshal(raw, &args); err != nil {
				return errResultJSON("invalid_args", err.Error()), nil
			}
			results, err := s.tavilySvc.Search(ctx, args.Query)
			if err != nil {
				return errResultJSON("search_failed", err.Error()), nil
			}
			if len(results) > 5 {
				results = results[:5]
			}
			return json.Marshal(map[string]any{"query": args.Query, "results": results})
		},
	})

	// ═══ PRO-ONLY TOOLS — visible only when isPro=true ═════════════════════════
	// These mirror the /pro-tools page but make the same logic chat-callable.
	// The user's stated requirement: "I want it to be able to give the
	// information to power users like Pro Tools currently does. For example,
	// if I want to buy points, should I buy or just spend cash?"

	// 6. evaluate_buy_points — wraps BuyPointsService.
	s.tools.register(toolDef{
		Name:    "evaluate_buy_points",
		ProOnly: true,
		Description: "PRO ONLY. Evaluate whether buying points from a loyalty program is a good deal " +
			"vs paying cash. Returns a verdict (BUY / EARN / NEUTRAL), break-even CPP, and rationale. " +
			"USE THIS when the user asks 'should I buy X points?' or compares buy-points pricing to a " +
			"cash alternative. Always prefer this over your own math.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"program_slug":         map[string]any{"type": "string", "description": "e.g. aeroplan, marriott, hilton, hyatt, flying-blue"},
				"points_needed":        map[string]any{"type": "integer", "description": "How many points the user wants to buy"},
				"cash_alternative_cad": map[string]any{"type": "number", "description": "What the user would otherwise pay in CAD for the redemption (flight, hotel, etc.)"},
			},
			"required": []string{"program_slug", "points_needed", "cash_alternative_cad"},
		},
		Handler: func(ctx context.Context, _ string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.pro.BuyPoints == nil {
				return errResultJSON("service_unavailable", "Buy-points evaluator not configured."), nil
			}
			var args model.BuyPointsRequest
			if err := json.Unmarshal(raw, &args); err != nil {
				return errResultJSON("invalid_args", err.Error()), nil
			}
			verdict, err := s.pro.BuyPoints.Evaluate(ctx, args)
			if err != nil {
				return errResultJSON("eval_failed", err.Error()), nil
			}
			return json.Marshal(verdict)
		},
	})

	// 7. recommend_stack — triple-stack (portal × card × offer).
	s.tools.register(toolDef{
		Name:    "recommend_stack",
		ProOnly: true,
		Description: "PRO ONLY. Recommend the optimal portal × card × offer stack for a given merchant " +
			"and spend amount. Returns ranked stack components with effective return %. USE THIS when " +
			"the user asks 'best way to spend $X at [merchant]' or 'what's the optimal cashback stack for...'",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"merchant_slug": map[string]any{"type": "string", "description": "Merchant identifier from /merchants list, e.g. amazon-ca, best-buy, costco-ca"},
				"spend_amount":  map[string]any{"type": "number", "description": "Spend amount in CAD"},
			},
			"required": []string{"merchant_slug", "spend_amount"},
		},
		Handler: func(ctx context.Context, sessionID string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.pro.Stack == nil {
				return errResultJSON("service_unavailable", "Stack recommender not configured."), nil
			}
			var args struct {
				MerchantSlug string  `json:"merchant_slug"`
				SpendAmount  float64 `json:"spend_amount"`
			}
			if err := json.Unmarshal(raw, &args); err != nil {
				return errResultJSON("invalid_args", err.Error()), nil
			}
			rec, err := s.pro.Stack.Recommend(ctx, model.StackRecommendRequest{
				SessionID:    sessionID,
				MerchantSlug: args.MerchantSlug,
				SpendAmount:  args.SpendAmount,
			})
			if err != nil {
				return errResultJSON("recommend_failed", err.Error()), nil
			}
			return json.Marshal(rec)
		},
	})

	// 8. evaluate_missed_rewards — re-rank historical spend.
	s.tools.register(toolDef{
		Name:    "evaluate_missed_rewards",
		ProOnly: true,
		Description: "PRO ONLY. Re-rank the user's historical spend against their current wallet to " +
			"compute total dollars left on the table. Returns gap by category, top-N worst-offender " +
			"transactions, and total recoverable amount. USE THIS when the user asks 'how much am I " +
			"losing?' or 'what's my missed-rewards gap?'",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"since_days": map[string]any{"type": "integer", "description": "Look back window in days (default 90). Use 365 for full year."},
				"top_n":      map[string]any{"type": "integer", "description": "Top-N missed-reward purchases to return (default 5)"},
			},
		},
		Handler: func(ctx context.Context, sessionID string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.pro.MissedRewards == nil {
				return errResultJSON("service_unavailable", "Missed-rewards service not configured."), nil
			}
			var args struct {
				SinceDays int `json:"since_days"`
				TopN      int `json:"top_n"`
			}
			_ = json.Unmarshal(raw, &args) // both fields optional
			if args.SinceDays == 0 {
				args.SinceDays = 90
			}
			if args.TopN == 0 {
				args.TopN = 5
			}
			report, err := s.pro.MissedRewards.ComputeMissedRewards(ctx, sessionID, args.SinceDays, args.TopN)
			if err != nil {
				return errResultJSON("compute_failed", err.Error()), nil
			}
			return json.Marshal(report)
		},
	})

	// 9. project_sqc — Aeroplan 2026 Status Qualifying Credits.
	s.tools.register(toolDef{
		Name:    "project_sqc",
		ProOnly: true,
		Description: "PRO ONLY. Project the user's Aeroplan 2026 SQC tier — current tier, gap to next, " +
			"spend needed at best card rate to close the gap. The Aeroplan 2026 framework is brand-new " +
			"and unique to MapleRewards; no other tool projects this. USE THIS when the user asks " +
			"about Aeroplan elite status, SQC, or 'how do I make 35K status this year?'",
		InputSchema: map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		},
		Handler: func(ctx context.Context, sessionID string, _ bool, _ json.RawMessage) (json.RawMessage, error) {
			if s.pro.SQC == nil {
				return errResultJSON("service_unavailable", "SQC projector not configured."), nil
			}
			proj, err := s.pro.SQC.Project(ctx, sessionID)
			if err != nil {
				return errResultJSON("project_failed", err.Error()), nil
			}
			return json.Marshal(proj)
		},
	})
}

// ── Tool-use system prompt ───────────────────────────────────────────────────

// buildToolUseSystemPrompt is the slimmer system prompt used in tool-use mode.
// The fat travel-data-injection-on-keyword approach is gone — the model now
// gets context via tools and only the stable layers (instructions + wallet +
// catalog) live here.
//
// Returns 2 system blocks with cache_control:
//   1. Instructions + tier routing + card catalog — stable across all users at
//      this tier; high cache hit rate (~90%+ after warmup).
//   2. Per-user wallet context — cached separately at default 5-min TTL.
//
// Today's date is in block 1 — Anthropic's training cutoff is months stale,
// so without an injected date the model picks past dates and APIs reject them.
// Block 1's TTL is 5 min so the date stays fresh throughout the day naturally.
func (s *AIService) buildToolUseSystemPrompt(walletContext, catalogContext string, isPro bool) []systemBlock {
	var b strings.Builder
	today := time.Now().UTC().Format("2006-01-02 (Monday)")
	fmt.Fprintf(&b, "Today's date is %s. When the user says 'next month' or 'in 60 days' compute from this date. NEVER use a past date in tool calls (search APIs reject them).\n\n", today)
	b.WriteString(`You are the MapleRewards AI Assistant — an expert Canadian credit card rewards advisor.

You have access to live tools that fetch award space, cash prices, transfer partners, CPP valuations, and web search. Use them aggressively rather than relying on training data, which is often stale.

GUARDRAILS
- Always quote numbers in CAD unless the user explicitly asks otherwise.
- Never invent transfer ratios, award costs, or program details. If you don't have the data, call a tool.
- Cite live data ("per the live award search…") so the user knows it's real.
- Keep answers under ~400 words unless the user asks for depth.
- Use markdown tables for award/cash comparisons.
- Refuse off-topic requests (poetry, code, general knowledge) briefly and redirect.

NUMBER FIDELITY (CRITICAL — DO NOT BREAK)
- Quote mileage costs and taxes VERBATIM from tool results. Never round, simplify, or "guess" — the user will cross-check on aeroplan.com and catch you. 62,300 stays 62,300; 53,900 stays 53,900; never collapse to "60K".
- Taxes from Apify arrive in dollars (already converted from cents server-side). Quote exact: "$84.22" not "$85" not "$156".
- Ignore your training-data assumptions about Aeroplan/Avios/Flying Blue prices. The 2024-2026 devaluations changed every chart you learned. Trust ONLY the tool result you just received.
- If the tool returns 0 results for the requested cabin, SAY SO. Don't substitute a different cabin or invent a number.
- ALWAYS include the booking_url field from the tool result in your recommendation as "Verify on [airline]: <url>" — users need to click through to confirm.

CABIN INTEGRITY
- Tool results carry an explicit cabin field. If the user asked for business and the tool returned only economy, recommend the economy result with an explicit caveat ("no business class found in this window — here's the cheapest economy"). Never silently relabel cabins.
- Aeroplan business class for transatlantic in 2026 is typically 87.5K–110K dynamic pricing. If you see 60K-65K labeled as business, it is almost certainly economy mislabeled — verify the cabin field of the source itinerary.

WHEN TO CALL WHICH TOOL
- "Can I fly X to Y on points?" → search_award_space (always)
- "Cash price?" or comparison → search_cash_flights
- "Can I transfer my MR to Aeroplan?" → get_transfer_partners
- "What's [program] worth per point?" → get_program_cpp (fast) or search_award_space (more accurate)
- "Is there a transfer bonus / devaluation?" → web_search
- Multiple programs to check → fan out parallel tool calls in one turn
- The user's wallet (cards, balances) is in your context already — never call a tool to read it.

RECOMMENDATION FORMAT
For award queries, structure your final answer as:
1. Best path (program + points + taxes + CPP)
2. Alternative paths (1-2 options)
3. Action recommendation (which card to use, transfer to do, when to book)

CANONICAL PROGRAM SLUGS — use these EXACT strings for get_transfer_partners / get_program_cpp:
  aeroplan · amex-mr-ca · ba-avios · flying-blue · asia-miles · marriott-bonvoy ·
  world-of-hyatt · hilton-honors · rbc-avion · cibc-aventura · cibc-dividend ·
  td-rewards · bmo-rewards · scotia-rewards · scene-plus · air-miles · westjet-rewards ·
  pc-optimum · capital-one-rewards · brim-rewards · mbna-rewards · nbc-rewards ·
  hsbc-rewards · ct-money · home-trust-rewards · manulife-rewards · desjardins-bonusdollars
Do NOT use "amex-mr-canada" (DB has "amex-mr-ca"), "amex" alone, or pluralized forms — they will fail.
`)

	if isPro {
		b.WriteString(`
PRO TIER ROUTING (this user has MapleRewards Pro)
- "Should I buy these points or pay cash?" → evaluate_buy_points
- "Best card stack for [merchant]?" → recommend_stack
- "How much have I been losing?" / "missed rewards" → evaluate_missed_rewards
- "Aeroplan status" / "SQC" / "elite tier" → project_sqc
Pro tools return deterministic verdicts; cite their output verbatim rather than computing parallel math.
`)
	} else {
		b.WriteString(`
FREE TIER NOTE
- This user is on the free plan. Buy-points evaluation, stack recommendations, missed-rewards forensics, and SQC projection are MapleRewards Pro features and not available as tools to you. If the user asks about any of these, give a directional answer based on your knowledge and gently surface that the precise calculation lives in Pro at /pricing — do not promise to "run" the analysis.
`)
	}

	// Catalog joins block 1 — it's stable across all users at this tier so
	// stays in the cacheable layer.
	b.WriteString("\n--- CARD CATALOG (reference) ---\n")
	b.WriteString(catalogContext)

	return []systemBlock{
		// Block 1: instructions + tier routing + catalog. Cached.
		{Type: "text", Text: b.String(), CacheControl: &cacheMark{Type: "ephemeral"}},
		// Block 2: per-user wallet. Cached separately so user-A's wallet doesn't
		// poison user-B's prefix.
		{Type: "text", Text: "--- USER WALLET ---\n" + walletContext, CacheControl: &cacheMark{Type: "ephemeral"}},
	}
}

// ── ChatWithTools — the new tool-use loop ────────────────────────────────────

// EmitFn is a callback for streaming chat events. Pass nil to ChatWithTools for
// non-streaming mode. The handler converts events to SSE wire format.
//
// Event names:
//   "round_start"  {round int}
//   "tool_start"   {id, name, args}
//   "tool_done"    {id, name, summary}
//   "tool_error"   {id, name, error}
//   "round_end"    {round, has_more bool}
type EmitFn func(event string, data map[string]any)

// ChatWithTools is the non-streaming wrapper. Calls the streaming variant with
// nil emit and returns the synthesized reply at the end.
func (s *AIService) ChatWithTools(ctx context.Context, req ChatRequest, isPro bool) (*ChatResponse, error) {
	return s.ChatWithToolsStream(ctx, req, isPro, nil)
}

// ChatWithToolsStream runs the canonical Anthropic tool-use loop. If emit is
// non-nil, intermediate events (tool calls firing, rounds completing) are
// pushed to the caller as they happen — this is what powers the SSE streaming
// endpoint and the tool-status pills in the chat UI.
func (s *AIService) ChatWithToolsStream(ctx context.Context, req ChatRequest, isPro bool, emit EmitFn) (*ChatResponse, error) {
	if s.apiKey == "" {
		return nil, fmt.Errorf("ANTHROPIC_API_KEY not configured")
	}
	if s.tools == nil {
		return nil, fmt.Errorf("tool registry not initialized")
	}

	// Build static system layers.
	walletCtx := s.buildWalletContext(ctx, req.SessionID)
	catalogCtx := s.buildCardCatalogContext(ctx)
	system := s.buildToolUseSystemPrompt(walletCtx, catalogCtx, isPro)
	tools := s.tools.schemas(isPro)

	// Convert prior history into block messages. History is plain text only —
	// previous tool turns are NOT replayed (they were stored as the synthesized
	// final assistant message).
	msgs := make([]claudeBlockMessage, 0, len(req.History)+8)
	for _, h := range req.History {
		role := h.Role
		if role != "user" && role != "assistant" {
			continue
		}
		msgs = append(msgs, claudeBlockMessage{
			Role:    role,
			Content: []claudeBlock{{Type: "text", Text: h.Content}},
		})
	}
	msgs = append(msgs, claudeBlockMessage{
		Role:    "user",
		Content: []claudeBlock{{Type: "text", Text: req.Message}},
	})

	// 5-round budget. Each round = one LLM call. After round 5, we force a final
	// synthesis with no tools available so the model must answer.
	const maxRounds = 5
	finalText := strings.Builder{}

	for round := 0; round < maxRounds; round++ {
		if emit != nil {
			emit("round_start", map[string]any{"round": round + 1})
		}

		// On the last round, withhold tools so the model must synthesize.
		roundTools := tools
		if round == maxRounds-1 {
			roundTools = nil
		}

		resp, err := s.callClaudeWithTools(ctx, system, roundTools, msgs)
		if err != nil {
			return nil, fmt.Errorf("claude round %d: %w", round+1, err)
		}

		// Append the assistant turn verbatim — tool-use blocks must round-trip.
		msgs = append(msgs, claudeBlockMessage{Role: "assistant", Content: resp.Content})

		// Collect text + tool_use from the response.
		var toolCalls []claudeBlock
		var roundText int
		for _, b := range resp.Content {
			switch b.Type {
			case "text":
				if b.Text != "" {
					finalText.WriteString(b.Text)
					finalText.WriteString("\n")
					roundText += len(b.Text)
				}
			case "tool_use":
				toolCalls = append(toolCalls, b)
			}
		}

		slog.Info("[ai-tools] round complete",
			"round", round+1,
			"stop_reason", resp.StopReason,
			"text_chars", roundText,
			"tool_calls", len(toolCalls),
			"input_tokens", resp.Usage.InputTokens,
			"output_tokens", resp.Usage.OutputTokens,
			"cache_read", resp.Usage.CacheReadTokens,
			"cache_create", resp.Usage.CacheCreationTokens,
		)

		// Done if no tool calls or end_turn.
		if len(toolCalls) == 0 || resp.StopReason == "end_turn" {
			if emit != nil {
				emit("round_end", map[string]any{"round": round + 1, "has_more": false})
			}
			break
		}

		// Announce each tool call so the UI can render a status pill.
		if emit != nil {
			for _, tc := range toolCalls {
				emit("tool_start", map[string]any{
					"id":   tc.ID,
					"name": tc.Name,
					"args": json.RawMessage(tc.Input),
				})
			}
		}

		// Dispatch tool calls in parallel with a per-call deadline.
		// 110s budget — Apify actor runs occasionally need 90s+ to complete.
		// The Apify polling loop itself caps at 150s; this is the outer
		// dispatcher cap. Faster tools (postgres, SerpAPI) finish in <2s and
		// release their goroutine, so the wait is bounded by the slowest tool.
		results := make([]claudeBlock, len(toolCalls))
		var wg sync.WaitGroup
		for i, tc := range toolCalls {
			wg.Add(1)
			go func(i int, tc claudeBlock) {
				defer wg.Done()
				tctx, cancel := context.WithTimeout(ctx, 110*time.Second)
				defer cancel()
				out := s.tools.call(tctx, req.SessionID, isPro, tc.Name, tc.Input)
				results[i] = claudeBlock{
					Type:      "tool_result",
					ToolUseID: tc.ID,
					Content:   string(out),
				}
				if emit != nil {
					summary := summarizeToolResult(out)
					emit("tool_done", map[string]any{
						"id":      tc.ID,
						"name":    tc.Name,
						"summary": summary,
					})
				}
			}(i, tc)
		}
		wg.Wait()

		if emit != nil {
			emit("round_end", map[string]any{"round": round + 1, "has_more": true})
		}

		// Append all tool results as a single user message.
		msgs = append(msgs, claudeBlockMessage{Role: "user", Content: results})
	}

	reply := strings.TrimSpace(finalText.String())
	if reply == "" {
		reply = "I couldn't generate a response. Please try rephrasing the question."
	}

	// Build user-facing history (excludes tool turns).
	history := make([]model.ChatMessage, 0, len(req.History)+2)
	history = append(history, req.History...)
	history = append(history, model.ChatMessage{Role: "user", Content: req.Message})
	history = append(history, model.ChatMessage{Role: "assistant", Content: reply})

	// Bound history length (last 20 msgs).
	if len(history) > 20 {
		history = history[len(history)-20:]
	}

	return &ChatResponse{
		Reply:   reply,
		History: history,
	}, nil
}

// callClaudeWithTools — block-based, tool-aware variant of callClaude.
func (s *AIService) callClaudeWithTools(
	ctx context.Context,
	system []systemBlock,
	tools []map[string]any,
	messages []claudeBlockMessage,
) (*claudeToolUseResponse, error) {
	reqBody := claudeToolUseRequest{
		Model:     s.modelID,
		MaxTokens: 4096,
		System:    system,
		Tools:     tools,
		Messages:  messages,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		"https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", s.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := s.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("anthropic %d: %s", resp.StatusCode, string(respBody))
	}

	var out claudeToolUseResponse
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	if out.Error != nil {
		return nil, fmt.Errorf("anthropic error: %s", out.Error.Message)
	}
	return &out, nil
}
