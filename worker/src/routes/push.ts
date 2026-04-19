import { Hono } from "hono";
import type { Env, PushRequest, RecipientRow, PushSubscriptionRow } from "../types";
import { authPushToken } from "../auth";

const app = new Hono<{ Bindings: Env }>();

app.post("/", authPushToken(), async (c) => {
  const body = await c.req.json<PushRequest>();

  if (!body.encrypted_payloads || Object.keys(body.encrypted_payloads).length === 0) {
    return c.json({ error: "encrypted_payloads is required and must not be empty" }, 400);
  }

  const messageId = body.id ?? crypto.randomUUID();
  const priority = body.priority ?? "default";
  const group = body.group ?? "general";
  const contentType = body.content_type ?? "markdown";
  const timestamp = body.timestamp ?? Date.now();
  const now = Date.now();

  // Resolve target recipients
  let targetNames = body.recipients;
  if (!targetNames || targetNames.length === 0) {
    const allRecipients = await c.env.DB.prepare(
      "SELECT name FROM recipients WHERE is_active = 1"
    ).all<RecipientRow>();
    targetNames = allRecipients.results.map((r) => r.name);
  }

  const pushedTo: string[] = [];
  const webPushSent: string[] = [];
  const statements: D1PreparedStatement[] = [];

  for (const name of targetNames) {
    const payload = body.encrypted_payloads[name];
    if (!payload) continue;

    // Find recipient
    const recipient = await c.env.DB.prepare(
      "SELECT id FROM recipients WHERE name = ? AND is_active = 1"
    )
      .bind(name)
      .first<RecipientRow>();

    if (!recipient) continue;

    const msgId = targetNames.length === 1 ? messageId : `${messageId}_${name}`;

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO messages (id, recipient_id, encrypted_data, priority, content_type, group_name, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(msgId, recipient.id, payload, priority, contentType, group, timestamp, now)
    );

    pushedTo.push(name);

    // ── Web Push: carry the encrypted message data in the payload ──
    // This allows the client to decrypt directly without polling GET /api/messages.
    // Web Push payload limit is ~4KB; encrypted_data for typical messages is well under that.
    // For all priorities (including low/debug), we send the data push.
    const subs = await c.env.DB.prepare(
      "SELECT * FROM push_subscriptions WHERE recipient_id = ?"
    )
      .bind(recipient.id)
      .all<PushSubscriptionRow>();

    if (subs.results.length > 0) {
      webPushSent.push(name);

      // Build the push payload containing the full encrypted message
      const pushPayload = JSON.stringify({
        type: "new_message",
        message: {
          id: msgId,
          encrypted_data: payload,
          priority,
          content_type: contentType,
          group,
          timestamp,
          is_read: false,
        },
      });

      for (const sub of subs.results) {
        try {
          if (sub.endpoint.startsWith("fcm://")) {
            // Native Android — send via FCM HTTP v1 API
            await sendFcmPush(c.env, sub, pushPayload, priority, group);
          } else {
            // Standard Web Push (VAPID)
            await sendWebPush(c.env, sub, pushPayload);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Push failed for sub ${sub.id} (${sub.endpoint.slice(0, 60)}...): ${msg}`);

          // Only clean up subscriptions that are definitively gone (410 Gone)
          if (msg.includes("410") || msg.includes("expired")) {
            await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?")
              .bind(sub.id)
              .run();
            console.log(`Cleaned up expired subscription ${sub.id}`);
          }
        }
      }
    }
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({ status: "ok", id: messageId, pushed_to: pushedTo, web_push_sent: webPushSent }, 201);
});

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

  const { sendFcmPush: fcmSend } = await import("../fcm");
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
  payload: string
): Promise<void> {
  const { generatePushHTTPRequest } = await import("../webpush");

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
    ttl: 60 * 60, // 1 hour
  });

  const resp = await fetch(endpoint, { method: "POST", headers, body });

  if (!resp.ok) {
    const respBody = await resp.text().catch(() => "");
    const errMsg = `Web Push failed: ${resp.status} ${resp.statusText} — ${respBody}`;
    console.error(errMsg);

    if (resp.status === 410 || resp.status === 404) {
      throw new Error(`410 Subscription expired`);
    }

    throw new Error(errMsg);
  }
}

export default app;
