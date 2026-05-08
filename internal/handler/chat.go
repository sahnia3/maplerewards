package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
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
