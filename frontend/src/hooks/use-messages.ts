/**
 * Message hooks — split into two concerns:
 *
 * 1. useMessageReceiver() — global, mounted in AppShell (never unmounts).
 *    Wires up WS + SW listeners → decrypt → addMessage.
 *    Also handles initial load and visibility catchup.
 *
 * 2. useMessages() — page-level, returns messages + refresh + status.
 *    Thin read-only wrapper, safe to mount/unmount freely.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore, type Message } from "@/stores/message-store";
import { useWebSocket } from "./use-websocket";
import {
  wsOnMessage,
  wsOnDelete,
  wsWasStale,
  type WsNewMessagePayload,
} from "@/lib/ws-manager";
import { decryptMessage } from "@/lib/crypto";

// ─── Notification queue (consumed by NotificationToast) ──────

export type IncomingNotification = {
  id: string;
  title: string;
  body: string;
  priority: string;
  group: string;
  timestamp: number;
};

type NotifyListener = (n: IncomingNotification) => void;
const notifyListeners = new Set<NotifyListener>();

/** Subscribe to incoming message notifications. Returns unsubscribe fn. */
export function onIncomingNotification(fn: NotifyListener): () => void {
  notifyListeners.add(fn);
  return () => { notifyListeners.delete(fn); };
}

function emitNotification(msg: Message) {
  const n: IncomingNotification = {
    id: msg.id,
    title: msg.title,
    body: msg.body,
    priority: msg.priority,
    group: msg.group,
    timestamp: msg.timestamp,
  };
  for (const fn of notifyListeners) fn(n);
}

// ─── useMessageReceiver — GLOBAL (mount once in AppShell) ────

export function useMessageReceiver() {
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);
  const fetchAndDecrypt = useMessageStore((s) => s.fetchAndDecrypt);
  const addMessage = useMessageStore((s) => s.addMessage);
  const removeMessages = useMessageStore((s) => s.removeMessages);
  const loadCached = useMessageStore((s) => s.loadCached);

  // Refs to keep callbacks stable
  const pkRef = useRef(privateKeyHex);
  pkRef.current = privateKeyHex;
  const tokenRef = useRef(recipientToken);
  tokenRef.current = recipientToken;
  const addRef = useRef(addMessage);
  addRef.current = addMessage;
  const removeRef = useRef(removeMessages);
  removeRef.current = removeMessages;
  const fetchRef = useRef(fetchAndDecrypt);
  fetchRef.current = fetchAndDecrypt;

  /** Decrypt a raw WS/SW payload, insert into store, fire notification. */
  const decryptAndInsert = useCallback(
    (payload: WsNewMessagePayload, source: string) => {
      const pk = pkRef.current;
      if (!pk) return;
      try {
        const plain = decryptMessage(pk, payload.encrypted_data);
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
        addRef.current(msg);
        emitNotification(msg);
      } catch (err) {
        console.error(`Failed to decrypt ${source} message:`, err);
      }
    },
    [],
  );

  // Layer 1: WS real-time
  useEffect(() => {
    return wsOnMessage((payload) => decryptAndInsert(payload, "ws"));
  }, [decryptAndInsert]);

  // Layer 1b: WS delete sync — remove messages deleted by other devices
  useEffect(() => {
    return wsOnDelete((payload) => {
      removeRef.current(payload.message_ids);
    });
  }, []);

  // Layer 2: Service Worker push
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      const d = event.data;
      if (d?.type === "PUSH_MESSAGE" && d.message) {
        decryptAndInsert(d.message, "sw");
      } else if (d?.type === "NEW_PUSH_MESSAGE") {
        const t = tokenRef.current;
        const pk = pkRef.current;
        if (t && pk) fetchRef.current(t, pk);
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [decryptAndInsert]);

  // Layer 3: Initial load
  useEffect(() => {
    loadCached();
    if (recipientToken && privateKeyHex) {
      fetchAndDecrypt(recipientToken, privateKeyHex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Layer 3: Visibility catchup after long absence
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState !== "visible") return;
      if (!wsWasStale()) return;
      const t = tokenRef.current;
      const pk = pkRef.current;
      if (t && pk) fetchRef.current(t, pk);
    };

    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);
}

// ─── useMessages — PAGE-LEVEL (read-only) ────────────────────

export function useMessages() {
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);
  const fetchAndDecrypt = useMessageStore((s) => s.fetchAndDecrypt);
  const messages = useMessageStore((s) => s.messages);
  const loading = useMessageStore((s) => s.loading);

  const { status: wsStatus, deviceCount } = useWebSocket();

  const refresh = useCallback(() => {
    if (recipientToken && privateKeyHex) {
      fetchAndDecrypt(recipientToken, privateKeyHex);
    }
  }, [recipientToken, privateKeyHex, fetchAndDecrypt]);

  return { messages, loading, refresh, wsStatus, deviceCount };
}
