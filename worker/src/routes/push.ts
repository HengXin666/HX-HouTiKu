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

  // Take the first encrypted payload — all devices share the same key
  const encryptedData = Object.values(body.encrypted_payloads)[0];

  // Store ONE copy of the message (no per-recipient duplication)
  await c.env.DB.prepare(
    `INSERT INTO messages (id, recipient_id, encrypted_data, priority, content_type, group_name, channel_id, group_key, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(messageId, "", encryptedData, priority, contentType, group, channelId, groupKey, timestamp, now).run();

  // Deliver to ALL active recipients (WS + Push)
  const allRecipients = await c.env.DB.prepare(
    "SELECT id, name FROM recipients WHERE is_active = 1"
  ).all<RecipientRow>();

  const pushedTo: string[] = [];
  const wsSent: string[] = [];
  const pushSent: string[] = [];

  const deliveryPayload = {
    id: messageId,
    encrypted_data: encryptedData,
    priority,
    content_type: contentType,
    group,
    timestamp,
    channel_id: channelId,
    group_key: groupKey,
  };

  const deliveryResults = await Promise.all(
    allRecipients.results.map(async (recipient) => {
      const delivery = await deliverToRecipient(c.env, recipient.id, deliveryPayload);
      return { name: recipient.name, ...delivery };
    })
  );

  for (const r of deliveryResults) {
    pushedTo.push(r.name);
    if (r.ws_sent) wsSent.push(r.name);
    if (r.push_sent) pushSent.push(r.name);
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
