package repo

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ChatConversation is a top-level chat thread for a single authenticated
// user. session_id is intentionally optional — it lets us tie a conversation
// to a wallet session when one exists, but anon→auth account merges work
// regardless.
type ChatConversation struct {
	ID        int64     `json:"id"`
	UserID    string    `json:"user_id"`
	SessionID string    `json:"session_id,omitempty"`
	Title     string    `json:"title,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ChatStoredMessage is one row from chat_messages — distinct from
// model.ChatMessage because the persisted row carries id + timestamps.
type ChatStoredMessage struct {
	ID        int64     `json:"id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// ChatRepo wraps the chat_conversations + chat_messages tables.
// Constructed once at startup and shared across handlers; methods are
// goroutine-safe via the underlying pgxpool.
type ChatRepo struct {
	db *pgxpool.Pool
}

// NewChatRepo constructs a ChatRepo. db may be nil in unit tests that don't
// exercise persistence; the handler short-circuits on a nil repo, but if you
// hand a non-nil repo with a nil pool you'll panic on first query — that's a
// programming error, not a runtime error.
func NewChatRepo(db *pgxpool.Pool) *ChatRepo {
	return &ChatRepo{db: db}
}

// CreateConversation inserts a new conversation row and returns the populated
// struct including the generated ID + timestamps.
func (r *ChatRepo) CreateConversation(ctx context.Context, userID, sessionID, title string) (*ChatConversation, error) {
	c := &ChatConversation{
		UserID:    userID,
		SessionID: sessionID,
		Title:     title,
	}
	// Use a nullable arg for session_id so an empty string lands as NULL
	// rather than '' — keeps the column semantically "absent" for filter
	// queries that look for `session_id IS NOT NULL`.
	var sid any
	if sessionID != "" {
		sid = sessionID
	}
	err := r.db.QueryRow(ctx, `
		INSERT INTO chat_conversations (user_id, session_id, title)
		VALUES ($1, $2, $3)
		RETURNING id, created_at, updated_at
	`, userID, sid, title).Scan(&c.ID, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return c, nil
}

// AppendMessage inserts a single role/content pair. Also bumps the parent
// conversation's updated_at so list-ordering reflects activity.
func (r *ChatRepo) AppendMessage(ctx context.Context, conversationID int64, role, content string) error {
	// Run as one round-trip via a CTE — saves one network hop on every
	// turn (we append 2 messages per chat round, so this is hot path).
	_, err := r.db.Exec(ctx, `
		WITH inserted AS (
			INSERT INTO chat_messages (conversation_id, role, content)
			VALUES ($1, $2, $3)
			RETURNING conversation_id
		)
		UPDATE chat_conversations
		   SET updated_at = now()
		 WHERE id = $1
	`, conversationID, role, content)
	return err
}

// ListConversations returns the user's conversations newest-first.
// limit defaults to 25 if <= 0; capped at 100 by callers.
func (r *ChatRepo) ListConversations(ctx context.Context, userID string, limit int) ([]ChatConversation, error) {
	if limit <= 0 {
		limit = 25
	}
	rows, err := r.db.Query(ctx, `
		SELECT id, user_id, COALESCE(session_id, ''), COALESCE(title, ''), created_at, updated_at
		  FROM chat_conversations
		 WHERE user_id = $1
		 ORDER BY updated_at DESC
		 LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ChatConversation{}
	for rows.Next() {
		var c ChatConversation
		if err := rows.Scan(&c.ID, &c.UserID, &c.SessionID, &c.Title, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetMessages returns every message in a conversation, oldest first.
// Owner-scoped via a JOIN — a request for someone else's conversation_id
// returns an empty list, not a 500, which is the safest default.
func (r *ChatRepo) GetMessages(ctx context.Context, userID string, conversationID int64) ([]ChatStoredMessage, error) {
	rows, err := r.db.Query(ctx, `
		SELECT m.id, m.role, m.content, m.created_at
		  FROM chat_messages m
		  JOIN chat_conversations c ON c.id = m.conversation_id
		 WHERE c.id = $1 AND c.user_id = $2
		 ORDER BY m.created_at ASC, m.id ASC
	`, conversationID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []ChatStoredMessage{}
	for rows.Next() {
		var m ChatStoredMessage
		if err := rows.Scan(&m.ID, &m.Role, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
