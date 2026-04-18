/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute } from "workbox-precaching";

// Workbox precache (injected by vite-plugin-pwa)
precacheAndRoute(self.__WB_MANIFEST);

// ====== Web Push Listener ======

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data: { type: string; id?: string; priority?: string; group?: string; timestamp?: number };
  try {
    data = event.data.json();
  } catch {
    return;
  }

  if (data.type !== "new_message") return;

  const priority = data.priority ?? "default";
  const group = data.group ?? "general";

  // Priority → notification config
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

  // Skip push notifications for low/debug
  if (priority === "low" || priority === "debug") return;

  const groupEmoji: Record<string, string> = {
    alerts: "🔴",
    work: "📋",
    "ai-daily": "🤖",
    crawler: "🕷",
    "ci-cd": "🔧",
    general: "📬",
  };

  const emoji = groupEmoji[group] ?? "📬";
  const priorityLabel = priority === "urgent" ? "紧急" : "新";

  const title = `${emoji} ${group} · ${priorityLabel}消息`;
  const body = "点击查看详情";

  const notifConfig = configs[priority] ?? configs.default;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url: `/?focus=${data.id}` },
      ...notifConfig,
    } as NotificationOptions)
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
