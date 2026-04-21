/**
 * WebSocket hook — connects to the Durable Object WebSocket relay.
 *
 * Features:
 *   - Automatic connection on mount (when token available)
 *   - Heartbeat ping/pong every 30s to detect dead connections
 *   - Exponential backoff reconnect (1s → 2s → 4s → ... → 30s cap)
 *   - Visibility-aware: reconnects when tab becomes visible after sleep
 *   - Integrates with message store for real-time message delivery
 *
 * This is the primary real-time data channel, replacing Web Push as Layer 1.
 * Web Push/FCM remain as Layer 2 (offline/background notifications).
 */

import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore, type PushedEncryptedMessage } from "@/stores/message-store";
import { getApiBase } from "@/lib/api";

export type WsStatus = "connecting" | "connected" | "disconnected" | "error";

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds
const RECONNECT_BASE = 1_000; // 1 second
const RECONNECT_CAP = 30_000; // 30 seconds max

interface UseWebSocketReturn {
  status: WsStatus;
  deviceCount: number;
}

/** Shared state for the single WebSocket connection */
let _ws: WebSocket | null = null;
let _status: WsStatus = "disconnected";
let _deviceCount = 0;
let _listeners = new Set<() => void>();

function notify() {
  _listeners.forEach((fn) => fn());
}

export function useWebSocket(): UseWebSocketReturn {
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);
  const ingestPushed = useMessageStore((s) => s.ingestPushed);

  const reconnectAttempt = useRef(0);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval>>();
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
  const privateKeyRef = useRef(privateKeyHex);
  const ingestRef = useRef(ingestPushed);

  // Keep refs up to date
  privateKeyRef.current = privateKeyHex;
  ingestRef.current = ingestPushed;

  // Force re-render when WS state changes
  const forceUpdate = useCallback(() => {}, []);

  useEffect(() => {
    _listeners.add(forceUpdate);
    return () => { _listeners.delete(forceUpdate); };
  }, [forceUpdate]);

  const cleanup = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = undefined;
    }
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = undefined;
    }
    if (_ws) {
      _ws.onclose = null;
      _ws.onerror = null;
      _ws.onmessage = null;
      _ws.close();
      _ws = null;
    }
  }, []);

  const connect = useCallback(async () => {
    if (!recipientToken) return;
    if (_ws && _ws.readyState === WebSocket.OPEN) return;

    cleanup();

    _status = "connecting";
    notify();

    try {
      const apiBase = await getApiBase();
      // Convert HTTP(S) URL to WS(S) URL
      const wsBase = apiBase
        .replace(/^https:/, "wss:")
        .replace(/^http:/, "ws:");

      const wsUrl = `${wsBase}/api/ws?token=${encodeURIComponent(recipientToken)}`;
      const ws = new WebSocket(wsUrl);
      _ws = ws;

      ws.onopen = () => {
        _status = "connected";
        reconnectAttempt.current = 0;
        notify();

        // Start heartbeat
        heartbeatTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, HEARTBEAT_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "new_message": {
              // Real-time message — decrypt and insert via store
              const pushed: PushedEncryptedMessage = data.message;
              const pkHex = privateKeyRef.current;
              if (pkHex) {
                ingestRef.current(pkHex, pushed);
              }
              break;
            }
            case "connected":
              _deviceCount = data.device_count ?? 1;
              notify();
              break;
            case "pong":
              // Heartbeat acknowledged — connection is healthy
              break;
          }
        } catch {
          // Invalid message format — ignore
        }
      };

      ws.onclose = () => {
        _status = "disconnected";
        _ws = null;
        notify();

        if (heartbeatTimer.current) {
          clearInterval(heartbeatTimer.current);
        }

        // Schedule reconnect with exponential backoff
        scheduleReconnect();
      };

      ws.onerror = () => {
        _status = "error";
        notify();
        // onclose will fire after onerror, so reconnect is handled there
      };
    } catch {
      _status = "error";
      notify();
      scheduleReconnect();
    }

    function scheduleReconnect() {
      const delay = Math.min(
        RECONNECT_BASE * 2 ** reconnectAttempt.current,
        RECONNECT_CAP
      );
      reconnectAttempt.current++;
      reconnectTimer.current = setTimeout(connect, delay);
    }
  }, [recipientToken, cleanup]);

  // Connect on mount, reconnect when token changes
  useEffect(() => {
    connect();
    return cleanup;
  }, [connect, cleanup]);

  // Reconnect when tab becomes visible (handles sleep/hibernate)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (!_ws || _ws.readyState !== WebSocket.OPEN) {
          reconnectAttempt.current = 0; // Reset backoff
          connect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [connect]);

  return {
    status: _status,
    deviceCount: _deviceCount,
  };
}
