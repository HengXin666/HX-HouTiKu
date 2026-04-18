export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_PUBLIC_KEY: string;
  ENCRYPTION_CURVE: string;
}

// --- DB Row Types ---

export interface RecipientRow {
  id: string;
  name: string;
  public_key: string;
  groups: string; // JSON array string
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  recipient_id: string;
  encrypted_data: string;
  priority: Priority;
  group_name: string;
  timestamp: number;
  is_read: number;
  expires_at: number;
  created_at: number;
}

export interface PushSubscriptionRow {
  id: string;
  recipient_id: string;
  endpoint: string;
  key_p256dh: string;
  key_auth: string;
  user_agent: string | null;
  created_at: number;
}

export interface ApiTokenRow {
  id: string;
  token_hash: string;
  name: string;
  permissions: string;
  is_active: number;
  created_at: number;
  last_used_at: number;
}

// --- API Request/Response Types ---

export type Priority = "urgent" | "high" | "default" | "low" | "debug";

export interface PushRequest {
  id?: string;
  recipients?: string[];
  encrypted_payloads: Record<string, string>;
  priority?: Priority;
  group?: string;
  timestamp?: number;
}

export interface MessagesQuery {
  since?: number;
  limit?: number;
  group?: string;
  priority?: Priority;
}

export interface RecipientCreateRequest {
  name: string;
  public_key: string;
  groups?: string[];
}

export interface SubscribeRequest {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface ReadRequest {
  message_ids: string[];
}
