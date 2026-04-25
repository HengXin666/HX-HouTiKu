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
import { isNativeAndroid } from "./platform";

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

export interface WsDeletePayload {
  message_ids: string[];
}

export interface WsStarSyncPayload {
  message_ids: string[];
  starred: boolean;
}

type MessageListener = (msg: WsNewMessagePayload) => void;
type DeleteListener = (payload: WsDeletePayload) => void;
type StarSyncListener = (payload: WsStarSyncPayload) => void;
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
const deleteListeners = new Set<DeleteListener>();
const starSyncListeners = new Set<StarSyncListener>();
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
  // Android 上由原生 HxWebSocketService 维护唯一的 WS 连接
  // WebView 内不再建立 JS WS，避免重复连接占用服务端资源
  // 不再乐观设置 connected，而是设置 connecting 等待原生服务的实际状态回调
  // 参考: https://developer.android.com/reference/android/webkit/WebView#addJavascriptInterface
  if (isNativeAndroid) {
    setStatus("connecting");
    return;
  }
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
        } else if (data.type === "star_sync" && data.message_ids) {
          for (const fn of starSyncListeners) fn({ message_ids: data.message_ids, starred: data.starred });
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

  // Android: 原生服务维护 WS 连接，不需要 JS 端重连
  // 仅在非 connected 状态时设置 connecting，避免覆盖已有的 connected 状态
  if (isNativeAndroid) {
    if (status !== "connected") {
      setStatus("connecting");
    }
  } else {
    // Web: 如果 WS 断开，立即重连
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reconnectAttempt = 0;
      clearTimers();
      doConnect();
    }
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

    // Android: 原生 HxWebSocketService 通过 Broadcast → MainActivity → evaluateJavascript
    // 将消息转发到 window.__hxNativeWsMessage 回调
    if (isNativeAndroid) {
      window.__hxNativeWsMessage = (data: string) => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "new_message" && parsed.message) {
            for (const fn of messageListeners) fn(parsed.message);
          } else if (parsed.type === "message_deleted" && parsed.message_ids) {
            for (const fn of deleteListeners) fn({ message_ids: parsed.message_ids });
          } else if (parsed.type === "star_sync" && parsed.message_ids) {
            for (const fn of starSyncListeners) fn({ message_ids: parsed.message_ids, starred: parsed.starred });
          } else if (parsed.type === "connected") {
            deviceCount = parsed.device_count ?? 1;
            // 收到 connected 类型的 WS 消息也意味着连接已建立
            setStatus("connected");
          }
        } catch { /* ignore */ }
      };
      window.__hxNativeWsStatus = (s: string) => {
        if (s === "connected") setStatus("connected");
        else if (s === "disconnected") setStatus("disconnected");
        else if (s === "error") setStatus("disconnected");
      };
    }
  }
  // If already connected with same token, skip
  // Android: ws 始终为 null，通过 status 判断是否已连接
  if (isNativeAndroid) {
    if (status !== "connected") doConnect();
    return;
  }
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

/** Subscribe to message_deleted events. Returns unsubscribe function. */
export function wsOnDelete(fn: DeleteListener): () => void {
  deleteListeners.add(fn);
  return () => { deleteListeners.delete(fn); };
}

/** Subscribe to star_sync events. Returns unsubscribe function. */
export function wsOnStarSync(fn: StarSyncListener): () => void {
  starSyncListeners.add(fn);
  return () => { starSyncListeners.delete(fn); };
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
