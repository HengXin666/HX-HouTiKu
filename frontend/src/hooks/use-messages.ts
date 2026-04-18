/**
 * Hook for fetching and decrypting messages with auto-refresh.
 */

import { useEffect, useCallback, useRef } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";

const POLL_INTERVAL = 60_000; // 1 minute

export function useMessages() {
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);
  const fetchAndDecrypt = useMessageStore((s) => s.fetchAndDecrypt);
  const loadCached = useMessageStore((s) => s.loadCached);
  const messages = useMessageStore((s) => s.messages);
  const loading = useMessageStore((s) => s.loading);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

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

  // Refresh on window focus
  useEffect(() => {
    const handleFocus = () => refresh();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  return { messages, loading, refresh };
}
