/**
 * Hook for message management — orchestrates data from three layers.
 *
 * Layer 1: WS (ws-manager global singleton) → wsOnMessage → decrypt → addMessage
 * Layer 2: Service Worker push → postMessage → decrypt → addMessage
 * Layer 3: GET /api/messages on initial load + focus recovery after >5 min
 *
 * This hook does NOT own the WebSocket connection.
 * ws-manager is initialized/destroyed in App.tsx based on auth state.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore, type Message } from "@/stores/message-store";
import { useWebSocket } from "./use-websocket";
import { wsOnMessage, wsWasStale, type WsNewMessagePayload } from "@/lib/ws-manager";
import { decryptMessage } from "@/lib/crypto";

export function useMessages() {
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);
  const fetchAndDecrypt = useMessageStore((s) => s.fetchAndDecrypt);
  const addMessage = useMessageStore((s) => s.addMessage);
  const loadCached = useMessageStore((s) => s.loadCached);
  const messages = useMessageStore((s) => s.messages);
  const loading = useMessageStore((s) => s.loading);

  // WS status (read-only, from ws-manager via useSyncExternalStore)
  const { status: wsStatus, deviceCount } = useWebSocket();

  // Refs to avoid re-creating callbacks when auth values change
  const privateKeyRef = useRef(privateKeyHex);
  privateKeyRef.current = privateKeyHex;
  const tokenRef = useRef(recipientToken);
  tokenRef.current = recipientToken;

  // Stable addMessage ref
  const addMessageRef = useRef(addMessage);
  addMessageRef.current = addMessage;
  const fetchRef = useRef(fetchAndDecrypt);
  fetchRef.current = fetchAndDecrypt;

  /** Decrypt a pushed encrypted payload and insert into the store. */
  const decryptAndInsert = useCallback(
    (payload: WsNewMessagePayload, source: string) => {
      const pkHex = privateKeyRef.current;
      if (!pkHex) return;

      try {
        const plain = decryptMessage(pkHex, payload.encrypted_data);
        const msg: Message = {
          id: payload.id,
          title: plain.title,
          body: plain.body,
          priority: payload.priority,
          group: payload.group,
          channel_id: payload.channel_id ?? "default",
          group_key: payload.group_key ?? "",
          timestamp: payload.timestamp,
          is_read: false,
          tags: plain.tags ?? [],
          source,
        };
        addMessageRef.current(msg);
      } catch (err) {
        console.error(`Failed to decrypt ${source} message:`, err);
      }
    },
    [],
  );

  // ── Layer 1: WebSocket real-time messages ──────────────────
  useEffect(() => {
    const unsub = wsOnMessage((payload) => {
      decryptAndInsert(payload, "ws");
    });
    return unsub;
  }, [decryptAndInsert]);

  // ── Layer 2: Service Worker push messages ──────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleSWMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type === "PUSH_MESSAGE" && data.message) {
        decryptAndInsert(data.message, "sw");
      } else if (data?.type === "NEW_PUSH_MESSAGE") {
        // SW says "there's a new push but I couldn't include the data"
        const t = tokenRef.current;
        const pk = privateKeyRef.current;
        if (t && pk) fetchRef.current(t, pk);
      }
    };

    navigator.serviceWorker.addEventListener("message", handleSWMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSWMessage);
    };
  }, [decryptAndInsert]);

  // ── Layer 3: Initial load + visibility catchup ─────────────
  useEffect(() => {
    loadCached();
    if (recipientToken && privateKeyHex) {
      fetchAndDecrypt(recipientToken, privateKeyHex);
    }
    // Only run on mount (deps are stable store actions + auth values at mount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Catchup after long absence (visibility change)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      // Only fetch from server if we were hidden long enough to be stale
      if (!wsWasStale()) return;
      const t = tokenRef.current;
      const pk = privateKeyRef.current;
      if (t && pk) fetchRef.current(t, pk);
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  /** Manual refresh — for pull-to-refresh or retry button. */
  const refresh = useCallback(() => {
    const t = tokenRef.current;
    const pk = privateKeyRef.current;
    if (t && pk) fetchRef.current(t, pk);
  }, []);

  return { messages, loading, refresh, wsStatus, deviceCount };
}
