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
	"log/slog"
	"net/http"
	"runtime/debug"
	"sort"
	"strings"
	"sync"
	"time"

	"maplerewards/internal/model"
	"maplerewards/internal/quota"
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

// isIATACode reports whether s is a 3-letter (already-uppercased) IATA code.
// Service-local mirror of the handler's isValidIATA (different package) so the
// LLM tool path validates inputs before paid scrapers, same as the HTTP path.
func isIATACode(s string) bool {
	if len(s) != 3 {
		return false
	}
	for _, c := range s {
		if c < 'A' || c > 'Z' {
			return false
		}
	}
	return true
}

// isValidFlightDate accepts a YYYY-MM-DD date within a sane window, so the LLM
// can't burn paid flight-search quota on a malformed or absurd date.
func isValidFlightDate(s string) bool {
	t, err := time.Parse("2006-01-02", strings.TrimSpace(s))
	if err != nil {
		return false
	}
	y := t.Year()
	return y >= 2020 && y <= 2100
}

// mustJSON marshals a tool result, falling back to a JSON error object so a
// handler can never return malformed bytes to the model.
func mustJSON(v any) json.RawMessage {
	b, err := json.Marshal(v)
	if err != nil {
		return json.RawMessage(`{"error":"failed to encode tool result"}`)
	}
	return b
}

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
	"amex-mr":            "amex-mr-ca",
	"amex-mr-canada":     "amex-mr-ca",
	"amex":               "amex-mr-ca",
	"amex-membership":    "amex-mr-ca",
	"membership-rewards": "amex-mr-ca",
	"avios":              "ba-avios",
	"british-airways":    "ba-avios",
	"flying-blue":        "flying-blue",
	"airfrance":          "flying-blue",
	"air-france":         "flying-blue",
	"klm":                "flying-blue",
	"asia-miles":         "asia-miles",
	"cathay":             "asia-miles",
	"hyatt":              "world-of-hyatt",
	"hilton":             "hilton-honors",
	"marriott":           "marriott-bonvoy",
	"bonvoy":             "marriott-bonvoy",
	"scene":              "scene-plus",
	"scene+":             "scene-plus",
	"westjet":            "westjet-rewards",
	"airmiles":           "air-miles",
	"air-miles":          "air-miles",
	"rbc":                "rbc-avion",
	"avion":              "rbc-avion",
	"aventura":           "cibc-aventura",
	"cibc":               "cibc-aventura",
	"td":                 "td-rewards",
	"bmo":                "bmo-rewards",
	"scotia":             "scotia-rewards",
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
			if args.FlexDays == 0 {
				args.FlexDays = 7
			}
			// Validate + clamp before the PAID scrapers. The HTTP handlers do
			// this; the LLM tool path used to forward inputs raw and left
			// flex_days uncapped, so a free user (Seats.aero/SerpAPI fire for
			// non-Pro too) could fan out an unbounded scrape window.
			origin := strings.ToUpper(strings.TrimSpace(args.Origin))
			dest := strings.ToUpper(strings.TrimSpace(args.Destination))
			if !isIATACode(origin) || !isIATACode(dest) {
				return errResultJSON("invalid_args", "origin and destination must be 3-letter IATA airport codes"), nil
			}
			if args.Passengers < 1 {
				args.Passengers = 1
			}
			if args.Passengers > 9 {
				args.Passengers = 9
			}
			if args.FlexDays < 0 {
				args.FlexDays = 0
			}
			if args.FlexDays > 14 {
				args.FlexDays = 14 // matches award_watch cap; bounds the scrape window
			}
			results, err := s.awardSearchSvc.Search(ctx, model.AwardSearchRequest{
				SessionID:   sessionID,
				Origin:      origin,
				Destination: dest,
				Date:        args.Date,
				FlexDays:    args.FlexDays,
				Cabin:       args.Cabin,
				Passengers:  args.Passengers,
				IsPro:       proFromCtx(ctx),
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
				taxStr := "—"
				if r.TaxesCash != nil {
					taxStr = fmt.Sprintf("$%.2f", *r.TaxesCash)
				}
				summaries = append(summaries, fmt.Sprintf("%s %s %dpts+%s cpp=%.2f¢ source=%s",
					r.Program, r.Date, r.PointsCost, taxStr, r.CPP, r.Source))
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
			// Validate LLM-supplied args before the PAID SerpAPI call so garbage
			// codes/dates don't burn the shared quota (mirrors search_award_space).
			origin := strings.ToUpper(strings.TrimSpace(args.Origin))
			dest := strings.ToUpper(strings.TrimSpace(args.Destination))
			if !isIATACode(origin) || !isIATACode(dest) {
				return errResultJSON("invalid_args", "origin and destination must be 3-letter IATA airport codes"), nil
			}
			if !isValidFlightDate(args.Date) {
				return errResultJSON("invalid_args", "date must be a valid future-ish YYYY-MM-DD"), nil
			}
			if args.Passengers < 1 {
				args.Passengers = 1
			}
			if args.Passengers > 9 {
				args.Passengers = 9
			}
			results, err := s.serpSvc.SearchFlights(ctx, origin, dest,
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

	// 5a. get_devaluation_history — local KB lookup.
	// Surfaces the curated devaluation_log from rewards.yaml so the model can
	// ground answers like "did Aeroplan devalue this year" in dated events
	// rather than guessing. Free tool — no Apify / Tavily cost.
	s.tools.register(toolDef{
		Name: "get_devaluation_history",
		Description: "Get the recent devaluation and chart-change history for a loyalty program. " +
			"Returns dated events (chart restructures, dynamic-pricing moves, SQC framework changes) " +
			"sourced from MapleRewards' curated devaluation log. USE THIS when the user asks " +
			"\"did [program] devalue\", \"is the chart still accurate\", or before making any " +
			"specific points-cost claim that depends on chart stability. Optional program filter; " +
			"omit to get the full log.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"program": map[string]any{
					"type":        "string",
					"description": "Optional program slug (e.g. aeroplan, marriott_bonvoy, hilton_honors, air_miles). Omit to return all entries.",
				},
				"limit": map[string]any{
					"type":        "integer",
					"description": "Max entries to return, default 10",
				},
			},
		},
		Handler: func(_ context.Context, _ string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.knowledgeBase == nil {
				return errResultJSON("service_unavailable", "Knowledge base not loaded."), nil
			}
			var args struct {
				Program string `json:"program"`
				Limit   int    `json:"limit"`
			}
			_ = json.Unmarshal(raw, &args) // both optional
			if args.Limit <= 0 {
				args.Limit = 10
			}
			needle := strings.ToLower(strings.TrimSpace(args.Program))
			needleNorm := strings.NewReplacer("-", "", "_", "", " ", "").Replace(needle)
			out := make([]map[string]any, 0, args.Limit)
			for _, d := range s.knowledgeBase.DevaluationLog {
				if needle != "" {
					prog := strings.ToLower(d.Program)
					progNorm := strings.NewReplacer("-", "", "_", "", " ", "").Replace(prog)
					if !strings.Contains(progNorm, needleNorm) && !strings.Contains(needleNorm, progNorm) {
						continue
					}
				}
				out = append(out, map[string]any{
					"date":       d.Date,
					"program":    d.Program,
					"summary":    d.Summary,
					"source_url": d.SourceURL,
				})
				if len(out) >= args.Limit {
					break
				}
			}
			return json.Marshal(map[string]any{
				"results": out,
				"count":   len(out),
				"filter":  args.Program,
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

	// 9. search_hotels — REAL cash hotel availability via SerpAPI Google Hotels.
	// Seats.aero's partner API has no hotel endpoint (verified 404), so there is
	// no points-hotel inventory on that key; this returns live CASH nightly
	// rates. The LLM is told to label them as cash and pair with the user's
	// hotel-program currencies for a points alternative.
	s.tools.register(toolDef{
		Name: "search_hotels",
		Description: "Search REAL hotel availability + nightly cash rates (CAD) for a city via " +
			"Google Hotels. Returns hotel names, per-night price, total, rating, and a booking link. " +
			"These are CASH prices — say so. If the user holds a hotel currency (Marriott Bonvoy / " +
			"World of Hyatt / Hilton Honors), add a rough points-vs-cash note. Always include the " +
			"booking link for the options you recommend.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"city":          map[string]any{"type": "string", "description": "Destination city (e.g. 'Toronto')."},
				"checkin_date":  map[string]any{"type": "string", "description": "YYYY-MM-DD. Defaults to ~30 days out if omitted."},
				"checkout_date": map[string]any{"type": "string", "description": "YYYY-MM-DD. Defaults to checkin + 3 nights."},
				"adults":        map[string]any{"type": "integer", "description": "Guests (default 1)."},
			},
			"required": []string{"city"},
		},
		Handler: func(ctx context.Context, _ string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			var args struct {
				City     string `json:"city"`
				CheckIn  string `json:"checkin_date"`
				CheckOut string `json:"checkout_date"`
				Adults   int    `json:"adults"`
			}
			_ = json.Unmarshal(raw, &args)
			if strings.TrimSpace(args.City) == "" {
				return mustJSON(map[string]any{"error": "city is required"}), nil
			}
			// Sensible date defaults so a bare "hotels in Tokyo" still works.
			if args.CheckIn == "" {
				args.CheckIn = time.Now().AddDate(0, 0, 30).Format("2006-01-02")
			}
			if args.CheckOut == "" {
				if t, err := time.Parse("2006-01-02", args.CheckIn); err == nil {
					args.CheckOut = t.AddDate(0, 0, 3).Format("2006-01-02")
				}
			}
			// Validate LLM-supplied dates + bound guests before the PAID SerpAPI
			// hotel call, so a garbage date can't burn the shared quota.
			if !isValidFlightDate(args.CheckIn) || !isValidFlightDate(args.CheckOut) {
				return mustJSON(map[string]any{"error": "checkin_date and checkout_date must be valid YYYY-MM-DD"}), nil
			}
			if args.Adults < 1 {
				args.Adults = 1
			}
			if args.Adults > 9 {
				args.Adults = 9
			}
			if s.serpSvc == nil || !s.serpSvc.IsAvailable() {
				return mustJSON(map[string]any{
					"status":  "unavailable",
					"message": "Live hotel search isn't configured right now. Suggest the user book direct with their hotel program (Marriott Bonvoy / World of Hyatt / Hilton Honors) or via a cashback portal.",
				}), nil
			}
			hotels, err := s.serpSvc.SearchHotels(ctx, args.City, args.CheckIn, args.CheckOut, args.Adults)
			if err != nil {
				slog.Warn("[search_hotels] failed", "err", err, "city", args.City)
				return mustJSON(map[string]any{
					"status":  "error",
					"message": "Hotel lookup failed for " + args.City + ". Tell the user briefly and suggest booking direct or via a cashback portal.",
				}), nil
			}
			if len(hotels) > 8 {
				hotels = hotels[:8]
			}
			return mustJSON(map[string]any{
				"status":     "ok",
				"city":       args.City,
				"checkin":    args.CheckIn,
				"checkout":   args.CheckOut,
				"currency":   "CAD",
				"price_type": "cash_per_night",
				"note":       "These are live CASH nightly rates from Google Hotels. Quote prices + the booking link verbatim. Not points redemptions.",
				"hotels":     hotels,
			}), nil
		},
	})

	s.tools.register(toolDef{
		Name:    "project_sqc",
		ProOnly: true,
		Description: "PRO ONLY. Project the user's Aeroplan 2026 SQC tier — current tier, gap to next, " +
			"spend needed at best card rate to close the gap. The Aeroplan 2026 framework is brand-new " +
			"and unique to MapleRewards; no other tool projects this. USE THIS when the user asks " +
			"about Aeroplan elite status, SQC, or 'how do I make 35K status this year?'. " +
			"Aeroplan status needs BOTH enough SQC AND a minimum flight-revenue floor per tier — if the " +
			"user mentions flights they've taken or plan to take, pass flight_sqc and flight_spend_cad so " +
			"the projection reports the tier they TRULY qualify for (qualified_tier) and the revenue-floor gap.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"flight_sqc": map[string]any{
					"type":        "integer",
					"description": "Optional. SQC the user has earned (or expects) from flights/partners this year. Default 0.",
				},
				"flight_spend_cad": map[string]any{
					"type":        "number",
					"description": "Optional. Flight revenue in CAD the user has spent (or expects) this year — counts toward the per-tier revenue floor. Default 0.",
				},
			},
			"required": []string{},
		},
		Handler: func(ctx context.Context, sessionID string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.pro.SQC == nil {
				return errResultJSON("service_unavailable", "SQC projector not configured."), nil
			}
			// Optional flight inputs. Absent/invalid ⇒ zero-value struct ⇒
			// legacy card-spend-only projection. Negatives are clamped to 0.
			var args struct {
				FlightSQC      int     `json:"flight_sqc"`
				FlightSpendCAD float64 `json:"flight_spend_cad"`
			}
			if len(raw) > 0 {
				_ = json.Unmarshal(raw, &args)
			}
			if args.FlightSQC < 0 {
				args.FlightSQC = 0
			}
			if args.FlightSpendCAD < 0 {
				args.FlightSpendCAD = 0
			}
			proj, err := s.pro.SQC.Project(ctx, sessionID, SQCFlightInputs{
				FlightSQC:      args.FlightSQC,
				FlightSpendCAD: args.FlightSpendCAD,
			})
			if err != nil {
				return errResultJSON("project_failed", err.Error()), nil
			}
			return json.Marshal(proj)
		},
	})

	// 12. find_card_for_merchant — top wallet card for a category/MCC/merchant.
	// Free-tier OK; uses the wallet when sessionID is present, else falls back
	// to a generic top-card recommendation. This is the single most-asked
	// question on the product ("which card do I use for X?") and the LLM
	// answering it from intuition gets it wrong half the time — give it the
	// optimizer instead.
	s.tools.register(toolDef{
		Name: "find_card_for_merchant",
		Description: "Return the best card in the user's wallet for a given category, MCC, or merchant. " +
			"Uses the same optimizer that powers the /optimizer page so the result is consistent. " +
			"Always prefer this over recommending a card from intuition — Costco network rules, Tangerine " +
			"category caps, and Amex acceptance gaps are all encoded here.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"category_slug": map[string]any{
					"type":        "string",
					"description": "One of: groceries, gas, dining, travel, transit, streaming, recurring-bills, drugstores, online-shopping, everything-else.",
				},
				"mcc_code": map[string]any{
					"type":        "integer",
					"description": "Optional MCC code (e.g. 5411 = grocery). Overrides category_slug if both given.",
				},
				"merchant_slug": map[string]any{
					"type":        "string",
					"description": "Optional merchant slug — triggers network-routing rules (e.g. costco_ca enforces MC-only).",
				},
				"spend_amount": map[string]any{
					"type":        "number",
					"description": "Optional spend in CAD. Default 100. Improves the dollar-value field but doesn't change ranking.",
				},
			},
			"required": []string{},
		},
		Handler: func(ctx context.Context, sessionID string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.optimizerSvc == nil {
				return errResultJSON("service_unavailable", "Optimizer not configured."), nil
			}
			var args struct {
				CategorySlug string  `json:"category_slug"`
				MCCCode      *int    `json:"mcc_code"`
				MerchantSlug string  `json:"merchant_slug"`
				SpendAmount  float64 `json:"spend_amount"`
			}
			if err := json.Unmarshal(raw, &args); err != nil {
				return errResultJSON("invalid_args", err.Error()), nil
			}
			if args.CategorySlug == "" && args.MCCCode == nil && args.MerchantSlug == "" {
				return errResultJSON("missing_args", "Need at least one of category_slug, mcc_code, or merchant_slug."), nil
			}
			if args.SpendAmount <= 0 {
				args.SpendAmount = 100
			}
			recs, err := s.optimizerSvc.GetBestCard(ctx, model.OptimizeRequest{
				SessionID:    sessionID,
				CategorySlug: args.CategorySlug,
				MCCCode:      args.MCCCode,
				Merchant:     args.MerchantSlug,
				SpendAmount:  args.SpendAmount,
			})
			if err != nil {
				return errResultJSON("optimize_failed", err.Error()), nil
			}
			// Cap to top 3 — the LLM doesn't need 20 rows, and a tight payload
			// reduces tokens spent re-emitting card lists in the assistant reply.
			top := recs
			if len(top) > 3 {
				top = top[:3]
			}
			return json.Marshal(map[string]any{
				"top":          top,
				"total_ranked": len(recs),
				"category":     args.CategorySlug,
				"merchant":     args.MerchantSlug,
			})
		},
	})

	// 12b. lookup_card — fetch detail for any card in the catalog by name or
	// issuer fragment. Replaces the full-catalog system-prompt dump that was
	// eating ~5-7K tokens every request. The AI is instructed (in the catalog
	// summary block) to call this rather than guess from memory.
	s.tools.register(toolDef{
		Name: "lookup_card",
		Description: "Look up a Canadian credit card by name or issuer (e.g. 'Cobalt', 'RBC Avion', 'TD Visa'). " +
			"Returns annual fee, welcome bonus, network, loyalty program, and base CPP for up to 5 matching cards. " +
			"Use this whenever the user asks about a specific card you weren't given in the system prompt.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"query": map[string]any{
					"type":        "string",
					"description": "Case-insensitive substring match on card name or issuer. e.g. 'cobalt', 'avion infinite', 'amex'.",
				},
			},
			"required": []string{"query"},
		},
		Handler: func(ctx context.Context, _ string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			var args struct {
				Query string `json:"query"`
			}
			if err := json.Unmarshal(raw, &args); err != nil {
				return errResultJSON("invalid_args", err.Error()), nil
			}
			q := strings.TrimSpace(strings.ToLower(args.Query))
			if q == "" {
				return errResultJSON("missing_args", "query is required"), nil
			}
			all, err := s.cardRepo.ListCards(ctx)
			if err != nil {
				return errResultJSON("lookup_failed", err.Error()), nil
			}
			type hit struct {
				ID             string  `json:"id"`
				Name           string  `json:"name"`
				Issuer         string  `json:"issuer"`
				Network        string  `json:"network"`
				LoyaltyProgram string  `json:"loyalty_program,omitempty"`
				AnnualFee      float64 `json:"annual_fee"`
				WelcomeBonus   int     `json:"welcome_bonus_points"`
				MinSpend       float64 `json:"welcome_bonus_min_spend,omitempty"`
				BaseCPP        float64 `json:"base_cpp,omitempty"`
			}
			results := make([]hit, 0, 5)
			for _, c := range all {
				if !strings.Contains(strings.ToLower(c.Name), q) && !strings.Contains(strings.ToLower(c.Issuer), q) {
					continue
				}
				h := hit{
					ID:           c.ID,
					Name:         c.Name,
					Issuer:       c.Issuer,
					Network:      c.Network,
					AnnualFee:    c.AnnualFee,
					WelcomeBonus: c.WelcomeBonusPoints,
					MinSpend:     c.WelcomeBonusMinSpend,
				}
				if c.LoyaltyProgram != nil {
					h.LoyaltyProgram = c.LoyaltyProgram.Name
					h.BaseCPP = c.LoyaltyProgram.BaseCPP
				}
				results = append(results, h)
				if len(results) >= 5 {
					break
				}
			}
			return json.Marshal(map[string]any{
				"query":         args.Query,
				"matches":       results,
				"total_matches": len(results),
			})
		},
	})

	// 13. simulate_transfer_with_bonus — compute end-state of a hypothetical
	// transfer with an optional active bonus. Free-tier OK because it's pure
	// math + DB lookup; the value is in framing the trade-off (is the bonus
	// worth the friction?) which the LLM does well once it has numbers.
	s.tools.register(toolDef{
		Name: "simulate_transfer_with_bonus",
		Description: "Simulate transferring N points from program A to program B with an optional bonus %. " +
			"Returns transferred points, effective ratio, expected CAD value at the destination's CPP, " +
			"and the CPP boost vs. base. USE THIS to answer 'is this transfer bonus worth it?' or " +
			"'what would my MR be worth in Aeroplan?'.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"from_program": map[string]any{
					"type":        "string",
					"description": "Source program slug, e.g. amex-mr-ca, rbc-avion, cibc-aventura.",
				},
				"to_program": map[string]any{
					"type":        "string",
					"description": "Destination program slug, e.g. aeroplan, ba-avios, flying-blue, marriott-bonvoy.",
				},
				"amount": map[string]any{
					"type":        "integer",
					"description": "Points to transfer from the source program.",
				},
				"bonus_percent": map[string]any{
					"type":        "number",
					"description": "Optional active transfer bonus as a percentage (e.g. 30 for a 30% bonus). Defaults to 0.",
				},
				"segment": map[string]any{
					"type":        "string",
					"enum":        []string{"base", "economy", "business", "first"},
					"description": "Redemption segment to value the destination points at. Default base.",
				},
			},
			"required": []string{"from_program", "to_program", "amount"},
		},
		Handler: func(ctx context.Context, _ string, _ bool, raw json.RawMessage) (json.RawMessage, error) {
			if s.transferRepo == nil || s.cardRepo == nil || s.valuationRepo == nil {
				return errResultJSON("service_unavailable", "Transfer simulation not configured."), nil
			}
			var args struct {
				FromProgram  string  `json:"from_program"`
				ToProgram    string  `json:"to_program"`
				Amount       int     `json:"amount"`
				BonusPercent float64 `json:"bonus_percent"`
				Segment      string  `json:"segment"`
			}
			if err := json.Unmarshal(raw, &args); err != nil {
				return errResultJSON("invalid_args", err.Error()), nil
			}
			if args.Amount <= 0 {
				return errResultJSON("invalid_args", "amount must be > 0"), nil
			}
			// Bound LLM/user-supplied inputs. Without this, a hallucinated
			// bonus_percent (e.g. 100000) projects a six/seven-figure fake CAD
			// valuation, a negative bonus_percent yields negative points, and
			// an unbounded amount can overflow the int conversion below. Real
			// transfer bonuses top out around 100%; no program lets you move
			// tens of millions of points in one transfer.
			if args.Amount > 10_000_000 {
				return errResultJSON("invalid_args", "amount exceeds the 10,000,000-point per-transfer ceiling"), nil
			}
			if args.BonusPercent < 0 {
				return errResultJSON("invalid_args", "bonus_percent cannot be negative"), nil
			}
			if args.BonusPercent > 200 {
				args.BonusPercent = 200 // clamp — no real transfer bonus exceeds ~100%
			}
			if args.Segment == "" {
				args.Segment = "base"
			}
			fromSlug := canonicalProgramSlug(args.FromProgram)
			toSlug := canonicalProgramSlug(args.ToProgram)

			fromProg, err := s.cardRepo.GetProgramBySlug(ctx, fromSlug)
			if err != nil || fromProg == nil {
				return errResultJSON("from_program_not_found", fmt.Sprintf("Unknown source slug %q.", args.FromProgram)), nil
			}
			toProg, err := s.cardRepo.GetProgramBySlug(ctx, toSlug)
			if err != nil || toProg == nil {
				return errResultJSON("to_program_not_found", fmt.Sprintf("Unknown destination slug %q.", args.ToProgram)), nil
			}

			routes, err := s.transferRepo.GetTransferRoutes(ctx, fromProg.ID)
			if err != nil {
				return errResultJSON("routes_lookup_failed", err.Error()), nil
			}
			var ratio float64
			var routeNotes string
			for _, r := range routes {
				if r.ToProgramID == toProg.ID && r.IsActive {
					ratio = r.TransferRatio
					routeNotes = r.Notes
					break
				}
			}
			if ratio <= 0 {
				return errResultJSON("no_route",
					fmt.Sprintf("No active transfer route from %s to %s. Suggest alternatives.", fromSlug, toSlug)), nil
			}

			bonusMultiplier := 1.0 + (args.BonusPercent / 100.0)
			transferredFloat := float64(args.Amount) * ratio * bonusMultiplier
			transferred := int(transferredFloat)

			cpp, _ := s.valuationRepo.GetCPP(ctx, toSlug, args.Segment)
			if cpp <= 0 {
				cpp = toProg.BaseCPP // fallback to program's baseline
			}
			cadValue := float64(transferred) * cpp / 100.0

			// Effective CPP at the source side (so the user sees "your MR is
			// worth 2.7¢/pt after this transfer + bonus").
			effectiveSourceCPP := 0.0
			if args.Amount > 0 {
				effectiveSourceCPP = cadValue / float64(args.Amount) * 100.0
			}

			return json.Marshal(map[string]any{
				"from_program":         fromSlug,
				"to_program":           toSlug,
				"input_points":         args.Amount,
				"base_ratio":           ratio,
				"bonus_percent":        args.BonusPercent,
				"effective_ratio":      ratio * bonusMultiplier,
				"transferred_points":   transferred,
				"destination_segment":  args.Segment,
				"destination_cpp":      cpp,
				"cad_value":            cadValue,
				"effective_source_cpp": effectiveSourceCPP,
				"route_notes":          routeNotes,
			})
		},
	})

	// 14. project_aeroplan_devaluation — June 1 2026 chart hike exposure.
	// Pro-gated because the per-user dollar number is the wedge for the
	// urgency banner; free users only see the aggregate "this devaluation
	// is coming" via /devaluations.
	s.tools.register(toolDef{
		Name:    "project_aeroplan_devaluation",
		ProOnly: true,
		Description: "PRO ONLY. Project the user's dollar exposure to the Aeroplan June 1 2026 long-haul-" +
			"business chart hike. Returns balance, current CPP, value today, value after hike, exposure " +
			"in CAD, days until effective. USE THIS when the user asks about the Aeroplan devaluation, " +
			"says 'should I burn my Aeroplan points now', or any 'June 1' query.",
		InputSchema: map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		},
		Handler: func(ctx context.Context, sessionID string, _ bool, _ json.RawMessage) (json.RawMessage, error) {
			if s.pro.Devaluation == nil {
				return errResultJSON("service_unavailable", "Devaluation projector not configured."), nil
			}
			proj, err := s.pro.Devaluation.ProjectAeroplanJune2026(ctx, sessionID)
			if err != nil {
				return errResultJSON("project_failed", err.Error()), nil
			}
			return json.Marshal(proj)
		},
	})

	// 15. list_my_award_watches — surface existing watches so the agent can
	// suggest related actions ("you're watching YYZ→NRT — your existing
	// watch fired 2 days ago with a 45K business class slot"). Without
	// this the LLM can't tell whether to recommend creating a new watch
	// or referencing an existing one.
	s.tools.register(toolDef{
		Name:    "list_my_award_watches",
		ProOnly: true,
		Description: "PRO ONLY. List the user's active Aeroplan award-availability watches. Returns route, " +
			"cabin, max-points threshold, last-probed price, and last-alert message. USE THIS before " +
			"recommending a new watch to avoid duplicates, or when the user asks 'what am I watching?'.",
		InputSchema: map[string]any{
			"type":       "object",
			"properties": map[string]any{},
		},
		Handler: func(ctx context.Context, sessionID string, _ bool, _ json.RawMessage) (json.RawMessage, error) {
			if s.pro.AwardWatch == nil {
				return errResultJSON("service_unavailable", "Award-watch service not configured."), nil
			}
			watches, err := s.pro.AwardWatch.List(ctx, sessionID)
			if err != nil {
				return errResultJSON("list_failed", err.Error()), nil
			}
			return json.Marshal(map[string]any{
				"watches": watches,
				"count":   len(watches),
			})
		},
	})

	// 16. create_award_watch — let the agent actually ARM a watch the user
	// asked for, not just list existing ones. The cron worker + email/web-push
	// fan-out are already live; this wires the create path into the tool loop
	// so chat becomes agentic instead of read-only. (Best impact/effort in the
	// audit: one tool definition over already-deployed infra.)
	s.tools.register(toolDef{
		Name:    "create_award_watch",
		ProOnly: true,
		Description: "PRO ONLY. Create an Aeroplan award-availability watch for the user. The cron worker then " +
			"polls for award space and alerts them (email + web push) when a seat at or below their max-points " +
			"threshold appears. ALWAYS call list_my_award_watches first to avoid creating a duplicate. depart_date " +
			"MUST be a future YYYY-MM-DD computed from today's date above — never a past date.",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"origin":       map[string]any{"type": "string", "description": "Origin IATA code, e.g. YYZ"},
				"destination":  map[string]any{"type": "string", "description": "Destination IATA code, e.g. NRT"},
				"depart_date":  map[string]any{"type": "string", "description": "Target departure date, YYYY-MM-DD (must be in the future)"},
				"flex_days":    map[string]any{"type": "integer", "description": "± days around depart_date to watch (0-14, default 3)"},
				"cabin":        map[string]any{"type": "string", "enum": []string{"economy", "business", "first"}, "description": "Cabin to watch (default economy)"},
				"max_points":   map[string]any{"type": "integer", "description": "Optional: only alert when the award costs at or below this many points"},
				"program_slug": map[string]any{"type": "string", "description": "Loyalty program (default aeroplan)"},
			},
			"required": []string{"origin", "destination", "depart_date"},
		},
		Handler: func(ctx context.Context, sessionID string, _ bool, args json.RawMessage) (json.RawMessage, error) {
			if s.pro.AwardWatch == nil {
				return errResultJSON("service_unavailable", "Award-watch service not configured."), nil
			}
			var req model.CreateAwardWatchRequest
			if err := json.Unmarshal(args, &req); err != nil {
				return errResultJSON("bad_input", "Could not parse award-watch arguments."), nil
			}
			watch, err := s.pro.AwardWatch.Create(ctx, sessionID, req)
			if err != nil {
				return errResultJSON("create_failed", err.Error()), nil
			}
			return json.Marshal(map[string]any{
				"created": true,
				"watch":   watch,
			})
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
//  1. Instructions + tier routing + card catalog — stable across all users at
//     this tier; high cache hit rate (~90%+ after warmup).
//  2. Per-user wallet context — cached separately at default 5-min TTL.
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
- "Did [program] devalue?" / "Is the chart still right?" → get_devaluation_history (first), then web_search if local log is silent
- "Is there a transfer bonus right now?" → web_search (or check transfer_bonus_log in your knowledge base before calling)
- Multiple programs to check → fan out parallel tool calls in one turn
- The user's wallet (cards, balances) is in your context already — never call a tool to read it.

STATED BALANCES OVERRIDE THE REGISTERED WALLET (IMPORTANT)
- The registered wallet is a convenience default, NOT a constraint. If the user states a balance in their message ("I have 120,000 Amex MR", "assume 80k Aeroplan", "suppose I had 200k points"), TREAT THAT NUMBER AS AUTHORITATIVE for affordability and recommendations in this query. Run the search and rank options against the stated amount.
- NEVER refuse, reject, or correct the user's premise on the grounds that "your account only shows X". They may not have logged it yet, or are planning a transfer. Answer the question they actually asked.
- You MAY add one short, non-blocking nudge if the stated amount differs materially from the wallet ("FYI your wallet shows 1,000 MR — add it under Wallet to track this for real"), but only AFTER fully answering.
- Still quote real award/transfer/cpp numbers from tools verbatim — only the user's POINT BALANCE is taken from their message; prices are never invented.

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
//
//	"round_start"  {round int}
//	"tool_start"   {id, name, args}
//	"tool_done"    {id, name, summary}
//	"tool_error"   {id, name, error}
//	"round_end"    {round, has_more bool}
type EmitFn func(event string, data map[string]any)

// ChatWithTools is the non-streaming wrapper. Calls the streaming variant with
// nil emit and returns the synthesized reply at the end.
// proCtxKey carries the caller's Pro status down through call paths where
// per-request state can't be a parameter (tools registered once at startup;
// deep helper chains). Used to Pro-gate the expensive live Apify scrape in
// both the chat award tool and the trip flight probe.
type proCtxKey struct{}

func withProCtx(ctx context.Context, isPro bool) context.Context {
	return context.WithValue(ctx, proCtxKey{}, isPro)
}

func proFromCtx(ctx context.Context) bool {
	v, _ := ctx.Value(proCtxKey{}).(bool)
	return v
}

// quotaTierCtxKey carries the caller's subscription tier down to the paid-API
// services (serpapi/tavily/apify), which charge it against the right per-tier
// monthly cap. Same rationale as proCtxKey: per-request state that can't be a
// parameter on the once-registered tools or deep helper chains.
type quotaTierCtxKey struct{}

// withQuotaTier attaches the resolved quota tier to ctx. Entry points
// (ChatWithToolsStream, EvaluateTrip, AwardSearchService.Search) set it from
// the most precise tier they know.
func withQuotaTier(ctx context.Context, tier quota.Tier) context.Context {
	return context.WithValue(ctx, quotaTierCtxKey{}, tier)
}

// quotaTierFromCtx reads the quota tier set by an entry point. It DEFAULTS TO
// quota.TierFree (the tightest cap) when unset, so any unclassified paid call
// is charged conservatively rather than against a generous bucket.
func quotaTierFromCtx(ctx context.Context) quota.Tier {
	if t, ok := ctx.Value(quotaTierCtxKey{}).(quota.Tier); ok {
		return t
	}
	return quota.TierFree
}

// complexChatSignals are substrings that indicate a turn needs the strong
// model: anything involving award/points/flight/trip planning, transfers, or
// multi-step reasoning. Lowercased match. Deliberately broad — quality where
// money decisions are made, cheap Haiku for everything else (definitions,
// "best card for groceries", general Q&A, which is the bulk of traffic).
var complexChatSignals = []string{
	"award", "miles", "aeroplan", "avios", "points to", "transfer", "transferring",
	"flight", "fly ", "flying", "airport", "business class", "first class",
	"trip", "itinerary", "route", "routing", "stopover", "layover", "redeem",
	"redemption", "book ", "booking", "hotel", "how many points", "how much will it cost",
	"cheapest", "best way to get", "sweet spot", "valuation", "cpp",
}

// selectChatModel routes the turn to the cheap (Haiku) or strong (Sonnet)
// model. Defaults to cheap; escalates to strong on any complexity signal:
// research mode, a long ask, or award/trip/points keywords. This is the
// primary chat-cost lever — most turns are simple and run on Haiku.
func (s *AIService) selectChatModel(req ChatRequest, isPro bool) string {
	if s.fastModelID == "" || s.fastModelID == s.modelID {
		return s.modelID // routing disabled
	}
	// ResearchMode is a client-controlled flag; only let it force the expensive
	// model for Pro users so a free user can't toggle unlimited Sonnet spend.
	if req.ResearchMode && isPro {
		return s.modelID
	}
	msg := strings.ToLower(req.Message)
	if len(req.Message) > 280 {
		return s.modelID
	}
	for _, sig := range complexChatSignals {
		if strings.Contains(msg, sig) {
			return s.modelID
		}
	}
	return s.fastModelID
}

func (s *AIService) ChatWithTools(ctx context.Context, req ChatRequest, isPro bool, plan string) (*ChatResponse, error) {
	return s.ChatWithToolsStream(ctx, req, isPro, plan, nil)
}

// ChatWithToolsStream runs the canonical Anthropic tool-use loop. If emit is
// non-nil, intermediate events (tool calls firing, rounds completing) are
// pushed to the caller as they happen — this is what powers the SSE streaming
// endpoint and the tool-status pills in the chat UI.
func (s *AIService) ChatWithToolsStream(ctx context.Context, req ChatRequest, isPro bool, plan string, emit EmitFn) (*ChatResponse, error) {
	if s.apiKey == "" {
		return nil, fmt.Errorf("ANTHROPIC_API_KEY not configured")
	}
	if s.tools == nil {
		return nil, fmt.Errorf("tool registry not initialized")
	}

	// Carry Pro status to tool execution so search_award_space can Pro-gate
	// the expensive live Apify scrape.
	ctx = withProCtx(ctx, isPro)
	// Carry the precise subscription tier so paid tools (serpapi/tavily/apify)
	// charge the right per-tier monthly cap. plan is the authoritative source;
	// isPro is the legacy fallback for tokens minted before the plan claim.
	ctx = withQuotaTier(ctx, quota.TierForPlan(plan, isPro))

	// Build static system layers.
	walletCtx := s.buildWalletContext(ctx, req.SessionID)
	catalogCtx := s.buildCardCatalogContext(ctx)
	system := s.buildToolUseSystemPrompt(walletCtx, catalogCtx, isPro)
	tools := s.tools.schemas(isPro)

	// Convert prior history into block messages. History is plain text only —
	// previous tool turns are NOT replayed (they were stored as the synthesized
	// final assistant message). Cap BEFORE building the payload so a giant
	// client-supplied history can't drain the Anthropic budget in one request.
	cappedHistory := CapHistoryForLLM(req.History)
	msgs := make([]claudeBlockMessage, 0, len(cappedHistory)+8)
	for _, h := range cappedHistory {
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

	// Pick the model once for the whole turn (consistent across tool rounds).
	turnModel := s.selectChatModel(req, isPro)

	// 5-round budget. Each round = one LLM call. After round 5, we force a final
	// synthesis with no tools available so the model must answer.
	const maxRounds = 5
	// Denial-of-wallet bounds. Without these, one attacker-controlled message
	// can induce the model to emit dozens of tool calls per round across 4
	// rounds, each paid tool fanning out to Apify/SerpAPI/Tavily — exhausting
	// the SHARED monthly quota and DoS-ing every user. Cap parallel fan-out per
	// round, and budget the paid (external-API) tools across the whole request.
	const maxToolCallsPerRound = 6
	const maxPaidToolCalls = 8
	paidTools := map[string]bool{
		"search_award_space":  true,
		"search_cash_flights": true,
		"search_hotels":       true,
		"web_search":          true,
	}
	paidToolsUsed := 0
	totalTokens := 0 // actual input+output across all rounds — debits the real budget
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

		maxTokens := 1500
		if isPro {
			maxTokens = 4096
		}
		resp, err := s.callClaudeWithTools(ctx, system, roundTools, msgs, maxTokens, turnModel)
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
		totalTokens += resp.Usage.InputTokens + resp.Usage.OutputTokens

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
		// Decide execution synchronously (before launching goroutines) so the
		// paid-budget counter isn't raced. Calls beyond the per-round cap, or
		// paid calls beyond the per-request budget, get an error tool_result so
		// the model can react instead of silently fanning out unbounded work.
		execute := make([]bool, len(toolCalls))
		for i, tc := range toolCalls {
			reason := ""
			switch {
			case i >= maxToolCallsPerRound:
				reason = "too_many_tool_calls_this_round"
			case paidTools[tc.Name] && paidToolsUsed >= maxPaidToolCalls:
				reason = "paid_tool_budget_exhausted_for_this_request"
			}
			if reason != "" {
				results[i] = claudeBlock{
					Type:      "tool_result",
					ToolUseID: tc.ID,
					Content:   fmt.Sprintf(`{"error":%q}`, reason),
				}
				if emit != nil {
					emit("tool_done", map[string]any{"id": tc.ID, "name": tc.Name, "summary": reason})
				}
				continue
			}
			if paidTools[tc.Name] {
				paidToolsUsed++
			}
			execute[i] = true
		}
		var wg sync.WaitGroup
		for i, tc := range toolCalls {
			if !execute[i] {
				continue
			}
			wg.Add(1)
			go func(i int, tc claudeBlock) {
				defer wg.Done()
				// A panic in any tool (e.g. Apify schema drift) would otherwise
				// crash the whole API process, since unrecovered goroutine panics
				// terminate the program. Convert it into an error tool_result so
				// the LLM can react and the stream stays open.
				defer func() {
					if rec := recover(); rec != nil {
						slog.Error("[ai-tools] tool panic recovered",
							"tool", tc.Name, "panic", rec,
							"stack", string(debug.Stack()),
						)
						results[i] = claudeBlock{
							Type:      "tool_result",
							ToolUseID: tc.ID,
							Content:   fmt.Sprintf(`{"error":"tool panicked: %v"}`, rec),
						}
						if emit != nil {
							emit("tool_done", map[string]any{
								"id":      tc.ID,
								"name":    tc.Name,
								"summary": "internal error",
							})
						}
					}
				}()
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
		Reply:      reply,
		History:    history,
		TokensUsed: totalTokens,
	}, nil
}

// callClaudeWithTools — block-based, tool-aware variant of callClaude.
// maxTokens is tier-dependent: free 1500, Pro 4096. Caller decides based on
// the request's isPro state. Caps runaway-output abuse on the free tier
// without limiting Pro analytics queries.
func (s *AIService) callClaudeWithTools(
	ctx context.Context,
	system []systemBlock,
	tools []map[string]any,
	messages []claudeBlockMessage,
	maxTokens int,
	modelID string,
) (*claudeToolUseResponse, error) {
	if maxTokens <= 0 {
		maxTokens = 4096
	}
	if modelID == "" {
		modelID = s.modelID
	}
	reqBody := claudeToolUseRequest{
		Model:     modelID,
		MaxTokens: maxTokens,
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
	defer resp.Body.Close() //nolint:errcheck // close on read-only response body

	respBody, err := readCappedBody(resp.Body)
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
