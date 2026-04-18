-- ============================================================
--  Unified Push — D1 Database Schema
-- ============================================================

-- 1. Recipients (stores each user's public key and config)
CREATE TABLE IF NOT EXISTS recipients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL UNIQUE,
    groups TEXT DEFAULT '["general"]',
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 2. Messages (core table, stores encrypted payloads)
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    encrypted_data TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'default',
    group_name TEXT NOT NULL DEFAULT 'general',
    timestamp INTEGER NOT NULL,
    is_read INTEGER DEFAULT 0,
    expires_at INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (recipient_id) REFERENCES recipients(id)
);

CREATE INDEX IF NOT EXISTS idx_msg_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_msg_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_msg_priority ON messages(priority);
CREATE INDEX IF NOT EXISTS idx_msg_group ON messages(group_name);
CREATE INDEX IF NOT EXISTS idx_msg_unread ON messages(recipient_id, is_read);

-- 3. Web Push Subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    key_p256dh TEXT NOT NULL,
    key_auth TEXT NOT NULL,
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (recipient_id) REFERENCES recipients(id)
);

CREATE INDEX IF NOT EXISTS idx_sub_recipient ON push_subscriptions(recipient_id);

-- 4. API Tokens
CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    permissions TEXT DEFAULT '["push"]',
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER DEFAULT 0
);
