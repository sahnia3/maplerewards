package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/redis/go-redis/v9"

	"maplerewards/internal/metrics"
	mw "maplerewards/internal/middleware"
	"maplerewards/internal/model"
	"maplerewards/internal/repo"
	"maplerewards/internal/service"
)

// freeChatMonthlyCap is the per-user monthly cap on AI chat messages for the
// free tier. Pro users are unlimited (no Redis check). Set to 2: chat is a
// paid feature; free users get a minimal taste (a question or two a month)
// to drive conversion, not an ongoing free assistant. Deliberately low to
// keep free-tier Anthropic spend negligible at scale.
const freeChatMonthlyCap int64 = 2

// chatRequestBody is the wire shape for /chat and /chat/stream POSTs. It
// extends service.ChatRequest with an optional conversation_id so authenticated
// users can append to an existing conversation; absent → create a new one.
type chatRequestBody struct {
	service.ChatRequest
	ConversationID int64 `json:"conversation_id,omitempty"`
}

type ChatHandler struct {
	svc           *service.AIService
	rdb           *redis.Client
	sessionLookup mw.SessionOwnerLookup // may be nil in tests
	chatRepo      *repo.ChatRepo        // nil disables persistence (e.g. unit tests)
	budget        *service.AIBudget     // nil → fail-open (no daily token budget enforced)
}

// NewChatHandler keeps a positional signature for unit tests that don't
// need chat-history persistence. Pass nil for sessionLookup to skip the
// body-sessionID check in tests. Production wiring goes through
// NewChatHandlerWithRepo so the conversation repo is plumbed in.
func NewChatHandler(svc *service.AIService, rdb *redis.Client, sessionLookup mw.SessionOwnerLookup) *ChatHandler {
	return &ChatHandler{svc: svc, rdb: rdb, sessionLookup: sessionLookup}
}

// NewChatHandlerWithRepo is the persistence-aware constructor used by cmd/api.
func NewChatHandlerWithRepo(svc *service.AIService, rdb *redis.Client, sessionLookup mw.SessionOwnerLookup, chatRepo *repo.ChatRepo) *ChatHandler {
	return &ChatHandler{
		svc:           svc,
		rdb:           rdb,
		sessionLookup: sessionLookup,
		chatRepo:      chatRepo,
	}
}

// WithBudget attaches a per-user daily token budget enforcer. Returns the
// handler for chainable construction; safe to call with a nil budget (no-op).
func (h *ChatHandler) WithBudget(b *service.AIBudget) *ChatHandler {
	h.budget = b
	return h
}

