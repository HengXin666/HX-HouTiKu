-- ============================================================
--  HX-HouTiKu — D1 Database Schema (v2)
--
--  Changes from v1:
--    - New: channels table (grouping/categorization)
--    - messages: added channel_id, delivered_at, group_key
--    - push_subscriptions: added device_type
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

-- 2. Channels (message categorization / source grouping)
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '',
    color TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Default channel
INSERT OR IGNORE INTO channels (id, name, display_name, description, is_active, created_at, updated_at)
VALUES ('default', 'general', '通用', '默认消息频道', 1, 0, 0);

-- 3. Messages (core table, stores encrypted payloads — global, shared across all devices)
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL DEFAULT '',
    encrypted_data TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'default',
    content_type TEXT NOT NULL DEFAULT 'markdown',
    group_name TEXT NOT NULL DEFAULT 'general',
    channel_id TEXT DEFAULT 'default',
    group_key TEXT DEFAULT '',
    timestamp INTEGER NOT NULL,
    is_read INTEGER DEFAULT 0,
    delivered_at INTEGER DEFAULT 0,
    expires_at INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES channels(id)
);

CREATE INDEX IF NOT EXISTS idx_msg_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_msg_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_msg_priority ON messages(priority);
CREATE INDEX IF NOT EXISTS idx_msg_group ON messages(group_name);
CREATE INDEX IF NOT EXISTS idx_msg_unread ON messages(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_msg_channel ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_msg_group_key ON messages(group_key);
CREATE INDEX IF NOT EXISTS idx_msg_delivered ON messages(delivered_at);

-- 4. Web Push Subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    key_p256dh TEXT NOT NULL,
    key_auth TEXT NOT NULL,
    device_type TEXT NOT NULL DEFAULT 'web',
    user_agent TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (recipient_id) REFERENCES recipients(id)
);

CREATE INDEX IF NOT EXISTS idx_sub_recipient ON push_subscriptions(recipient_id);
CREATE INDEX IF NOT EXISTS idx_sub_device_type ON push_subscriptions(device_type);

-- 5. API Tokens
CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    permissions TEXT DEFAULT '["push"]',
    is_active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER DEFAULT 0
);

-- 6. Rate Limiting (sliding window counters — kept for potential D1-based rate limiting)
CREATE TABLE IF NOT EXISTS rate_limit_hits (
    bucket TEXT PRIMARY KEY,
    hit_count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL
);

-- 7. Clone Offers (temporary encrypted key bundles for device cloning)
CREATE TABLE IF NOT EXISTS clone_offers (
    code TEXT PRIMARY KEY,
    encrypted_bundle TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    claimed INTEGER DEFAULT 0
);
