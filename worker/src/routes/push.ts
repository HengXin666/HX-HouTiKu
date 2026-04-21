import { Hono } from "hono";
import type { Env, PushRequest, RecipientRow } from "../types";
import { authPushToken } from "../auth";
import { deliverToRecipient } from "../push-service";

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
  const channelId = body.channel_id ?? "default";
  const groupKey = body.group_key ?? "";
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
  const wsSent: string[] = [];
  const pushSent: string[] = [];
  const statements: D1PreparedStatement[] = [];

  for (const name of targetNames) {
    const payload = body.encrypted_payloads[name];
    if (!payload) continue;

    const recipient = await c.env.DB.prepare(
      "SELECT id FROM recipients WHERE name = ? AND is_active = 1"
    )
      .bind(name)
      .first<RecipientRow>();

    if (!recipient) continue;

    const msgId = targetNames.length === 1 ? messageId : `${messageId}_${name}`;

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO messages (id, recipient_id, encrypted_data, priority, content_type, group_name, channel_id, group_key, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(msgId, recipient.id, payload, priority, contentType, group, channelId, groupKey, timestamp, now)
    );

    pushedTo.push(name);

    // Three-layer delivery: DO WebSocket → Web Push / FCM
    const delivery = await deliverToRecipient(c.env, recipient.id, {
      id: msgId,
      encrypted_data: payload,
      priority,
      content_type: contentType,
      group,
      timestamp,
      channel_id: channelId,
      group_key: groupKey,
    });

    if (delivery.ws_sent) wsSent.push(name);
    if (delivery.push_sent) pushSent.push(name);
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({
    status: "ok",
    id: messageId,
    pushed_to: pushedTo,
    ws_sent: wsSent,
    push_sent: pushSent,
  }, 201);
});

export default app;