// Chat handles a POST with a user message and returns an AI response.
func (h *ChatHandler) Chat(w http.ResponseWriter, r *http.Request) {
	var req chatRequestBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Message == "" {
		jsonError(w, "message is required", http.StatusBadRequest)
		return
	}

	if len(req.Message) > 2000 {
		jsonError(w, "message too long (max 2000 characters)", http.StatusBadRequest)
		return
	}

	// Body-sessionID IDOR fix: chat injects the wallet context into the
	// system prompt, so a logged-in user passing another user's session_id
	// would receive AI responses computed against that user's wallet.
	if req.SessionID != "" && !requireBodySessionOwner(w, r, h.sessionLookup, req.SessionID) {
		return
	}

	// Pro gating: check monthly usage for non-pro users
	isPro := mw.IsProFromContext(r.Context())
	plan := mw.PlanFromContext(r.Context()) // drives per-tier AI token budget
	userID := mw.UserIDFromContext(r.Context())

	// Anonymous-user spam guard: cap by client IP so an attacker can't burn
	// our Anthropic budget without ever signing up. Authenticated users are
	// already gated by the per-user monthly Pro check below; this branch only
	// fires for userID == "".
	if !isPro && userID == "" && h.rdb != nil {
		if !checkAnonymousChatQuota(w, r, h.rdb) {
			return
		}
	}

	if !isPro && h.rdb != nil && userID != "" {
		month := time.Now().Format("2006-01")
		key := fmt.Sprintf("chat_usage:%s:%s", userID, month)

		count, err := h.rdb.Get(r.Context(), key).Int64()
		if err != nil && err != redis.Nil {
			// Redis error — allow the request but log
			slog.Warn("redis get chat usage failed", "err", err, "user_id", userID)
		}

		if count >= freeChatMonthlyCap {
			jsonErrorCode(w, "UPGRADE_REQUIRED",
				fmt.Sprintf("Free users get %d AI messages per month. Upgrade to Pro for unlimited access.", freeChatMonthlyCap),
				http.StatusForbidden)
			return
		}
	}

	// Per-request hard ceiling — independent of remaining daily budget. Even
	// a user with full budget can't fire one pathologically expensive
	// request. Estimate input from the message + history payload size.
	if estIn := estimateRequestInputTokens(req.ChatRequest); service.RequestTooLarge(estIn) {
		jsonErrorCode(w, "REQUEST_TOO_LARGE",
			"That request is too large to process. Shorten the message or start a new conversation.",
			http.StatusRequestEntityTooLarge)
		return
	}

	// Daily Claude token budget — separate from monthly message cap. Protects
	// against runaway-loop abuse that would burn the Anthropic monthly budget
	// even within the free-tier message count. Pro users have more headroom.
	if h.budget != nil {
		_, _, exhausted, err := h.budget.CheckBudget(r.Context(), userID, plan, isPro)
		if err != nil {
			slog.Warn("aibudget check failed (failing open)", "err", err, "user_id", userID)
		} else if exhausted {
			w.Header().Set("Retry-After", fmt.Sprintf("%d", service.SecondsUntilUTCMidnight()))
			jsonErrorCode(w, "DAILY_LIMIT",
				"You've hit today's AI token budget. Resets at UTC midnight.",
				http.StatusTooManyRequests)
			return
		}
	}

	resp, err := h.svc.ChatWithTools(r.Context(), req.ChatRequest, isPro, plan)
	if err != nil {
		// P0: do NOT leak Anthropic error bodies / tool-call internals to the
		// client. Log full error server-side, return a stable code + short
		// message. Specific upstream failures (rate-limit, timeout) get hinted
		// at by class but not by raw payload.
		slog.Error("AI chat failed", "err", err, "user_id", userID, "is_pro", isPro)
		hint := "the AI assistant is having trouble right now — please try again"
		if strings.Contains(err.Error(), "context deadline") || strings.Contains(err.Error(), "timeout") {
			hint = "the AI assistant took too long to respond — please try again with a shorter question"
		}
		jsonErrorCode(w, "AI_ERROR", hint, http.StatusInternalServerError)
		return
	}

	// Track usage for non-pro users
	if !isPro && h.rdb != nil && userID != "" {
		month := time.Now().Format("2006-01")
		key := fmt.Sprintf("chat_usage:%s:%s", userID, month)
		pipe := h.rdb.Pipeline()
		pipe.Incr(r.Context(), key)
		// Expire at end of next month (safety buffer)
		pipe.Expire(r.Context(), key, 62*24*time.Hour)
		if _, err := pipe.Exec(r.Context()); err != nil {
			slog.Warn("redis incr chat usage failed", "err", err, "user_id", userID)
		}
	}

	// Consume daily token budget by ACTUAL usage when the service reports it
	// (sum of input+output across all tool-loop rounds) — the message+reply
	// estimate badly under-counts a multi-round tool turn, letting a heavy
	// chatter exceed the daily Anthropic budget. Fall back to the estimate
	// only when usage is unavailable. Errors are warn-and-continue.
	if h.budget != nil {
		inTok, outTok := estimateTokenSplit(req.Message, resp.Reply)
		metrics.AddAnthropicTokens(inTok, outTok)
		tokens := resp.TokensUsed
		if tokens <= 0 {
			tokens = inTok + outTok
		}
		if _, _, berr := h.budget.Consume(r.Context(), userID, plan, isPro, tokens); berr != nil {
			slog.Warn("aibudget consume failed", "err", berr, "user_id", userID, "tokens", tokens)
		}
	}

	// Persist conversation for authenticated users. Anonymous → no persistence;
	// they're storage-cheap on Redis quota only. Failures here are non-fatal:
	// we already have the assistant reply, so we return it even if the DB
	// write fails (logged).
	convoID := h.persistChat(r.Context(), userID, req.ConversationID, req.Message, resp.Reply)

	jsonOK(w, map[string]any{
		"reply":           resp.Reply,
		"history":         resp.History,
		"conversation_id": convoID,
	})
}

