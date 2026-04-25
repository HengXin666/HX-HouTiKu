/**
 * Push notification management — Web Push + Native FCM.
 *
 * - On Android WebView: uses the native JS Bridge to register FCM push.
 * - On Web (desktop/mobile browser): uses standard Web Push (VAPID/RFC 8291).
 */

import {
  hasWebPush,
  isNativeAndroid,
  getNativeBridge,
  requestNativeNotificationPermission,
} from "./platform";
import { fetchConfig, getApiBase, subscribePush } from "./api";

// ──────────────────────────── Web Push helpers ────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function registerWebPush(recipientToken: string): Promise<boolean> {
  if (!hasWebPush) {
    console.warn("Web Push not supported in this environment");
    return false;
  }

  try {
    const config = await fetchConfig();
    const registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const serverKey = urlBase64ToUint8Array(config.vapid_public_key);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: new Uint8Array(serverKey).buffer as ArrayBuffer,
      });
    }

    const json = subscription.toJSON();
    await subscribePush(recipientToken, json);
    return true;
  } catch (err) {
    console.error("Failed to register Web Push subscription:", err);
    return false;
  }
}

// ──────────────────────────── Native FCM Push ─────────────────────────────

async function registerNativeFcmPush(
  recipientToken: string,
): Promise<boolean> {
  const bridge = getNativeBridge();
  if (!bridge) return false;

  try {
    const apiBase = await getApiBase();
    if (!apiBase) {
      console.error("API base URL not configured");
      return false;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        window.__hxNativeFcmRegisterCallback = undefined;
        resolve(false);
      }, 15_000);

      window.__hxNativeFcmRegisterCallback = (statusCode: number) => {
        clearTimeout(timeout);
        window.__hxNativeFcmRegisterCallback = undefined;
        resolve(statusCode >= 200 && statusCode < 300);
      };

      bridge.registerFcmPush(apiBase, recipientToken);
    });
  } catch (err) {
    console.error("Failed to register native FCM push:", err);
    return false;
  }
}

// ──────────────────────────── Public API ───────────────────────────────────

/**
 * Register for push notifications.
 * Automatically selects the right strategy based on platform.
 */
export async function registerPushSubscription(
  recipientToken: string,
): Promise<boolean> {
  if (isNativeAndroid) {
    return registerNativeFcmPush(recipientToken);
  }
  return registerWebPush(recipientToken);
}

/**
 * Request notification permission.
 * On Android: triggers the system permission dialog via native bridge.
 * On Web: uses the Notification API.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isNativeAndroid) {
    const status = await requestNativeNotificationPermission();
    return status as NotificationPermission;
  }

  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

/**
 * 在前台页面中触发操作系统级别的通知。
 * 用于 PC 浏览器：当页面在后台标签页时，Web Push 可能不触发，
 * 但通过 Notification API 可以直接弹出系统通知。
 */
export function showBrowserNotification(
  title: string,
  body: string,
  options?: { tag?: string; messageId?: string; priority?: string },
): void {
  if (isNativeAndroid) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  const tag = options?.tag ?? `hx-msg-${options?.messageId ?? Date.now()}`;
  const priority = options?.priority ?? "default";

  const vibrate = priority === "urgent"
    ? [200, 100, 200, 100, 200]
    : priority === "high"
      ? [200, 100, 200]
      : [100];

  const notification = new Notification(title, {
    body,
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    tag,
    vibrate,
    requireInteraction: priority === "urgent",
  });

  notification.onclick = () => {
    window.focus();
    if (options?.messageId) {
      window.location.hash = "";
      window.location.href = `/message/${options.messageId}`;
    }
    notification.close();
  };
}
