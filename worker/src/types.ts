export interface Env {
  DB: D1Database;
  ADMIN_TOKEN: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_PUBLIC_KEY: string;
  ENCRYPTION_CURVE: string;
  /** Firebase Cloud Messaging — service account JSON (base64-encoded). Required for Android native push. */
  FCM_SERVICE_ACCOUNT?: string;
  /** Durable Object namespace for real-time WebSocket message relay */
  MESSAGE_RELAY: DurableObjectNamespace;
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

export interface ChannelRow {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  is_active: number;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  recipient_id: string;
  encrypted_data: string;
  priority: Priority;
  content_type: ContentType;
  group_name: string;
  channel_id: string;
  group_key: string;
  timestamp: number;
  is_read: number;
  delivered_at: number;
  expires_at: number;
  created_at: number;
}

export interface PushSubscriptionRow {
  id: string;
  recipient_id: string;
  endpoint: string;
  key_p256dh: string;
  key_auth: string;
  device_type: DeviceType;
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
export type ContentType = "text" | "markdown" | "html" | "json";
export type DeviceType = "web" | "android" | "ios" | "desktop";

export interface PushRequest {
  id?: string;
  recipients?: string[];
  encrypted_payloads: Record<string, string>;
  priority?: Priority;
  group?: string;
  content_type?: ContentType;
  timestamp?: number;
  channel_id?: string;
  group_key?: string;
}

export interface MessagesQuery {
  since?: number;
  limit?: number;
  group?: string;
  priority?: Priority;
  channel_id?: string;
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
  device_type?: DeviceType;
}

export interface ReadRequest {
  message_ids: string[];
}

/** WebSocket message types (server → client) */
export interface WsNewMessage {
  type: "new_message";
  message: {
    id: string;
    encrypted_data: string;
    priority: string;
    content_type: string;
    group: string;
    timestamp: number;
    is_read: false;
    channel_id?: string;
    group_key?: string;
  };
}

/** WebSocket message types (server → client): delete sync */
export interface WsDeleteMessage {
  type: "message_deleted";
  message_ids: string[];
}

export interface ChannelCreateRequest {
  name: string;
  display_name: string;
  description?: string;
  icon?: string;
  color?: string;
}