// ChatStream is the Server-Sent Events variant of Chat. The user's question
// runs through the same tool-use loop, but intermediate progress (tool_start /
// tool_done events) is streamed to the client as it happens — closes the
// 30-second blank-screen UX gap on multi-tool prompts like "Mumbai → Toronto
// business + hotel night."
//
// Wire format (one line per event, blank line separator):
//
//	event: <name>
//	data: <json>
//
// Events emitted:
//
//	round_start  {round}
//	tool_start   {id, name, args}
//	tool_done    {id, name, summary}
//	round_end    {round, has_more}
//	done         {reply, history, conversation_id}
//	error        {message}
//
// Pro gating + monthly usage limits are enforced exactly as in Chat().
func (h *ChatHandler) ChatStream(w http.ResponseWriter, r *http.Request) {
	// Recover from panics anywhere in the tool-use loop. Defense-in-depth: the
	// Apify award-search parse path (apify_awards.parseApifyResults) is now
	// panic-proof on its own, but the broader streaming/tool loop still needs a
	// backstop so an unexpected panic surfaces as an SSE error frame instead of
	// killing the whole API process (client-side: ERR_INCOMPLETE_CHUNKED_ENCODING).
	defer func() {
		if rec := recover(); rec != nil {
			slog.Error("[chat-stream] panic recovered",
				"panic", rec,
				"stack", string(debug.Stack()),
			)
			// Best-effort SSE error frame; if w is already closed this is a no-op.
			if f, ok := w.(http.Flusher); ok {
				fmt.Fprintf(w, "event: error\ndata: {\"message\":\"internal error — see server logs\"}\n\n") //nolint:errcheck // best-effort SSE frame; client may already be gone
				f.Flush()
			}
		}
	}()

	var req chatRequestBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Message == "" {
		jsonError(w, "message is required", http.StatusBadRequest)
		return
	}
	if len(req.Message) > 2000 {
		jsonError(w, "message too long (max 2000 characters)", http.StatusBadRequest)
		return
	}

	// Body-sessionID IDOR fix: same reasoning as Chat() above.
	if req.SessionID != "" && !requireBodySessionOwner(w, r, h.sessionLookup, req.SessionID) {
		return
	}

	isPro := mw.IsProFromContext(r.Context())
	plan := mw.PlanFromContext(r.Context()) // drives per-tier AI token budget
	userID := mw.UserIDFromContext(r.Context())

	// Anonymous-IP cap mirrors Chat(): protect Anthropic spend from anonymous spam.
	if !isPro && userID == "" && h.rdb != nil {
		if !checkAnonymousChatQuota(w, r, h.rdb) {
			return
		}
	}

	// Pro gating — same logic as Chat() above.
	if !isPro && h.rdb != nil && userID != "" {
		month := time.Now().Format("2006-01")
		key := fmt.Sprintf("chat_usage:%s:%s", userID, month)
		count, err := h.rdb.Get(r.Context(), key).Int64()
		if err != nil && err != redis.Nil {
			slog.Warn("redis get chat usage failed", "err", err, "user_id", userID)
		}
		if count >= freeChatMonthlyCap {
			jsonErrorCode(w, "UPGRADE_REQUIRED",
				fmt.Sprintf("Free users get %d AI messages per month. Upgrade to Pro for unlimited access.", freeChatMonthlyCap),
				http.StatusForbidden)
			return
		}
	}

	// Per-request hard ceiling, mirrors the non-streaming handler.
	if estIn := estimateRequestInputTokens(req.ChatRequest); service.RequestTooLarge(estIn) {
		jsonErrorCode(w, "REQUEST_TOO_LARGE",
			"That request is too large to process. Shorten the message or start a new conversation.",
			http.StatusRequestEntityTooLarge)
		return
	}

	// Daily token budget gate, mirrors the non-streaming Chat handler.
	if h.budget != nil {
		_, _, exhausted, err := h.budget.CheckBudget(r.Context(), userID, plan, isPro)
		if err != nil {
			slog.Warn("aibudget check failed (failing open)", "err", err, "user_id", userID)
		} else if exhausted {
			w.Header().Set("Retry-After", fmt.Sprintf("%d", service.SecondsUntilUTCMidnight()))
			jsonErrorCode(w, "DAILY_LIMIT",
				"You've hit today's AI token budget. Resets at UTC midnight.",
				http.StatusTooManyRequests)
			return
		}
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, "streaming not supported by upstream", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	var mu sync.Mutex
	emit := func(event string, data map[string]any) {
		mu.Lock()
		defer mu.Unlock()
		payload, err := json.Marshal(data)
		if err != nil {
			return
		}
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload) //nolint:errcheck // best-effort SSE write; client may have disconnected
		flusher.Flush()
	}

	// Apify award searches can run 60-120s. Without traffic on the wire,
	// browsers and reverse proxies cut "idle" SSE connections — that's the
	// ERR_INCOMPLETE_CHUNKED_ENCODING we saw on prompt 1 during QA.
	// Emit a comment line every 15s so the connection stays warm.
	keepaliveCtx, stopKeepalive := context.WithCancel(r.Context())
	defer stopKeepalive()
	go func() {
		// Recover here too — a panic in this goroutine would otherwise kill
		// the whole API process, since the handler's own recover() can't see
		// across goroutine boundaries.
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("[chat-stream] keepalive goroutine panic recovered",
					"panic", rec,
				)
			}
		}()
		t := time.NewTicker(15 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-keepaliveCtx.Done():
				return
			case <-t.C:
				mu.Lock()
				// Re-check ctx after acquiring the lock — the handler may have
				// returned between the ticker firing and us getting here, in
				// which case writing to w is unsafe.
				if keepaliveCtx.Err() != nil {
					mu.Unlock()
					return
				}
				fmt.Fprint(w, ": keepalive\n\n") //nolint:errcheck // best-effort SSE keepalive; client may have disconnected
				flusher.Flush()
				mu.Unlock()
			}
		}
	}()

	resp, err := h.svc.ChatWithToolsStream(r.Context(), req.ChatRequest, isPro, plan, emit)
	if err != nil {
		// Log server-side too — emit() only reaches the client via SSE, and if
		// the client already disconnected (which produces ctx.Canceled errors),
		// the SSE write silently no-ops and we lose the error completely.
		slog.Error("[chat-stream] tool loop failed",
			"err", err.Error(),
			"user_id", userID,
			"ctx_err", r.Context().Err(),
		)
		// P0: do NOT leak the raw service error (Anthropic response bodies,
		// tool-call internals, internal paths) into the SSE frame — mirror the
		// non-streaming handler above. Log the full error server-side; emit a
		// stable, generic message with the same timeout hint.
		hint := "the AI assistant is having trouble right now — please try again"
		if strings.Contains(err.Error(), "context deadline") || strings.Contains(err.Error(), "timeout") {
			hint = "the AI assistant took too long to respond — please try again with a shorter question"
		}
		emit("error", map[string]any{"message": hint})
		return
	}

	// Track usage for non-pro users (only after a successful response).
	if !isPro && h.rdb != nil && userID != "" {
		month := time.Now().Format("2006-01")
		key := fmt.Sprintf("chat_usage:%s:%s", userID, month)
		pipe := h.rdb.Pipeline()
		pipe.Incr(r.Context(), key)
		pipe.Expire(r.Context(), key, 62*24*time.Hour)
		if _, err := pipe.Exec(r.Context()); err != nil {
			slog.Warn("redis incr chat usage failed", "err", err, "user_id", userID)
		}
	}

	// Consume daily token budget on success — by ACTUAL multi-round usage when
	// reported, else the message+reply estimate (which under-counts tool turns).
	if h.budget != nil {
		inTok, outTok := estimateTokenSplit(req.Message, resp.Reply)
		metrics.AddAnthropicTokens(inTok, outTok)
		tokens := resp.TokensUsed
		if tokens <= 0 {
			tokens = inTok + outTok
		}
		if _, _, berr := h.budget.Consume(r.Context(), userID, plan, isPro, tokens); berr != nil {
			slog.Warn("aibudget consume failed", "err", berr, "user_id", userID, "tokens", tokens)
		}
	}

	// Persist for authenticated users. Use background-context-bounded write so
	// a client disconnect (r.Context().Err() != nil) doesn't lose the message
	// — the LLM call already completed, the user paid the token cost, and
	// they'll want to see it in their history.
	persistCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	convoID := h.persistChat(persistCtx, userID, req.ConversationID, req.Message, resp.Reply)

	emit("done", map[string]any{
		"reply":           resp.Reply,
		"history":         resp.History,
		"conversation_id": convoID,
	})
}

