/**
 * Hook for push subscription management — works on both Web and Native.
 */

import { useCallback, useState, useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  registerPushSubscription,
  requestNotificationPermission,
} from "@/lib/push";
import { isNativePlatform } from "@/lib/platform";

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

  const enable = useCallback(async () => {
    if (!recipientToken) return false;

    setLoading(true);
    try {
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

  return { pushEnabled, enable, disable, loading };
}
