import { Hono } from "hono";
import type { Env, SubscribeRequest } from "../types";
import { authRecipientToken } from "../auth";

const app = new Hono<{ Bindings: Env; Variables: { recipientId?: string } }>();

// POST /api/subscribe — register web push subscription
app.post("/", authRecipientToken(), async (c) => {
  const recipientId = c.get("recipientId");
  if (!recipientId) {
    return c.json({ error: "recipient_id required" }, 400);
  }

  const body = await c.req.json<SubscribeRequest>();

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: "endpoint and keys (p256dh, auth) are required" }, 400);
  }

  const id = crypto.randomUUID();
  const userAgent = c.req.header("User-Agent") ?? null;
  const deviceType = body.device_type ?? "web";

  // Upsert: delete existing subscription with same endpoint, then insert
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(body.endpoint),
    c.env.DB.prepare(
      `INSERT INTO push_subscriptions (id, recipient_id, endpoint, key_p256dh, key_auth, device_type, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, recipientId, body.endpoint, body.keys.p256dh, body.keys.auth, deviceType, userAgent, Date.now()),
  ]);

  return c.json({ status: "subscribed" }, 201);
});

// DELETE /api/subscribe — unsubscribe
app.delete("/", authRecipientToken(), async (c) => {
  const recipientId = c.get("recipientId");
  if (!recipientId) {
    return c.json({ error: "recipient_id required" }, 400);
  }

  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE recipient_id = ?")
    .bind(recipientId)
    .run();

  return c.json({ status: "unsubscribed" });
});

export default app;
