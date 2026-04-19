/**
 * Hook for message management — push-driven, zero polling.
 *
 * Data flow:
 * 1. Initial load: GET /api/messages (one-time D1 query on mount)
 * 2. Real-time: Web Push → Service Worker → postMessage → ingestPushed()
 *    (messages arrive pre-encrypted in the push payload, decrypted locally)
 * 3. Focus refresh: only when returning after >5min away (safety net)
 *
 * No setInterval. No polling. D1 is queried only on initial load.
 */

import { useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore, type PushedEncryptedMessage } from "@/stores/message-store";
import { isNativePlatform } from "@/lib/platform";

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

  // Listen for pushed messages from Service Worker
  // This is the PRIMARY data path for new messages — no polling needed
  useEffect(() => {
    if (!privateKeyHex) return;

    const handleSWMessage = (event: MessageEvent) => {
      const data = event.data;

      if (data?.type === "PUSH_MESSAGE" && data.message) {
        // New format: full encrypted message in push payload
        // Decrypt and insert directly — zero D1 queries
        const pushed: PushedEncryptedMessage = data.message;
        ingestPushed(privateKeyHex, pushed);
      } else if (data?.type === "NEW_PUSH_MESSAGE") {
        // Legacy fallback: push only contained metadata
        // Must do a server fetch (queries D1)
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

  // Track when the tab goes hidden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
      } else if (document.visibilityState === "visible") {
        // Only refresh from server if we were away for >5min
        // This handles the case where push messages were missed while sleeping
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

  // Native (Capacitor): refresh when coming back to foreground after long absence
  useEffect(() => {
    let removeListener: (() => void) | undefined;

    if (isNativePlatform) {
      let lastPaused = 0;
      import("@capacitor/app").then(({ App }) => {
        App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            lastPaused = Date.now();
          } else if (Date.now() - lastPaused > STALE_THRESHOLD) {
            serverRefresh();
          }
        }).then((handle) => {
          removeListener = () => handle.remove();
        });
      });
    }

    return () => {
      removeListener?.();
    };
  }, [serverRefresh]);

  return { messages, loading, refresh: serverRefresh };
}
