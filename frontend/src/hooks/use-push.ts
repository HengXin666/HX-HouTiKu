/**
 * Hook for push subscription management — works on both Web and Native Android.
 */

import { useCallback, useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  registerPushSubscription,
  requestNotificationPermission,
} from "@/lib/push";
import { isNativePlatform, getNativeBridge } from "@/lib/platform";

export function usePush() {
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const pushEnabled = useSettingsStore((s) => s.pushEnabled);
  const setPushEnabled = useSettingsStore((s) => s.setPushEnabled);
  const [loading, setLoading] = useState(false);

  // On native, auto-register push when token is available and push is enabled
  useEffect(() => {
    if (isNativePlatform && pushEnabled && recipientToken) {
      registerPushSubscription(recipientToken).catch(console.error);
    }
  }, [pushEnabled, recipientToken]);

  // On native Android, also cache the recipient token to SharedPreferences
  // so the FCM service can re-register on token refresh
  useEffect(() => {
    if (isNativePlatform && recipientToken) {
      try {
        // The WebView's localStorage is accessible, but we also want to
        // ensure the native service has access via SharedPreferences.
        // The registerFcmPush bridge call handles this implicitly through
        // the HTTP call, but for token refresh in background we need the
        // native side to have the credentials cached.
        //
        // This is handled by the native registerFcmPush which caches
        // apiBase and recipientToken when called.
      } catch {
        // non-critical
      }
    }
  }, [recipientToken]);

  const enable = useCallback(async () => {
    if (!recipientToken) return false;

    setLoading(true);
    try {
      // On native Android, we need notification permission first
      const permission = await requestNotificationPermission();
      if (permission !== "granted") {
        setLoading(false);
        return false;
      }

      const ok = await registerPushSubscription(recipientToken);
      if (ok) {
        await setPushEnabled(true);
      }
      setLoading(false);
      return ok;
    } catch {
      setLoading(false);
      return false;
    }
  }, [recipientToken, setPushEnabled]);

  const disable = useCallback(async () => {
    await setPushEnabled(false);
  }, [setPushEnabled]);

  // Helper to check current notification status on native
  const getNotificationStatus = useCallback((): string => {
    const bridge = getNativeBridge();
    if (bridge) {
      return bridge.getNotificationStatus();
    }
    if ("Notification" in window) {
      return Notification.permission;
    }
    return "default";
  }, []);

  return { pushEnabled, enable, disable, loading, getNotificationStatus };
}
