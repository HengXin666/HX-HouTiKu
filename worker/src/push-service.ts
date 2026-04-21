/**
 * Shared push delivery service.
 *
 * Consolidates the three-layer delivery logic:
 *   Layer 1: DO WebSocket (real-time, online clients)
 *   Layer 2: Web Push / FCM (offline fallback, system notifications)
 *
 * Used by both push.ts and test-push.ts to avoid code duplication.
 */

import type { Env, PushSubscriptionRow } from "./types";

export interface DeliveryPayload {
  id: string;
  encrypted_data: string;
  priority: string;
  content_type: string;
  group: string;
  timestamp: number;
  channel_id: string;
  group_key: string;
}

export interface DeliveryResult {
  ws_sent: boolean;
  push_sent: boolean;
}

/**
 * Deliver a message to a recipient via all available channels.
 */
export async function deliverToRecipient(
  env: Env,
  recipientId: string,
  payload: DeliveryPayload,
): Promise<DeliveryResult> {
  const result: DeliveryResult = { ws_sent: false, push_sent: false };

  const wsMessage = {
    type: "new_message" as const,
    message: {
      ...payload,
      is_read: false,
    },
  };

  // Layer 1: DO WebSocket broadcast
  try {
    const doId = env.MESSAGE_RELAY.idFromName(recipientId);
    const stub = env.MESSAGE_RELAY.get(doId);
    const doResp = await stub.fetch("https://do-internal/broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wsMessage),
    });
    const doResult = await doResp.json<{ sent: number }>();
    result.ws_sent = doResult.sent > 0;
  } catch (err) {
    console.error(`DO broadcast failed for ${recipientId}:`, err);
  }

  // Layer 2: Web Push / FCM
  const subs = await env.DB.prepare(
    "SELECT * FROM push_subscriptions WHERE recipient_id = ?"
  )
    .bind(recipientId)
    .all<PushSubscriptionRow>();

  if (subs.results.length > 0) {
    result.push_sent = true;
    const pushPayload = JSON.stringify(wsMessage);

    for (const sub of subs.results) {
      try {
        if (sub.endpoint.startsWith("fcm://")) {
          await sendFcmPush(env, sub, pushPayload, payload.priority, payload.group);
        } else {
          await sendWebPush(env, sub, pushPayload);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Push failed for sub ${sub.id}: ${msg}`);
        if (msg.includes("410") || msg.includes("expired")) {
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?")
            .bind(sub.id)
            .run();
        }
      }
    }
  }

  return result;
}

// ── Internal push helpers ──

async function sendFcmPush(
  env: Env,
  sub: PushSubscriptionRow,
  payload: string,
  priority: string,
  group: string,
): Promise<void> {
  if (!env.FCM_SERVICE_ACCOUNT) {
    console.warn("FCM_SERVICE_ACCOUNT not configured — skipping native push");
    return;
  }

  const { sendFcmPush: fcmSend } = await import("./fcm");
  const deviceToken = sub.endpoint.replace("fcm://", "");

  await fcmSend(env.FCM_SERVICE_ACCOUNT, {
    deviceToken,
    payload,
    priority,
    group,
  });
}

async function sendWebPush(
  env: Env,
  sub: PushSubscriptionRow,
  payload: string,
): Promise<void> {
  const { generatePushHTTPRequest } = await import("./webpush");

  const { headers, body, endpoint } = await generatePushHTTPRequest({
    applicationServerKeys: {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
    payload,
    target: {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.key_p256dh,
        auth: sub.key_auth,
      },
    },
    adminContact: "mailto:admin@hx-houtiku.dev",
    ttl: 60 * 60,
  });

  const resp = await fetch(endpoint, { method: "POST", headers, body });

  if (!resp.ok) {
    const respBody = await resp.text().catch(() => "");
    if (resp.status === 410 || resp.status === 404) {
      throw new Error("410 Subscription expired");
    }
    throw new Error(`Web Push failed: ${resp.status} — ${respBody}`);
  }
}
