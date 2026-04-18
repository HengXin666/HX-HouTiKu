import type { Context, Next } from "hono";
import type { Env, ApiTokenRow, RecipientRow } from "./types";

type HonoContext = Context<{ Bindings: Env; Variables: AuthVariables }>;

interface AuthVariables {
  recipientId?: string;
  tokenPermissions?: string[];
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function extractBearer(header: string | undefined): string | null {
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7).trim();
}

/**
 * Authenticate as admin (ADMIN_TOKEN env var) or API token from DB.
 * Sets `tokenPermissions` on context.
 */
export function authPushToken() {
  return async (c: HonoContext, next: Next) => {
    const token = extractBearer(c.req.header("Authorization"));
    if (!token) {
      return c.json({ error: "Missing Authorization header" }, 401);
    }

    // Check admin token first
    if (token === c.env.ADMIN_TOKEN) {
      c.set("tokenPermissions", ["push", "read", "admin"]);
      return next();
    }

    // Check DB tokens
    const hash = await sha256(token);
    const row = await c.env.DB.prepare(
      "SELECT * FROM api_tokens WHERE token_hash = ? AND is_active = 1"
    )
      .bind(hash)
      .first<ApiTokenRow>();

    if (!row) {
      return c.json({ error: "Invalid API token" }, 401);
    }

    // Update last_used_at
    await c.env.DB.prepare(
      "UPDATE api_tokens SET last_used_at = ? WHERE id = ?"
    )
      .bind(Date.now(), row.id)
      .run();

    c.set("tokenPermissions", JSON.parse(row.permissions));
    return next();
  };
}

/**
 * Authenticate as a recipient using `rt_` prefixed token.
 * Token format: `rt_{recipient_id}_{random}` — but we just hash and lookup.
 * For simplicity in v1, recipient token = `rt_{recipient_id}`.
 */
export function authRecipientToken() {
  return async (c: HonoContext, next: Next) => {
    const token = extractBearer(c.req.header("Authorization"));
    if (!token) {
      return c.json({ error: "Missing Authorization header" }, 401);
    }

    // Admin token has full access
    if (token === c.env.ADMIN_TOKEN) {
      // Admin can optionally specify recipient via query param
      const recipientId = c.req.query("recipient_id");
      if (recipientId) c.set("recipientId", recipientId);
      c.set("tokenPermissions", ["push", "read", "admin"]);
      return next();
    }

    // Recipient token: rt_{recipient_id}
    if (!token.startsWith("rt_")) {
      return c.json({ error: "Invalid recipient token format" }, 401);
    }

    const recipientId = token.slice(3);
    const row = await c.env.DB.prepare(
      "SELECT id FROM recipients WHERE id = ? AND is_active = 1"
    )
      .bind(recipientId)
      .first<RecipientRow>();

    if (!row) {
      return c.json({ error: "Invalid recipient token" }, 401);
    }

    c.set("recipientId", recipientId);
    return next();
  };
}
