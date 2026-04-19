import { Hono } from "hono";
import type { Env, MessageRow } from "../types";
import { authRecipientToken } from "../auth";

const app = new Hono<{ Bindings: Env; Variables: { recipientId?: string } }>();

// GET /api/messages — pull encrypted messages
app.get("/", authRecipientToken(), async (c) => {
  const recipientId = c.get("recipientId");
  if (!recipientId) {
    return c.json({ error: "recipient_id required" }, 400);
  }

  const since = Number(c.req.query("since") || "0");
  const limit = Math.min(Number(c.req.query("limit") || "50"), 200);
  const group = c.req.query("group");
  const priority = c.req.query("priority");

  let query = "SELECT * FROM messages WHERE recipient_id = ? AND timestamp > ?";
  const params: (string | number)[] = [recipientId, since];

  if (group) {
    query += " AND group_name = ?";
    params.push(group);
  }

  if (priority) {
    query += " AND priority = ?";
    params.push(priority);
  }

  query += " ORDER BY timestamp DESC LIMIT ?";
  params.push(limit + 1); // +1 to detect has_more

  const stmt = c.env.DB.prepare(query);
  const result = await stmt.bind(...params).all<MessageRow>();

  const hasMore = result.results.length > limit;
  const messages = result.results.slice(0, limit).map((row) => ({
    id: row.id,
    encrypted_data: row.encrypted_data,
    priority: row.priority,
    content_type: row.content_type ?? "markdown",
    group: row.group_name,
    timestamp: row.timestamp,
    is_read: row.is_read === 1,
  }));

  // Count total unread
  const unreadResult = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE recipient_id = ? AND is_read = 0"
  )
    .bind(recipientId)
    .first<{ count: number }>();

  return c.json({
    messages,
    total_unread: unreadResult?.count ?? 0,
    has_more: hasMore,
  });
});

// POST /api/messages/read — mark messages as read
app.post("/read", authRecipientToken(), async (c) => {
  const recipientId = c.get("recipientId");
  if (!recipientId) {
    return c.json({ error: "recipient_id required" }, 400);
  }

  const { message_ids } = await c.req.json<{ message_ids: string[] }>();

  if (!message_ids || message_ids.length === 0) {
    return c.json({ error: "message_ids required" }, 400);
  }

  // Batch update — D1 doesn't support IN clause with bindings well, so batch individual updates
  const statements = message_ids.map((id) =>
    c.env.DB.prepare(
      "UPDATE messages SET is_read = 1 WHERE id = ? AND recipient_id = ?"
    ).bind(id, recipientId)
  );

  await c.env.DB.batch(statements);

  return c.json({ updated: message_ids.length });
});

export default app;
