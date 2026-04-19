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

/**
 * Create Android notification channels (required for Android 8+).
 * Different channels allow per-priority vibration/sound/importance.
 */
async function ensureNotificationChannels(): Promise<void> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    await LocalNotifications.requestPermissions();

    // Create channels for each priority level
    await LocalNotifications.createChannel({
      id: "hx_push_urgent",
      name: "紧急消息",
      description: "紧急消息 — 持续震动、锁屏全屏显示",
      importance: 5, // MAX
      visibility: 1, // PUBLIC
      vibration: true,
      sound: "default",
      lights: true,
    });

    await LocalNotifications.createChannel({
      id: "hx_push_high",
      name: "重要消息",
      description: "重要消息 — 震动、弹窗",
      importance: 4, // HIGH
      visibility: 1,
      vibration: true,
      sound: "default",
      lights: true,
    });

    await LocalNotifications.createChannel({
      id: "hx_push_default",
      name: "普通消息",
      description: "普通消息 — 静默通知",
      importance: 3, // DEFAULT
      visibility: 0, // PRIVATE
      vibration: true,
      sound: "default",
    });
  } catch (err) {
    console.warn("Failed to create notification channels:", err);
  }
}

/** Monotonically increasing ID for local notifications. */
let localNotifId = Math.floor(Date.now() / 1000);

/**
 * Show a local notification in the system tray when a push arrives
 * while the app is in the foreground. Without this, Android silently
 * swallows FCM notifications when the app is visible.
 */
async function showForegroundNotification(
  priority: string,
  group: string,
  messageId?: string,
): Promise<void> {
  if (priority === "low" || priority === "debug") return;

  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");

    const priorityLabel =
      priority === "urgent" ? "紧急" : priority === "high" ? "重要" : "新";

    const channelId =
      priority === "urgent"
        ? "hx_push_urgent"
        : priority === "high"
          ? "hx_push_high"
          : "hx_push_default";

    await LocalNotifications.schedule({
      notifications: [
        {
          id: ++localNotifId,
          title: `${group} · ${priorityLabel}消息`,
          body: "点击查看详情",
          channelId,
          extra: { id: messageId },
          smallIcon: "ic_notification",
          largeIcon: "ic_launcher",
        },
      ],
    });
  } catch (err) {
    console.warn("Failed to show foreground notification:", err);
  }
}

async function registerNativePush(recipientToken: string): Promise<boolean> {
  if (!isNativePlatform) return false;

  try {
    const { PushNotifications } = await import(
      "@capacitor/push-notifications"
    );

    // Create notification channels first (Android 8+ requirement)
    await ensureNotificationChannels();

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
      // When the app is in the foreground, FCM delivers data-only silently.
      // We must show a local notification manually to appear in the status bar.
      PushNotifications.addListener(
        "pushNotificationReceived",
        (notification) => {
          console.log("Native push received (foreground):", notification);
          const data = notification.data ?? {};
          const priority = data.priority ?? "default";
          const group = data.group ?? "general";

          // Vibrate based on priority
          if (priority === "urgent") {
            vibrate([200, 100, 200, 100, 200]);
          } else if (priority === "high") {
            vibrate([200, 100, 200]);
          } else if (priority === "default") {
            vibrate([100]);
          }

          // Show in system status bar / notification tray even while app is open
          showForegroundNotification(priority, group, data.id);

          nativePushHandler?.(data);
        },
      );

      // Handle notification tap (from FCM notification OR local notification)
      PushNotifications.addListener(
        "pushNotificationActionPerformed",
        (action) => {
          const data = action.notification.data ?? {};
          if (data.id) {
            window.location.hash = `/?focus=${data.id}`;
          }
        },
      );

      // Also handle local notification taps
      import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
        LocalNotifications.addListener(
          "localNotificationActionPerformed",
          (action) => {
            const extra = action.notification.extra ?? {};
            if (extra.id) {
              window.location.hash = `/?focus=${extra.id}`;
            }
          },
        );
      }).catch(() => {});

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
