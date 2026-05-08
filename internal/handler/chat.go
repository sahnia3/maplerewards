package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"

	mw "maplerewards/internal/middleware"
	"maplerewards/internal/service"
)

type ChatHandler struct {
	svc *service.AIService
	rdb *redis.Client
}

func NewChatHandler(svc *service.AIService, rdb ...*redis.Client) *ChatHandler {
	h := &ChatHandler{svc: svc}
	if len(rdb) > 0 {
		h.rdb = rdb[0]
	}
	return h
}

// Chat handles a POST with a user message and returns an AI response.
func (h *ChatHandler) Chat(w http.ResponseWriter, r *http.Request) {
	var req service.ChatRequest
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

	// Pro gating: check monthly usage for non-pro users
	isPro := mw.IsProFromContext(r.Context())
	userID := mw.UserIDFromContext(r.Context())

	if !isPro && h.rdb != nil && userID != "" {
		month := time.Now().Format("2006-01")
		key := fmt.Sprintf("chat_usage:%s:%s", userID, month)

		count, err := h.rdb.Get(r.Context(), key).Int64()
		if err != nil && err != redis.Nil {
			// Redis error — allow the request but log
			fmt.Printf("warn: redis get chat usage: %v\n", err)
		}

		if count >= 1 {
			jsonErrorCode(w, "UPGRADE_REQUIRED",
				"Free users get 1 AI message per month. Upgrade to Pro for unlimited access.",
				http.StatusForbidden)
			return
		}
	}

	resp, err := h.svc.ChatWithTools(r.Context(), req, isPro)
	if err != nil {
		jsonErrorCode(w, "AI_ERROR", err.Error(), http.StatusInternalServerError)
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
			fmt.Printf("warn: redis incr chat usage: %v\n", err)
		}
	}

	jsonOK(w, resp)
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
//   round_start  {round}
//   tool_start   {id, name, args}
//   tool_done    {id, name, summary}
//   round_end    {round, has_more}
//   done         {reply, history}
//   error        {message}
//
// Pro gating + monthly usage limits are enforced exactly as in Chat().
func (h *ChatHandler) ChatStream(w http.ResponseWriter, r *http.Request) {
	var req service.ChatRequest
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

	isPro := mw.IsProFromContext(r.Context())
	userID := mw.UserIDFromContext(r.Context())

	// Pro gating — same logic as Chat() above.
	if !isPro && h.rdb != nil && userID != "" {
		month := time.Now().Format("2006-01")
		key := fmt.Sprintf("chat_usage:%s:%s", userID, month)
		count, err := h.rdb.Get(r.Context(), key).Int64()
		if err != nil && err != redis.Nil {
			fmt.Printf("warn: redis get chat usage: %v\n", err)
		}
		if count >= 1 {
			jsonErrorCode(w, "UPGRADE_REQUIRED",
				"Free users get 1 AI message per month. Upgrade to Pro for unlimited access.",
				http.StatusForbidden)
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
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload)
		flusher.Flush()
	}

	resp, err := h.svc.ChatWithToolsStream(r.Context(), req, isPro, emit)
	if err != nil {
		emit("error", map[string]any{"message": err.Error()})
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
			fmt.Printf("warn: redis incr chat usage: %v\n", err)
		}
	}

	emit("done", map[string]any{
		"reply":   resp.Reply,
		"history": resp.History,
	})
}
