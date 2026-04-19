import type { Env } from "./types";

/**
 * Scheduled cleanup — runs via Cron Trigger.
 * - Remove debug messages older than 30 days
 * - Remove read messages older than 90 days
 * - Remove expired messages
 * - Clean up stale rate limit buckets
 */
export async function handleScheduled(env: Env): Promise<void> {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
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

    // Note: rate limiting is now in-memory, so rate_limit_hits table is unused.
    // Clean up any leftover rows from the old D1-based rate limiter.
    env.DB.prepare("DELETE FROM rate_limit_hits WHERE 1=1"),
  ]);
}
