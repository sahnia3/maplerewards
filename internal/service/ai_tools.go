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
	"net/http"
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

type claudeToolUseRequest struct {
	Model     string               `json:"model"`
	MaxTokens int                  `json:"max_tokens"`
	System    string               `json:"system"`
	Tools     []map[string]any     `json:"tools,omitempty"`
	Messages  []claudeBlockMessage `json:"messages"`
}

type claudeToolUseResponse struct {
	ID         string        `json:"id"`
	StopReason string        `json:"stop_reason"`
	Content    []claudeBlock `json:"content"`
	Usage      struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
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
func (r *toolRegistry) schemas(includePro bool) []map[string]any {
	out := make([]map[string]any, 0, len(r.tools))
	for _, t := range r.tools {
		if t.ProOnly && !includePro {
			continue
		}
		out = append(out, map[string]any{
			"name":         t.Name,
			"description":  t.Description,
			"input_schema": t.InputSchema,
		})
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
			// Cap result count to keep token usage tight.
			if len(results) > 8 {
				results = results[:8]
			}
			return json.Marshal(map[string]any{
				"results":    results,
				"fetched_at": time.Now().UTC().Format(time.RFC3339),
				"note":       "Live award search across Apify + Seats.aero + SerpAPI cash comparison. Prices in CAD.",
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
			prog, err := s.cardRepo.GetProgramBySlug(ctx, strings.ToLower(args.ProgramSlug))
			if err != nil || prog == nil {
				return errResultJSON("program_not_found", fmt.Sprintf("Unknown program slug %q.", args.ProgramSlug)), nil
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
			cpp, err := s.valuationRepo.GetCPP(ctx, strings.ToLower(args.ProgramSlug), args.Segment)
			if err != nil {
				return errResultJSON("not_found", fmt.Sprintf("No CPP for %s/%s.", args.ProgramSlug, args.Segment)), nil
			}
			return json.Marshal(map[string]any{
				"program_slug": args.ProgramSlug,
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
}

// ── Tool-use system prompt ───────────────────────────────────────────────────

// buildToolUseSystemPrompt is the slimmer system prompt used in tool-use mode.
// The fat travel-data-injection-on-keyword approach is gone — the model now
// gets context via tools and only the stable layers (instructions + wallet +
// catalog) live here.
func (s *AIService) buildToolUseSystemPrompt(walletContext, catalogContext string) string {
	var b strings.Builder
	b.WriteString(`You are the MapleRewards AI Assistant — an expert Canadian credit card rewards advisor.

You have access to live tools that fetch award space, cash prices, transfer partners, CPP valuations, and web search. Use them aggressively rather than relying on training data, which is often stale.

GUARDRAILS
- Always quote numbers in CAD unless the user explicitly asks otherwise.
- Never invent transfer ratios, award costs, or program details. If you don't have the data, call a tool.
- Cite live data ("per the live award search…") so the user knows it's real.
- Keep answers under ~400 words unless the user asks for depth.
- Use markdown tables for award/cash comparisons.
- Refuse off-topic requests (poetry, code, general knowledge) briefly and redirect.

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
`)

	b.WriteString("\n--- USER WALLET ---\n")
	b.WriteString(walletContext)
	b.WriteString("\n--- CARD CATALOG (reference) ---\n")
	b.WriteString(catalogContext)
	return b.String()
}

// ── ChatWithTools — the new tool-use loop ────────────────────────────────────

// ChatWithTools runs the canonical Anthropic tool-use loop. Replaces the legacy
// keyword-driven Chat() flow. Returns the synthesized assistant reply plus
// the updated history (tool_use / tool_result blocks are NOT persisted to
// history — only the user message + final assistant text).
func (s *AIService) ChatWithTools(ctx context.Context, req ChatRequest, isPro bool) (*ChatResponse, error) {
	if s.apiKey == "" {
		return nil, fmt.Errorf("ANTHROPIC_API_KEY not configured")
	}
	if s.tools == nil {
		return nil, fmt.Errorf("tool registry not initialized")
	}

	// Build static system layers.
	walletCtx := s.buildWalletContext(ctx, req.SessionID)
	catalogCtx := s.buildCardCatalogContext(ctx)
	system := s.buildToolUseSystemPrompt(walletCtx, catalogCtx)
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
		for _, b := range resp.Content {
			switch b.Type {
			case "text":
				if b.Text != "" {
					finalText.WriteString(b.Text)
					finalText.WriteString("\n")
				}
			case "tool_use":
				toolCalls = append(toolCalls, b)
			}
		}

		// Done if no tool calls or end_turn.
		if len(toolCalls) == 0 || resp.StopReason == "end_turn" {
			break
		}

		// Dispatch tool calls in parallel with a per-call deadline.
		results := make([]claudeBlock, len(toolCalls))
		var wg sync.WaitGroup
		for i, tc := range toolCalls {
			wg.Add(1)
			go func(i int, tc claudeBlock) {
				defer wg.Done()
				tctx, cancel := context.WithTimeout(ctx, 20*time.Second)
				defer cancel()
				out := s.tools.call(tctx, req.SessionID, isPro, tc.Name, tc.Input)
				results[i] = claudeBlock{
					Type:      "tool_result",
					ToolUseID: tc.ID,
					Content:   string(out),
				}
			}(i, tc)
		}
		wg.Wait()

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
	system string,
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
