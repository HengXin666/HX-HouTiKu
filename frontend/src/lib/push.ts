/**
 * Push notification management.
 *
 * - On Android WebView: 通过 JS Bridge 启动原生 WebSocket 前台服务,
 *   原生 Service 在后台接收消息并调用 NotificationManager 发送系统通知。
 *   WebView 内的 JS 和原生 Service 是隔离环境, 不共享 WS 连接。
 *
 * - On Web (desktop/mobile browser): 使用标准 Web Push (VAPID/RFC 8291)。
 *   根据 W3C Push API 规范, 后台推送通过 Service Worker 的 push 事件
 *   调用 self.registration.showNotification() 触发系统通知。
 *   参考: https://developer.mozilla.org/en-US/docs/Web/API/Push_API
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

// ──────────────────────────── Native Android Push (via WS Foreground Service) ─────
// Android 原生推送不使用 FCM, 而是通过原生前台 WebSocket 服务实现。
// 原生 HxWebSocketService 在后台保持 WS 连接, 收到消息后直接调用
// Android NotificationManager 发送系统通知。
// 参考: https://developer.android.com/develop/ui/views/notifications

async function registerNativeWsPush(
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

    // 构造 WS URL: https://... → wss://...
    const wsBase = apiBase.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    const wsUrl = `${wsBase}/api/ws`;

    // 从 recipient token 提取 recipient_id
    const recipientId = recipientToken.startsWith("rt_")
      ? recipientToken.slice(3)
      : recipientToken;

    // 调用原生桥接启动 WebSocket 前台服务
    // 原生 Service 会: 1) 保持后台 WS 连接 2) 收到消息时发送系统通知
    bridge.startWebSocket(wsUrl, recipientToken, recipientId);
    return true;
  } catch (err) {
    console.error("Failed to start native WS push service:", err);
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
    return registerNativeWsPush(recipientToken);
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
 * 通过 Service Worker 触发操作系统级别的通知。
 *
 * 根据 W3C 规范, 只有 ServiceWorkerRegistration.showNotification() 才能
 * 在页面关闭/后台时可靠地显示系统通知。new Notification() 构造函数只在
 * 页面上下文中工作, 页面关闭后无法触发。
 *
 * 参考:
 *   - https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification
 *   - https://developer.mozilla.org/en-US/docs/Web/API/Notification (仅前台)
 */
export async function showBrowserNotification(
  title: string,
  body: string,
  options?: { tag?: string; messageId?: string; priority?: string },
): Promise<void> {
  if (isNativeAndroid) return;
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator)) return;

  const tag = options?.tag ?? `hx-msg-${options?.messageId ?? Date.now()}`;
  const priority = options?.priority ?? "default";

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag,
      requireInteraction: priority === "urgent",
      data: { url: options?.messageId ? `/message/${options.messageId}` : "/" },
    });
  } catch (err) {
    console.warn("showNotification via SW failed:", err);
  }
}
