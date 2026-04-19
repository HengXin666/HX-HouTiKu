/**
 * Push notification management — Web Push only.
 * Native push is handled by the separate Kotlin Android app (FCM).
 */

import { hasWebPush } from "./platform";
import { fetchConfig, subscribePush } from "./api";

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

// ──────────────────────────── Public API ───────────────────────────────────

/**
 * Register for push notifications (Web Push).
 */
export async function registerPushSubscription(
  recipientToken: string,
): Promise<boolean> {
  return registerWebPush(recipientToken);
}

/**
 * Request notification permission (Web Notification API).
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}
