import type { Context, Next } from "hono";
import type { Env } from "./types";

type HonoContext = Context<{ Bindings: Env }>;

interface RateLimitConfig {
  /** Max requests allowed in the window */
  maxRequests: number;
  /** Time window in seconds */
  windowSec: number;
}

/** Per-route rate limit configs */
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Push: 60 requests per minute (generous for automation)
  "POST:/api/push": { maxRequests: 60, windowSec: 60 },
  // Recipients management: 30 per minute
  "GET:/api/recipients": { maxRequests: 30, windowSec: 60 },
  "POST:/api/recipients": { maxRequests: 10, windowSec: 60 },
  "DELETE:/api/recipients": { maxRequests: 10, windowSec: 60 },
  // Message polling: 120 per minute (clients poll frequently)
  "GET:/api/messages": { maxRequests: 120, windowSec: 60 },
  // Subscribe: 20 per minute
  "POST:/api/subscribe": { maxRequests: 20, windowSec: 60 },
};

/** Fallback for any unmatched route */
const DEFAULT_LIMIT: RateLimitConfig = { maxRequests: 60, windowSec: 60 };

function getClientIp(c: HonoContext): string {
  return c.req.header("cf-connecting-ip")
    ?? c.req.header("x-real-ip")
    ?? "unknown";
}

function routeKey(method: string, path: string): string {
  // Normalize: strip trailing slash, collapse path params
  const normalized = path.replace(/\/[0-9a-f-]{36}/g, "/:id").replace(/\/$/, "");
  return `${method}:${normalized}`;
}

/**
 * D1-backed sliding window rate limiter.
 *
 * Uses a simple table: rate_limit_hits(bucket TEXT PK, hit_count INT, window_start INT).
 * On each request, check if we're within the window and under the limit.
 * Expired windows are lazily reset.
 */
export function rateLimiter() {
  return async (c: HonoContext, next: Next) => {
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;

    // Skip health check and config (public endpoints)
    if (path === "/" || path === "/api/config") {
      return next();
    }

    const ip = getClientIp(c);
    const key = routeKey(method, path);
    const config = RATE_LIMITS[key] ?? DEFAULT_LIMIT;
    const bucket = `${ip}:${key}`;
    const now = Math.floor(Date.now() / 1000);

    try {
      const row = await c.env.DB.prepare(
        "SELECT hit_count, window_start FROM rate_limit_hits WHERE bucket = ?"
      ).bind(bucket).first<{ hit_count: number; window_start: number }>();

      let count: number;
      let windowStart: number;

      if (!row || (now - row.window_start) >= config.windowSec) {
        // New window — reset counter
        count = 1;
        windowStart = now;
        await c.env.DB.prepare(
          "INSERT OR REPLACE INTO rate_limit_hits (bucket, hit_count, window_start) VALUES (?, 1, ?)"
        ).bind(bucket, now).run();
      } else {
        count = row.hit_count + 1;
        windowStart = row.window_start;

        if (count > config.maxRequests) {
          const retryAfter = config.windowSec - (now - windowStart);
          c.header("Retry-After", String(retryAfter));
          c.header("X-RateLimit-Limit", String(config.maxRequests));
          c.header("X-RateLimit-Remaining", "0");
          c.header("X-RateLimit-Reset", String(windowStart + config.windowSec));
          return c.json({
            error: "Too many requests",
            retry_after: retryAfter,
          }, 429);
        }

        await c.env.DB.prepare(
          "UPDATE rate_limit_hits SET hit_count = ? WHERE bucket = ?"
        ).bind(count, bucket).run();
      }

      // Set rate limit headers
      c.header("X-RateLimit-Limit", String(config.maxRequests));
      c.header("X-RateLimit-Remaining", String(config.maxRequests - count));
      c.header("X-RateLimit-Reset", String(windowStart + config.windowSec));
    } catch {
      // Rate limiting should never block requests — if DB fails, let it through
      console.error("Rate limit check failed, allowing request through");
    }

    return next();
  };
}
