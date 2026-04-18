import { Hono } from "hono";
import type { Env, RecipientCreateRequest, RecipientRow } from "../types";
import { authPushToken } from "../auth";

const app = new Hono<{ Bindings: Env }>();

// POST /api/recipients — register a new recipient
app.post("/", authPushToken(), async (c) => {
  const body = await c.req.json<RecipientCreateRequest>();

  if (!body.name || !body.public_key) {
    return c.json({ error: "name and public_key are required" }, 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const groups = JSON.stringify(body.groups ?? ["general"]);

  try {
    await c.env.DB.prepare(
      `INSERT INTO recipients (id, name, public_key, groups, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    )
      .bind(id, body.name, body.public_key, groups, now, now)
      .run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("UNIQUE")) {
      return c.json({ error: "Recipient name or public_key already exists" }, 409);
    }
    throw e;
  }

  // Recipient token is simply `rt_{id}` for v1
  const recipientToken = `rt_${id}`;

  return c.json({ id, recipient_token: recipientToken, name: body.name }, 201);
});

// GET /api/recipients — list all recipients (admin only)
app.get("/", authPushToken(), async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT id, name, public_key, groups, is_active, created_at, updated_at FROM recipients ORDER BY created_at DESC"
  ).all<RecipientRow>();

  return c.json({
    recipients: rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      public_key: r.public_key,
      groups: JSON.parse(r.groups),
      is_active: r.is_active === 1,
      created_at: r.created_at,
    })),
  });
});

// DELETE /api/recipients/:id — deactivate a recipient
app.delete("/:id", authPushToken(), async (c) => {
  const id = c.req.param("id");

  await c.env.DB.prepare(
    "UPDATE recipients SET is_active = 0, updated_at = ? WHERE id = ?"
  )
    .bind(Date.now(), id)
    .run();

  return c.json({ status: "deactivated" });
});

export default app;
