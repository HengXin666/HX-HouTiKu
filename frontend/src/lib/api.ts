/**
 * API client for communicating with the Cloudflare Worker backend.
 * Supports dynamic API base URL from settings or env var.
 */

import { getPref } from "./db";

/** Get the API base URL — prioritizes settings store, falls back to env var. */
let _cachedApiBase: string | undefined;

export async function getApiBase(): Promise<string> {
  if (_cachedApiBase !== undefined) return _cachedApiBase;
  const stored = await getPref<string>("apiBase");
  const base: string = stored || import.meta.env.VITE_API_BASE || "";
  _cachedApiBase = base;
  return base;
}

/** Invalidate the cached API base (call after user changes it in settings). */
export function invalidateApiBaseCache() {
  _cachedApiBase = undefined;
}

interface ApiOptions {
  token?: string;
  signal?: AbortSignal;
}

async function request<T>(
  path: string,
  options: RequestInit & ApiOptions = {}
): Promise<T> {
  const { token, signal, ...init } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const apiBase = await getApiBase();

  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers,
    signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? "Unknown error");
  }

  return res.json();
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// --- Endpoints ---

export interface EncryptedMessage {
  id: string;
  encrypted_data: string;
  priority: string;
  group: string;
  channel_id: string;
  group_key: string;
  timestamp: number;
  is_read: boolean;
}

export interface MessagesResponse {
  messages: EncryptedMessage[];
  total_unread: number;
  has_more: boolean;
}

export function fetchMessages(
  token: string,
  params: { since?: number; limit?: number; group?: string; priority?: string } = {}
): Promise<MessagesResponse> {
  const query = new URLSearchParams();
  if (params.since) query.set("since", String(params.since));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.group) query.set("group", params.group);
  if (params.priority) query.set("priority", params.priority);
  const qs = query.toString();
  return request(`/api/messages${qs ? `?${qs}` : ""}`, { token });
}

export function markAsRead(
  token: string,
  messageIds: string[]
): Promise<{ updated: number }> {
  return request("/api/messages/read", {
    method: "POST",
    token,
    body: JSON.stringify({ message_ids: messageIds }),
  });
}

export interface ConfigResponse {
  vapid_public_key: string;
  version: string;
  encryption_curve: string;
}

export function fetchConfig(): Promise<ConfigResponse> {
  return request("/api/config");
}

export function registerRecipient(
  token: string,
  data: { name: string; public_key: string; groups?: string[] }
): Promise<{ id: string; recipient_token: string; name: string }> {
  return request("/api/recipients", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function subscribePush(
  token: string,
  subscription: PushSubscriptionJSON
): Promise<{ status: string }> {
  return request("/api/subscribe", {
    method: "POST",
    token,
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    }),
  });
}

export interface TestPushResponse {
  status: string;
  id: string;
  pushed_to: string[];
  ws_sent: string[];
  push_sent: string[];
  encryption_errors?: string[];
}

export function sendTestPush(
  adminToken: string,
  data: { title: string; body: string }
): Promise<TestPushResponse> {
  return request("/api/test-push", {
    method: "POST",
    token: adminToken,
    body: JSON.stringify(data),
  });
}

export interface TestPushSelfResponse {
  status: string;
  id: string;
  pushed_to: string[];
  ws_sent: boolean;
  push_sent: boolean;
}

/** Send a test push to yourself using Recipient Token (no Admin Token needed). */
export function sendTestPushSelf(
  recipientToken: string
): Promise<TestPushSelfResponse> {
  return request("/api/test-push/self", {
    method: "POST",
    token: recipientToken,
  });
}

// --- Channels API ---

export interface Channel {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
}

export function fetchChannels(
  token: string,
): Promise<{ channels: Channel[] }> {
  return request("/api/channels", { token });
}

export function createChannel(
  token: string,
  data: { name: string; display_name: string; description?: string; icon?: string; color?: string },
): Promise<{ id: string; name: string; display_name: string }> {
  return request("/api/channels", {
    method: "POST",
    token,
    body: JSON.stringify(data),
  });
}

export function deleteChannel(
  token: string,
  channelId: string,
): Promise<{ status: string; name: string }> {
  return request(`/api/channels/${channelId}`, {
    method: "DELETE",
    token,
  });
}
