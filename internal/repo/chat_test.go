package repo

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// chatTestDB is the integration-test connection. Skipped unless
// MAPLEREWARDS_TEST_DB is set — keeps `go test ./...` green on CI without a
// live Postgres but lets devs run repo tests locally with one env var.
func chatTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("MAPLEREWARDS_TEST_DB")
	if dsn == "" {
		t.Skip("MAPLEREWARDS_TEST_DB not set — skipping repo integration test")
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("pgxpool connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// seedTestUser creates a throwaway anonymous user and returns its UUID.
// All test conversations FK to this row so the ON DELETE CASCADE cleans up
// automatically when the user is dropped at test end.
func seedTestUser(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	ctx := context.Background()
	var id string
	// session_id is UNIQUE so we mint a fresh one per test invocation.
	sessionID := "test-chat-" + time.Now().UTC().Format("20060102T150405.000000")
	err := pool.QueryRow(ctx, `
		INSERT INTO users (session_id) VALUES ($1) RETURNING id::text
	`, sessionID).Scan(&id)
	if err != nil {
		t.Fatalf("seed user: %v", err)
	}
	t.Cleanup(func() {
		// Cascade deletes the conversations + messages we created.
		_, _ = pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	})
	return id
}

func TestChatRepo_CreateConversation(t *testing.T) {
	pool := chatTestDB(t)
	userID := seedTestUser(t, pool)
	repo := NewChatRepo(pool)

	c, err := repo.CreateConversation(context.Background(), userID, "", "How do I book ANA business YYZ→HND?")
	if err != nil {
		t.Fatalf("CreateConversation: %v", err)
	}
	if c.ID == 0 {
		t.Fatalf("expected non-zero ID, got %d", c.ID)
	}
	if c.UserID != userID {
		t.Errorf("user_id mismatch: got %q want %q", c.UserID, userID)
	}
	if c.Title == "" {
		t.Error("title should be set")
	}
	if c.CreatedAt.IsZero() || c.UpdatedAt.IsZero() {
		t.Error("timestamps should be populated")
	}
}

func TestChatRepo_AppendMessage(t *testing.T) {
	pool := chatTestDB(t)
	userID := seedTestUser(t, pool)
	repo := NewChatRepo(pool)
	ctx := context.Background()

	c, err := repo.CreateConversation(ctx, userID, "", "test")
	if err != nil {
		t.Fatalf("CreateConversation: %v", err)
	}

	if err := repo.AppendMessage(ctx, c.ID, "user", "hello"); err != nil {
		t.Fatalf("AppendMessage user: %v", err)
	}
	if err := repo.AppendMessage(ctx, c.ID, "assistant", "hi back"); err != nil {
		t.Fatalf("AppendMessage assistant: %v", err)
	}

	msgs, err := repo.GetMessages(ctx, userID, c.ID)
	if err != nil {
		t.Fatalf("GetMessages: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}
	if msgs[0].Role != "user" || msgs[0].Content != "hello" {
		t.Errorf("msg[0] mismatch: %+v", msgs[0])
	}
	if msgs[1].Role != "assistant" || msgs[1].Content != "hi back" {
		t.Errorf("msg[1] mismatch: %+v", msgs[1])
	}

	// AppendMessage must reject roles outside the CHECK constraint set.
	if err := repo.AppendMessage(ctx, c.ID, "tool", "should fail"); err == nil {
		t.Error("expected CHECK constraint violation for role='tool'")
	}
}

func TestChatRepo_ListConversations(t *testing.T) {
	pool := chatTestDB(t)
	userID := seedTestUser(t, pool)
	repo := NewChatRepo(pool)
	ctx := context.Background()

	// Create 3 conversations, separated so updated_at order is deterministic.
	titles := []string{"first", "second", "third"}
	ids := make([]int64, 0, len(titles))
	for _, title := range titles {
		c, err := repo.CreateConversation(ctx, userID, "", title)
		if err != nil {
			t.Fatalf("CreateConversation %q: %v", title, err)
		}
		ids = append(ids, c.ID)
		time.Sleep(10 * time.Millisecond) // ensure distinct timestamps
	}

	convos, err := repo.ListConversations(ctx, userID, 10)
	if err != nil {
		t.Fatalf("ListConversations: %v", err)
	}
	if len(convos) != 3 {
		t.Fatalf("expected 3 conversations, got %d", len(convos))
	}
	// updated_at DESC — newest ("third") first.
	if convos[0].Title != "third" || convos[2].Title != "first" {
		t.Errorf("order wrong: got titles %q, %q, %q", convos[0].Title, convos[1].Title, convos[2].Title)
	}

	// AppendMessage on the oldest should bump it to the top.
	if err := repo.AppendMessage(ctx, ids[0], "user", "bump"); err != nil {
		t.Fatalf("AppendMessage: %v", err)
	}
	convos, err = repo.ListConversations(ctx, userID, 10)
	if err != nil {
		t.Fatalf("ListConversations after bump: %v", err)
	}
	if convos[0].Title != "first" {
		t.Errorf("expected 'first' on top after AppendMessage bumped updated_at, got %q", convos[0].Title)
	}

	// Limit clamp: limit=1 returns only 1 row.
	convos, err = repo.ListConversations(ctx, userID, 1)
	if err != nil {
		t.Fatalf("ListConversations limit=1: %v", err)
	}
	if len(convos) != 1 {
		t.Errorf("expected 1 conversation with limit=1, got %d", len(convos))
	}

	// Cross-user isolation: a different user gets empty.
	otherID := seedTestUser(t, pool)
	convos, err = repo.ListConversations(ctx, otherID, 10)
	if err != nil {
		t.Fatalf("ListConversations other user: %v", err)
	}
	if len(convos) != 0 {
		t.Errorf("expected 0 conversations for unrelated user, got %d", len(convos))
	}
}
