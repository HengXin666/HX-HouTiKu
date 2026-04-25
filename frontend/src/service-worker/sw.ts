/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute } from "workbox-precaching";

// Workbox precache (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// 确保新 Service Worker 立即激活并接管所有客户端
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ====== Web Push Listener ======

interface PushMessage {
  id: string;
  encrypted_data: string;
  priority: string;
  content_type: string;
  group: string;
  timestamp: number;
  is_read: boolean;
}

interface PushPayload {
  type: string;
  message?: PushMessage;
  // Legacy fields for backward compat
  id?: string;
  priority?: string;
  group?: string;
}

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data: PushPayload;
  try {
    data = event.data.json();
  } catch {
    return;
  }

  if (data.type !== "new_message") return;

  // New format: payload contains full encrypted message
  const msg = data.message;
  const priority = msg?.priority ?? data.priority ?? "default";
  const group = msg?.group ?? data.group ?? "general";

  event.waitUntil(
    (async () => {
      // 1. Forward the encrypted message to all open clients
      //    They will decrypt and display it — no need to poll GET /api/messages
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) {
        if (msg) {
          // Full message push — client can decrypt directly
          client.postMessage({
            type: "PUSH_MESSAGE",
            message: msg,
          });
        } else {
          // Legacy fallback — just signal a refresh (backward compat)
          client.postMessage({
            type: "NEW_PUSH_MESSAGE",
            id: data.id,
            priority,
            group,
          });
        }
      }

      // 2. Show notification (skip for low/debug)
      if (priority === "low" || priority === "debug") return;

      type NotifConfig = NotificationOptions & { vibrate?: number[] };
      const configs: Record<string, NotifConfig> = {
        urgent: {
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-192x192.png",
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction: true,
          tag: `urgent-${group}`,
        },
        high: {
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-192x192.png",
          vibrate: [200, 100, 200],
          requireInteraction: false,
          tag: `high-${group}`,
        },
        default: {
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-192x192.png",
          vibrate: [100],
          silent: false,
          tag: `default-${group}`,
        },
      };

      const priorityLabel = priority === "urgent" ? "紧急" : "新";
      const title = `${group} · ${priorityLabel}消息`;
      const body = "点击查看详情";
      const notifConfig = configs[priority] ?? configs.default;

      await self.registration.showNotification(title, {
        body,
        data: { url: `/?focus=${msg?.id ?? data.id}` },
        ...notifConfig,
      } as NotificationOptions);
    })()
  );
});

// ====== Notification Click → Open/Focus PWA ======

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (new URL(client.url).origin === self.location.origin) {
            return client.focus().then((c) => {
              if ("navigate" in c) return (c as WindowClient).navigate(targetUrl);
              return c;
            });
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
