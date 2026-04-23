/**
 * Pure in-memory rate limiter — no D1 dependency.
 *
 * For a personal project, cross-isolate accuracy is unnecessary.
 * Each isolate maintains its own counters; a cold start resets them.
 * This avoids consuming D1 row-write quota on every request window.
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
      bucket = { count: 1, windowStart: now };
      buckets.set(bucketKey, bucket);
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
    }

    c.header("X-RateLimit-Limit", String(config.maxRequests));
    c.header("X-RateLimit-Remaining", String(Math.max(0, config.maxRequests - bucket.count)));
    c.header("X-RateLimit-Reset", String(bucket.windowStart + config.windowSec));

    return next();
  };
}