// persistChat writes the user + assistant turn to the chat_messages table for
// authenticated users. Anonymous users (userID == "") and missing repo are
// silently skipped — anonymous chat is by design ephemeral.
//
// Returns the conversation_id (new or existing) so the caller can echo it
// back to the client; the client uses it on follow-up turns to keep the
// thread coherent.
func (h *ChatHandler) persistChat(ctx context.Context, userID string, conversationID int64, userMsg, assistantReply string) int64 {
	if userID == "" || h.chatRepo == nil {
		return 0
	}
	convoID := conversationID
	if convoID == 0 {
		title := userMsg
		if len(title) > 60 {
			title = title[:60]
		}
		created, err := h.chatRepo.CreateConversation(ctx, userID, "", title)
		if err != nil {
			slog.Warn("chat persist: create conversation failed", "err", err, "user_id", userID)
			return 0
		}
		convoID = created.ID
	}
	if err := h.chatRepo.AppendMessage(ctx, convoID, "user", userMsg); err != nil {
		slog.Warn("chat persist: append user msg failed", "err", err, "conversation_id", convoID)
	}
	if err := h.chatRepo.AppendMessage(ctx, convoID, "assistant", assistantReply); err != nil {
		slog.Warn("chat persist: append assistant msg failed", "err", err, "conversation_id", convoID)
	}
	return convoID
}

