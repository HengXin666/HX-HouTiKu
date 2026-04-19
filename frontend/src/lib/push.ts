/**
 * Push notification management — dual-mode:
 *   • Web: Service Worker + Web Push API (VAPID)
 *   • Native (Capacitor Android/iOS): @capacitor/push-notifications (FCM/APNs)
 */

import { isNativePlatform, hasWebPush, vibrate } from "./platform";
import { fetchConfig, subscribePush, getApiBase } from "./api";

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

// ──────────────────────── Native Push (Capacitor) ─────────────────────────

/** Callback for handling received native push notifications. */
type NativePushHandler = (data: {
  id?: string;
  priority?: string;
  group?: string;
}) => void;

let nativePushHandler: NativePushHandler | null = null;

/**
 * Set a handler that fires when a native push message arrives while the app
 * is in the foreground. Call from your root component (App.tsx).
 */
export function setNativePushHandler(handler: NativePushHandler): void {
  nativePushHandler = handler;
}

async function registerNativePush(recipientToken: string): Promise<boolean> {
  if (!isNativePlatform) return false;

  try {
    const { PushNotifications } = await import(
      "@capacitor/push-notifications"
    );

    // Request permission
    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== "granted") {
      console.warn("Native push permission not granted");
      return false;
    }

    // Register with FCM/APNs
    await PushNotifications.register();

    // Wait for the registration token from FCM
    return new Promise<boolean>((resolve) => {
      let resolved = false;

      PushNotifications.addListener("registration", async (token) => {
        console.log("FCM token:", token.value);
        try {
          // Send FCM token to our backend as a push subscription
          // The backend stores it the same way, but we indicate it's a native token
          const apiBase = await getApiBase();
          const res = await fetch(`${apiBase}/api/subscribe`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${recipientToken}`,
            },
            body: JSON.stringify({
              endpoint: `fcm://${token.value}`,
              keys: {
                p256dh: "native-fcm",
                auth: "native-fcm",
              },
            }),
          });
          if (!resolved) {
            resolved = true;
            resolve(res.ok);
          }
        } catch (err) {
          console.error("Failed to register native push with server:", err);
          if (!resolved) {
            resolved = true;
            resolve(false);
          }
        }
      });

      PushNotifications.addListener("registrationError", (err) => {
        console.error("Native push registration error:", err);
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      });

      // Handle received notifications (foreground)
      PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          console.log("Native push received:", notification);
          const data = notification.data ?? {};
          const priority = data.priority ?? "default";

          // Vibrate based on priority
          if (priority === "urgent") {
            vibrate([200, 100, 200, 100, 200]);
          } else if (priority === "high") {
            vibrate([200, 100, 200]);
          } else if (priority === "default") {
            vibrate([100]);
          }

          nativePushHandler?.(data);
        },
      );

      // Handle notification tap (opens specific message)
      PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const data = action.notification.data ?? {};
          if (data.id) {
            window.location.hash = `/?focus=${data.id}`;
          }
        },
      );

      // Timeout fallback — don't hang forever
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, 10_000);
    });
  } catch (err) {
    console.error("Failed to set up native push:", err);
    return false;
  }
}

// ──────────────────────────── Public API ───────────────────────────────────

/**
 * Register for push notifications.
 * Automatically selects native or web approach based on platform.
 */
export async function registerPushSubscription(
  recipientToken: string,
): Promise<boolean> {
  if (isNativePlatform) {
    return registerNativePush(recipientToken);
  }
  return registerWebPush(recipientToken);
}

/**
 * Request notification permission.
 * On native: handled inside registerNativePush.
 * On web: uses Notification.requestPermission().
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (isNativePlatform) {
    try {
      const { PushNotifications } = await import(
        "@capacitor/push-notifications"
      );
      const result = await PushNotifications.requestPermissions();
      return result.receive === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }

  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}
