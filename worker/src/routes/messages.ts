import { Hono, type Context } from "hono";
import type { Env, MessageRow } from "../types";
import { authRecipientToken } from "../auth";

const app = new Hono<{ Bindings: Env; Variables: { recipientId?: string } }>();

// GET /api/messages — pull encrypted messages (global, shared across all devices)
app.get("/", authRecipientToken(), async (c) => {
  const since = Number(c.req.query("since") || "0");
  const limit = Math.min(Number(c.req.query("limit") || "50"), 200);
  const group = c.req.query("group");
  const priority = c.req.query("priority");
  const channelId = c.req.query("channel_id");

  let query = "SELECT * FROM messages WHERE timestamp > ?";
  const params: (string | number)[] = [since];

  if (group) {
    query += " AND group_name = ?";
    params.push(group);
  }

  if (priority) {
    query += " AND priority = ?";
    params.push(priority);
  }

  if (channelId) {
    query += " AND channel_id = ?";
    params.push(channelId);
  }

  query += " ORDER BY timestamp DESC LIMIT ?";
  params.push(limit + 1);

  const stmt = c.env.DB.prepare(query);
  const result = await stmt.bind(...params).all<MessageRow>();

  const hasMore = result.results.length > limit;
  const messages = result.results.slice(0, limit).map((row) => ({
    id: row.id,
    encrypted_data: row.encrypted_data,
    priority: row.priority,
    content_type: row.content_type ?? "markdown",
    group: row.group_name,
    channel_id: row.channel_id ?? "default",
    group_key: row.group_key ?? "",
    timestamp: row.timestamp,
    is_read: row.is_read === 1,
    is_starred: (row as any).is_starred === 1,
  }));

  const unreadResult = await c.env.DB.prepare(
    "SELECT COUNT(*) as count FROM messages WHERE is_read = 0"
  ).first<{ count: number }>();

  return c.json({
    messages,
    total_unread: unreadResult?.count ?? 0,
    has_more: hasMore,
  });
});

// PUT /api/messages/read — mark messages as read (preferred)
// POST /api/messages/read — kept for backward compatibility
const markRead = authRecipientToken();
const markReadHandler = async (c: Context<{ Bindings: Env; Variables: { recipientId?: string } }>) => {
  const { message_ids } = await c.req.json<{ message_ids: string[] }>();

  if (!message_ids || message_ids.length === 0) {
    return c.json({ error: "message_ids required" }, 400);
  }

  const statements = message_ids.map((id) =>
    c.env.DB.prepare(
      "UPDATE messages SET is_read = 1 WHERE id = ?"
    ).bind(id)
  );

  await c.env.DB.batch(statements);

  return c.json({ updated: message_ids.length });
};
app.put("/read", markRead, markReadHandler);
app.post("/read", markRead, markReadHandler);

// PUT /api/messages/starred — toggle starred status for messages
app.put("/starred", authRecipientToken(), async (c) => {
  const { message_ids, starred } = await c.req.json<{ message_ids: string[]; starred: boolean }>();

  if (!message_ids || message_ids.length === 0) {
    return c.json({ error: "message_ids required" }, 400);
  }

  const starredVal = starred ? 1 : 0;
  const statements = message_ids.map((id) =>
    c.env.DB.prepare(
      "UPDATE messages SET is_starred = ? WHERE id = ?"
    ).bind(starredVal, id)
  );

  await c.env.DB.batch(statements);

  // Broadcast star sync to all online devices via DO WebSocket
  const allRecipients = await c.env.DB.prepare(
    "SELECT id FROM recipients WHERE is_active = 1"
  ).all<{ id: string }>();

  const starPayload = { type: "star_sync" as const, message_ids, starred };

  await Promise.all(
    allRecipients.results.map(async (r) => {
      try {
        const doId = c.env.MESSAGE_RELAY.idFromName(r.id);
        const stub = c.env.MESSAGE_RELAY.get(doId);
        await stub.fetch("https://do-internal/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(starPayload),
        });
      } catch {
        // DO broadcast failure is non-critical
      }
    })
  );

  return c.json({ updated: message_ids.length, starred });
});

// GET /api/messages/starred — get all starred message IDs
app.get("/starred", authRecipientToken(), async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT id FROM messages WHERE is_starred = 1 ORDER BY timestamp DESC"
  ).all<{ id: string }>();

  return c.json({ starred_ids: result.results.map((r) => r.id) });
});

// DELETE /api/messages — permanently delete messages + sync to other devices
app.delete("/", authRecipientToken(), async (c) => {
  const { message_ids } = await c.req.json<{ message_ids: string[] }>();

  if (!message_ids || message_ids.length === 0) {
    return c.json({ error: "message_ids required" }, 400);
  }

  const placeholders = message_ids.map(() => "?").join(",");
  await c.env.DB.prepare(
    `DELETE FROM messages WHERE id IN (${placeholders})`
  ).bind(...message_ids).run();

  // Broadcast delete event to all online devices via DO WebSocket
  const allRecipients = await c.env.DB.prepare(
    "SELECT id FROM recipients WHERE is_active = 1"
  ).all<{ id: string }>();

  const deletePayload = { type: "message_deleted" as const, message_ids };

  await Promise.all(
    allRecipients.results.map(async (r) => {
      try {
        const doId = c.env.MESSAGE_RELAY.idFromName(r.id);
        const stub = c.env.MESSAGE_RELAY.get(doId);
        await stub.fetch("https://do-internal/broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(deletePayload),
        });
      } catch {
        // DO broadcast failure is non-critical
      }
    })
  );

  return c.json({ deleted: message_ids.length });
});

export default app;
