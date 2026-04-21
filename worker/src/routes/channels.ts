/**
 * Channels API — manage message channels/categories.
 *
 * POST   /api/channels      — create a new channel (admin)
 * GET    /api/channels       — list all channels (authenticated)
 * DELETE /api/channels/:id   — delete a channel (admin)
 */

import { Hono } from "hono";
import type { Env, ChannelRow, ChannelCreateRequest } from "../types";
import { authPushToken, authRecipientToken } from "../auth";

const app = new Hono<{ Bindings: Env }>();

// POST /api/channels — create a new channel
app.post("/", authPushToken(), async (c) => {
  const body = await c.req.json<ChannelCreateRequest>();

  if (!body.name || !body.display_name) {
    return c.json({ error: "name and display_name are required" }, 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  try {
    await c.env.DB.prepare(
      `INSERT INTO channels (id, name, display_name, description, icon, color, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
      .bind(
        id,
        body.name,
        body.display_name,
        body.description ?? "",
        body.icon ?? "",
        body.color ?? "",
        now,
        now,
      )
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return c.json({ error: "Channel name already exists" }, 409);
    }
    throw e;
  }

  return c.json({ id, name: body.name, display_name: body.display_name }, 201);
});

// GET /api/channels — list all active channels
app.get("/", authRecipientToken(), async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT * FROM channels WHERE is_active = 1 ORDER BY created_at ASC"
  ).all<ChannelRow>();

  return c.json({
    channels: rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      display_name: r.display_name,
      description: r.description,
      icon: r.icon,
      color: r.color,
    })),
  });
});

// DELETE /api/channels/:id — delete a channel (reassign messages to 'default')
app.delete("/:id", authPushToken(), async (c) => {
  const id = c.req.param("id");

  if (id === "default") {
    return c.json({ error: "Cannot delete the default channel" }, 400);
  }

  const row = await c.env.DB.prepare(
    "SELECT id, name FROM channels WHERE id = ?"
  )
    .bind(id)
    .first<{ id: string; name: string }>();

  if (!row) {
    return c.json({ error: "Channel not found" }, 404);
  }

  // Reassign messages to default channel, then delete
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE messages SET channel_id = 'default' WHERE channel_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM channels WHERE id = ?").bind(id),
  ]);

  return c.json({ status: "deleted", name: row.name });
});

export default app;
