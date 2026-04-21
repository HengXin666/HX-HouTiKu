/**
 * WebSocket upgrade route — GET /api/ws
 *
 * Auth: recipient token via query param (WebSocket can't set headers easily).
 * Flow:
 *   1. Validate recipient token from query string
 *   2. Derive DO id from recipient_id
 *   3. Forward the upgrade request to the MessageRelay DO
 */

import { Hono } from "hono";
import type { Env, RecipientRow } from "../types";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  // WebSocket must use Upgrade header
  if (c.req.header("Upgrade") !== "websocket") {
    return c.json({ error: "Expected WebSocket upgrade" }, 426);
  }

  // Auth via query param (WebSocket API doesn't support custom headers)
  const token = c.req.query("token");
  if (!token) {
    return c.json({ error: "Missing token query parameter" }, 401);
  }

  let recipientId: string;

  if (token === c.env.ADMIN_TOKEN) {
    // Admin must specify recipient_id
    const rid = c.req.query("recipient_id");
    if (!rid) {
      return c.json({ error: "Admin must specify recipient_id" }, 400);
    }
    recipientId = rid;
  } else if (token.startsWith("rt_")) {
    recipientId = token.slice(3);

    // Validate recipient exists
    const row = await c.env.DB.prepare(
      "SELECT id FROM recipients WHERE id = ? AND is_active = 1"
    )
      .bind(recipientId)
      .first<RecipientRow>();

    if (!row) {
      return c.json({ error: "Invalid recipient token" }, 401);
    }
  } else {
    return c.json({ error: "Invalid token format" }, 401);
  }

  const deviceId = c.req.query("device_id");

  // Get the Durable Object stub — one DO per recipient
  const doId = c.env.MESSAGE_RELAY.idFromName(recipientId);
  const stub = c.env.MESSAGE_RELAY.get(doId);

  // Build the internal request URL with params for the DO
  const doUrl = new URL("https://do-internal/ws");
  doUrl.searchParams.set("recipient_id", recipientId);
  if (deviceId) doUrl.searchParams.set("device_id", deviceId);

  // Forward the upgrade request to the DO
  return stub.fetch(doUrl.toString(), {
    headers: c.req.raw.headers,
  });
});

export default app;
