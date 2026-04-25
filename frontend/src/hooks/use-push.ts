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
import { getApiBase } from "@/lib/api";

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
  // so the native WS service can auto-restart after reboot
  useEffect(() => {
    if (isNativePlatform && recipientToken) {
      const bridge = getNativeBridge();
      if (bridge) {
        // saveApiBase 会将 URL 持久化到 SharedPreferences
        // BootReceiver 在开机后读取这些凭据来重启 WS 服务
        getApiBase().then((apiBase) => {
          if (apiBase) bridge.saveApiBase(apiBase);
        }).catch(() => {});
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
