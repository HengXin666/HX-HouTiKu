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
    // Push to all active recipients
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

    // Send Web Push notification for urgent/high/default
    if (priority !== "low" && priority !== "debug") {
      const subs = await c.env.DB.prepare(
        "SELECT * FROM push_subscriptions WHERE recipient_id = ?"
      )
        .bind(recipient.id)
        .all<PushSubscriptionRow>();

      if (subs.results.length > 0) {
        webPushSent.push(name);
        // Web Push is fire-and-forget, errors are non-fatal
        for (const sub of subs.results) {
          try {
            await sendWebPush(c.env, sub, { type: "new_message", id: msgId, priority, group, timestamp });
          } catch {
            // Subscription may be expired — clean it up
            await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?")
              .bind(sub.id)
              .run();
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

async function sendWebPush(
  env: Env,
  sub: PushSubscriptionRow,
  payload: Record<string, unknown>
): Promise<void> {
  const { generatePushHTTPRequest } = await import("../webpush");

  const { headers, body, endpoint } = await generatePushHTTPRequest({
    applicationServerKeys: {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
    payload: JSON.stringify(payload),
    target: {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.key_p256dh,
        auth: sub.key_auth,
      },
    },
    adminContact: "mailto:admin@hx-houtiku.dev",
    ttl: 60 * 60, // 1 hour
    urgency: payload.priority === "urgent" ? "high" : "normal",
  });

  const resp = await fetch(endpoint, { method: "POST", headers, body });
  if (!resp.ok && resp.status === 410) {
    throw new Error("Subscription expired");
  }
}

export default app;