// ListConversations returns the authenticated user's chat conversation list,
// newest first. Limit query param is clamped to [1, 100], default 25.
func (h *ChatHandler) ListConversations(w http.ResponseWriter, r *http.Request) {
	if h.chatRepo == nil {
		jsonError(w, "chat history not available", http.StatusServiceUnavailable)
		return
	}
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	limit := 25
	if q := r.URL.Query().Get("limit"); q != "" {
		if n, err := strconv.Atoi(q); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > 100 {
		limit = 100
	}
	convos, err := h.chatRepo.ListConversations(r.Context(), userID, limit)
	if err != nil {
		slog.Error("chat list conversations failed", "err", err, "user_id", userID)
		jsonError(w, "failed to load conversations", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"conversations": convos})
}

// GetMessages returns all messages in a specific conversation, oldest first.
// Owner check is enforced at the SQL layer (GetMessages requires user_id +
// conversation_id pair); a stranger asking for someone else's conversation
// gets an empty list rather than a 403, which is acceptable.
func (h *ChatHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	if h.chatRepo == nil {
		jsonError(w, "chat history not available", http.StatusServiceUnavailable)
		return
	}
	userID := mw.UserIDFromContext(r.Context())
	if userID == "" {
		jsonError(w, "authentication required", http.StatusUnauthorized)
		return
	}
	idStr := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "invalid conversation id", http.StatusBadRequest)
		return
	}
	msgs, err := h.chatRepo.GetMessages(r.Context(), userID, id)
	if err != nil {
		slog.Error("chat get messages failed", "err", err, "user_id", userID, "conversation_id", id)
		jsonError(w, "failed to load messages", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{
		"conversation_id": id,
		"messages":        msgs,
	})
}

// Compile-time guard: ensure model.ChatMessage is still the shape persistChat
// expects. Catches future struct renames at build time.
var _ = model.ChatMessage{Role: "user", Content: "ping"}

// estimateRequestInputTokens estimates the INPUT tokens a request will cost
// before the Claude call: system-prompt overhead + the new message + the
// history AS THE LLM WILL ACTUALLY RECEIVE IT (CapHistoryForLLM — last N
// messages, each truncated). This MUST match the real payload: estimating
// the raw, uncapped client history while the 14k ceiling is sized for the
// capped payload falsely 413'd legitimate multi-turn chats once history grew.
// Still conservative for cost — the cap only ever shrinks the estimate.
func estimateRequestInputTokens(req service.ChatRequest) int {
	const baseSystemOverhead = 3000
	const charsPerToken = 3.5
	chars := len(req.Message)
	for _, h := range service.CapHistoryForLLM(req.History) {
		chars += len(h.Content)
	}
	return baseSystemOverhead + int(float64(chars)/charsPerToken)
}

// estimateTokenSplit returns the (input, output) estimate separately so the
// metrics layer can track cost accurately — output tokens are ~5x the price
// of input, so a combined number understates spend.
func estimateTokenSplit(userMessage, assistantReply string) (in, out int) {
	const baseSystemOverhead = 3000
	const charsPerToken = 3.5
	const toolRoundtripMultiplier = 1.3

	in = baseSystemOverhead + int(float64(len(userMessage))/charsPerToken)
	out = int(float64(len(assistantReply)) / charsPerToken * toolRoundtripMultiplier)
	return in, out
}
