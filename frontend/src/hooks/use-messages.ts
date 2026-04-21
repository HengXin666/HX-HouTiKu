/**
 * Hook for message management — WebSocket-first, push-driven, zero polling.
 *
 * Data flow (three layers):
 *   Layer 1: DO WebSocket → useWebSocket() → ingestPushed() [real-time, <100ms]
 *   Layer 2: Web Push → Service Worker → postMessage → ingestPushed() [offline fallback]
 *   Layer 3: GET /api/messages on initial load + focus recovery after >5min [catch-up]
 *
 * No setInterval. No polling. D1 is queried only on initial load / long absence.
 */

import { useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore, type PushedEncryptedMessage } from "@/stores/message-store";
import { useWebSocket } from "./use-websocket";

/** Only refresh from server if away for more than 5 minutes */
const STALE_THRESHOLD = 5 * 60_000;

export function useMessages() {
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);
  const fetchAndDecrypt = useMessageStore((s) => s.fetchAndDecrypt);
  const ingestPushed = useMessageStore((s) => s.ingestPushed);
  const loadCached = useMessageStore((s) => s.loadCached);
  const messages = useMessageStore((s) => s.messages);
  const loading = useMessageStore((s) => s.loading);
  const lastFetchRef = useRef(0);
  const hiddenSinceRef = useRef<number | null>(null);

  // Layer 1: WebSocket real-time connection (primary channel)
  const { status: wsStatus, deviceCount } = useWebSocket();

  /** Full server refresh (queries D1) — used sparingly */
  const serverRefresh = useCallback(() => {
    if (!recipientToken || !privateKeyHex) return;
    lastFetchRef.current = Date.now();
    fetchAndDecrypt(recipientToken, privateKeyHex);
  }, [recipientToken, privateKeyHex, fetchAndDecrypt]);

  // Initial load: cached first, then one server fetch
  useEffect(() => {
    loadCached();
    serverRefresh();
  }, [loadCached, serverRefresh]);

  // Layer 2: Listen for pushed messages from Service Worker (offline fallback)
  useEffect(() => {
    if (!privateKeyHex) return;

    const handleSWMessage = (event: MessageEvent) => {
      const data = event.data;

      if (data?.type === "PUSH_MESSAGE" && data.message) {
        const pushed: PushedEncryptedMessage = data.message;
        ingestPushed(privateKeyHex, pushed);
      } else if (data?.type === "NEW_PUSH_MESSAGE") {
        serverRefresh();
      }
    };

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSWMessage);
    }

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSWMessage);
      }
    };
  }, [privateKeyHex, ingestPushed, serverRefresh]);

  // Layer 3: Track visibility — refresh on return after long absence
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        const hiddenSince = hiddenSinceRef.current;
        hiddenSinceRef.current = null;
        if (hiddenSince && Date.now() - hiddenSince > STALE_THRESHOLD) {
          serverRefresh();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [serverRefresh]);

  return { messages, loading, refresh: serverRefresh, wsStatus, deviceCount };
}
