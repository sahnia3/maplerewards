-- Chat history persistence for authenticated users.
--
-- The free-tier monthly quota bump (1 → 5 msgs/mo) only works as a retention
-- play if users can actually scroll back and see what the AI told them last
-- time. Anonymous users remain ephemeral by design — only authenticated
-- conversations get persisted.
--
-- The task spec references auth_users(id); this codebase uses the `users`
-- table (see migrations/000001_schema.up.sql) so we wire the FK there.

CREATE TABLE chat_conversations (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id  TEXT,
    title       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE chat_messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for "list my conversations newest first" — the main read path on the
-- chat sidebar.
CREATE INDEX idx_chat_conv_user ON chat_conversations(user_id, updated_at DESC);

-- Index for "load all messages in this conversation" — sorted by created_at
-- so the rebuilt thread renders in chronological order.
CREATE INDEX idx_chat_msg_conv ON chat_messages(conversation_id, created_at);
