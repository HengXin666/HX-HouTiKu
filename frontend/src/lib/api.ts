/**
 * API client for communicating with the Cloudflare Worker backend.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

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

  const res = await fetch(`${API_BASE}${path}`, {
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
