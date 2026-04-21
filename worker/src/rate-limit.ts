/**
 * Two-layer rate limiter: in-memory cache + D1 persistent storage.
 *
 * Layer 1 (memory): Fast path — check and increment in-memory counters.
 *   This handles most requests within a single isolate's lifetime.
 *
 * Layer 2 (D1): Slow path — periodically sync with D1 for cross-isolate accuracy.
 *   On cold start or when a window expires, read from D1 to get the true count
 *   across all isolates, then write back periodically.
 *
 * This design avoids D1 queries on every request while still providing
 * meaningful rate limiting across Worker isolates.
 */

import type { Context, Next } from "hono";
import type { Env } from "./types";

type HonoContext = Context<{ Bindings: Env }>;

interface RateLimitConfig {
  maxRequests: number;
  windowSec: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "POST:/api/push": { maxRequests: 60, windowSec: 60 },
  "GET:/api/recipients": { maxRequests: 30, windowSec: 60 },
  "POST:/api/recipients": { maxRequests: 10, windowSec: 60 },
  "DELETE:/api/recipients": { maxRequests: 10, windowSec: 60 },
  "GET:/api/messages": { maxRequests: 30, windowSec: 60 },
  "POST:/api/subscribe": { maxRequests: 20, windowSec: 60 },
  "POST:/api/test-push": { maxRequests: 10, windowSec: 60 },
  "GET:/api/ws": { maxRequests: 10, windowSec: 60 },
};

const DEFAULT_LIMIT: RateLimitConfig = { maxRequests: 60, windowSec: 60 };

interface Bucket {
  count: number;
  windowStart: number;
  /** Whether this bucket has been synced from D1 in this window */
  synced: boolean;
}

const buckets = new Map<string, Bucket>();

let lastPrune = 0;
const PRUNE_INTERVAL = 120;

function pruneBuckets(now: number) {
  if (now - lastPrune < PRUNE_INTERVAL) return;
  lastPrune = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > 300) {
      buckets.delete(key);
    }
  }
}

function getClientIp(c: HonoContext): string {
  return c.req.header("cf-connecting-ip")
    ?? c.req.header("x-real-ip")
    ?? "unknown";
}

function routeKey(method: string, path: string): string {
  const normalized = path.replace(/\/[0-9a-f-]{36}/g, "/:id").replace(/\/$/, "");
  return `${method}:${normalized}`;
}

export function rateLimiter() {
  return async (c: HonoContext, next: Next) => {
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;

    if (path === "/" || path === "/api/config" || path === "/api/channels") {
      return next();
    }

    const ip = getClientIp(c);
    const key = routeKey(method, path);
    const config = RATE_LIMITS[key] ?? DEFAULT_LIMIT;
    const bucketKey = `${ip}:${key}`;
    const now = Math.floor(Date.now() / 1000);

    pruneBuckets(now);

    let bucket = buckets.get(bucketKey);

    if (!bucket || (now - bucket.windowStart) >= config.windowSec) {
      // New window — try to sync from D1 for cross-isolate accuracy
      let d1Count = 0;
      try {
        const row = await c.env.DB.prepare(
          "SELECT hit_count, window_start FROM rate_limit_hits WHERE bucket = ?"
        ).bind(bucketKey).first<{ hit_count: number; window_start: number }>();

        if (row && (now - row.window_start) < config.windowSec) {
          d1Count = row.hit_count;
        }
      } catch {
        // D1 failure — fall back to memory-only
      }

      bucket = { count: d1Count + 1, windowStart: now, synced: true };
      buckets.set(bucketKey, bucket);

      // Write to D1 (fire-and-forget)
      c.executionCtx.waitUntil(
        c.env.DB.prepare(
          `INSERT INTO rate_limit_hits (bucket, hit_count, window_start) VALUES (?, ?, ?)
           ON CONFLICT(bucket) DO UPDATE SET hit_count = ?, window_start = ?`
        ).bind(bucketKey, bucket.count, now, bucket.count, now).run().catch(() => {})
      );
    } else {
      bucket.count++;

      if (bucket.count > config.maxRequests) {
        const retryAfter = config.windowSec - (now - bucket.windowStart);
        c.header("Retry-After", String(retryAfter));
        c.header("X-RateLimit-Limit", String(config.maxRequests));
        c.header("X-RateLimit-Remaining", "0");
        c.header("X-RateLimit-Reset", String(bucket.windowStart + config.windowSec));
        return c.json({ error: "Too many requests", retry_after: retryAfter }, 429);
      }

      // Periodic D1 sync (every 10 requests)
      if (bucket.count % 10 === 0) {
        c.executionCtx.waitUntil(
          c.env.DB.prepare(
            `INSERT INTO rate_limit_hits (bucket, hit_count, window_start) VALUES (?, ?, ?)
             ON CONFLICT(bucket) DO UPDATE SET hit_count = ?, window_start = ?`
          ).bind(bucketKey, bucket.count, bucket.windowStart, bucket.count, bucket.windowStart).run().catch(() => {})
        );
      }
    }

    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header("X-RateLimit-Remaining", String(Math.max(0, config.maxRequests - bucket.count)));
    c.header("X-RateLimit-Reset", String(bucket.windowStart + config.windowSec));

    return next();
  };
}
