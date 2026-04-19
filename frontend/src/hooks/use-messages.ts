/**
 * Hook for fetching and decrypting messages with auto-refresh.
 * Works on both Web (window focus) and Native (Capacitor appStateChange).
 */

import { useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import { isNativePlatform } from "@/lib/platform";

const POLL_INTERVAL = 60_000; // 1 minute

export function useMessages() {
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);
  const fetchAndDecrypt = useMessageStore((s) => s.fetchAndDecrypt);
  const loadCached = useMessageStore((s) => s.loadCached);
  const messages = useMessageStore((s) => s.messages);
  const loading = useMessageStore((s) => s.loading);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const refresh = useCallback(() => {
    if (!recipientToken || !privateKeyHex) return;
    fetchAndDecrypt(recipientToken, privateKeyHex);
  }, [recipientToken, privateKeyHex, fetchAndDecrypt]);

  // Initial load
  useEffect(() => {
    loadCached();
    refresh();
  }, [loadCached, refresh]);

  // Polling
  useEffect(() => {
    intervalRef.current = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, [refresh]);

  // Refresh on window/app focus
  useEffect(() => {
    // Web: listen for window focus
    const handleFocus = () => refresh();
    window.addEventListener("focus", handleFocus);

    // Native (Capacitor): listen for app coming to foreground
    let removeNativeListener: (() => void) | undefined;
    if (isNativePlatform) {
      import("@capacitor/app").then(({ App }) => {
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) refresh();
        }).then((handle) => {
          removeNativeListener = () => handle.remove();
        });
      });
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
      removeNativeListener?.();
    };
  }, [refresh]);

  return { messages, loading, refresh };
}
