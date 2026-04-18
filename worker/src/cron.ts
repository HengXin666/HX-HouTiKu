import type { Env } from "./types";

/**
 * Scheduled cleanup — runs via Cron Trigger.
 * - Remove debug messages older than 30 days
 * - Remove read messages older than 90 days
 * - Remove expired messages
 */
export async function handleScheduled(env: Env): Promise<void> {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;

  await env.DB.batch([
    // Debug messages: 30 days retention
    env.DB.prepare(
      "DELETE FROM messages WHERE priority = 'debug' AND created_at < ?"
    ).bind(thirtyDaysAgo),

    // Read messages: 90 days retention
    env.DB.prepare(
      "DELETE FROM messages WHERE is_read = 1 AND created_at < ?"
    ).bind(ninetyDaysAgo),

    // Expired messages
    env.DB.prepare(
      "DELETE FROM messages WHERE expires_at > 0 AND expires_at < ?"
    ).bind(now),
  ]);
}
