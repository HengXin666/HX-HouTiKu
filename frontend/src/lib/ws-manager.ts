/**
 * Global WebSocket Manager — singleton, zero React dependency.
 *
 * This module owns the ONLY WebSocket connection in the entire app.
 * It is initialized once at app startup and never torn down by
 * component mount/unmount cycles.
 *
 * Architecture:
 *   - One WS connection per app session (not per component)
 *   - Heartbeat ping/pong every 25s
 *   - Exponential backoff reconnect: 1s → 2s → 4s → ... → 30s cap
 *   - Visibility-aware: instant reconnect when tab wakes from sleep
 *   - External listeners subscribe via onMessage / onStatusChange
 */

import { getApiBase } from "./api";

// ─── Types ───────────────────────────────────────────────────

export type WsStatus = "idle" | "connecting" | "connected" | "disconnected";

export interface WsNewMessagePayload {
  id: string;
  encrypted_data: string;
  priority: string;
  content_type: string;
  group: string;
  channel_id?: string;
  group_key?: string;
  timestamp: number;
  is_read: boolean;
}

type MessageListener = (msg: WsNewMessagePayload) => void;
type StatusListener = (status: WsStatus, deviceCount: number) => void;

// ─── Constants ───────────────────────────────────────────────

const HEARTBEAT_MS = 25_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_CAP_MS = 30_000;
// After being hidden this long, do a server catchup on wake
const STALE_MS = 5 * 60_000;

// ─── Module State (singleton) ────────────────────────────────

let ws: WebSocket | null = null;
let status: WsStatus = "idle";
let deviceCount = 0;
let token: string | null = null;

let heartbeatId: ReturnType<typeof setInterval> | null = null;
let reconnectId: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let hiddenSince: number | null = null;
let initialized = false;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();

// ─── Internal helpers ────────────────────────────────────────

function setStatus(next: WsStatus) {
  if (status === next) return;
  status = next;
  for (const fn of statusListeners) fn(status, deviceCount);
}

function clearTimers() {
  if (heartbeatId !== null) {
    clearInterval(heartbeatId);
    heartbeatId = null;
  }
  if (reconnectId !== null) {
    clearTimeout(reconnectId);
    reconnectId = null;
  }
}

function closeSocket() {
  if (!ws) return;
  // Detach handlers first to prevent onclose from triggering reconnect
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
  try { ws.close(); } catch { /* ignore */ }
  ws = null;
}

function scheduleReconnect() {
  if (reconnectId !== null) return; // already scheduled
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_CAP_MS);
  reconnectAttempt++;
  reconnectId = setTimeout(() => {
    reconnectId = null;
    doConnect();
  }, delay);
}

async function doConnect() {
  if (!token) return;
  if (ws && ws.readyState === WebSocket.OPEN) return;

  clearTimers();
  closeSocket();
  setStatus("connecting");

  try {
    const apiBase = await getApiBase();
    const wsBase = apiBase.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    const url = `${wsBase}/api/ws?token=${encodeURIComponent(token)}`;
    const socket = new WebSocket(url);
    ws = socket;

    socket.onopen = () => {
      reconnectAttempt = 0;
      setStatus("connected");

      heartbeatId = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ping" }));
        }
      }, HEARTBEAT_MS);
    };

    socket.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "new_message" && data.message) {
          for (const fn of messageListeners) fn(data.message);
        } else if (data.type === "message_deleted" && data.message_ids) {
          for (const fn of deleteListeners) fn({ message_ids: data.message_ids });
        } else if (data.type === "connected") {
          deviceCount = data.device_count ?? 1;
          for (const fn of statusListeners) fn(status, deviceCount);
        }
        // pong — no-op
      } catch { /* malformed message, ignore */ }
    };

    socket.onclose = () => {
      clearTimers();
      ws = null;
      setStatus("disconnected");
      scheduleReconnect();
    };

    socket.onerror = () => {
      // onclose fires after onerror, so reconnect is handled there
    };
  } catch {
    setStatus("disconnected");
    scheduleReconnect();
  }
}

function handleVisibility() {
  if (document.visibilityState === "hidden") {
    hiddenSince = Date.now();
    return;
  }

  // visible
  const away = hiddenSince;
  hiddenSince = null;

  // Always try to reconnect if WS is down
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    reconnectAttempt = 0;
    clearTimers();
    doConnect();
  }

  // If away for a long time, notify listeners to do a server catchup
  if (away && Date.now() - away > STALE_MS) {
    for (const fn of statusListeners) fn(status, deviceCount);
  }
}

// ─── Public API ──────────────────────────────────────────────

/** Initialize the WS manager. Call once at app startup. Idempotent. */
export function wsInit(recipientToken: string) {
  token = recipientToken;
  if (!initialized) {
    initialized = true;
    document.addEventListener("visibilitychange", handleVisibility);
  }
  // If already connected with same token, skip
  if (ws && ws.readyState === WebSocket.OPEN) return;
  doConnect();
}

/** Tear down completely (e.g. on logout / reset). */
export function wsDestroy() {
  clearTimers();
  closeSocket();
  token = null;
  status = "idle";
  deviceCount = 0;
  reconnectAttempt = 0;
  hiddenSince = null;
  for (const fn of statusListeners) fn(status, deviceCount);
}

/** Subscribe to new_message events. Returns unsubscribe function. */
export function wsOnMessage(fn: MessageListener): () => void {
  messageListeners.add(fn);
  return () => { messageListeners.delete(fn); };
}

/** Subscribe to status changes. Returns unsubscribe function. */
export function wsOnStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => { statusListeners.delete(fn); };
}

/** Read current status snapshot (for useSyncExternalStore). */
export function wsGetStatus(): WsStatus {
  return status;
}

export function wsGetDeviceCount(): number {
  return deviceCount;
}

/** Check if we've been hidden long enough to need a server catchup. */
export function wsWasStale(): boolean {
  return hiddenSince !== null && Date.now() - hiddenSince > STALE_MS;
}
