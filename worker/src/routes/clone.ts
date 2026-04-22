/**
 * Device cloning — transfer encrypted key bundle between devices.
 *
 * Flow:
 *   1. Old device: POST /api/clone/offer  { encrypted_bundle }
 *      → Returns { code: "123456", expires_at }
 *   2. New device: POST /api/clone/claim  { code: "123456" }
 *      → Returns { encrypted_bundle }
 *   3. New device decrypts bundle locally using master password
 *
 * The bundle is encrypted by the old device before upload (AES-GCM with
 * master password), so the server never sees plaintext keys.
 *
 * Codes expire after 5 minutes and are single-use.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { authRecipientToken } from "../auth";

const app = new Hono<{ Bindings: Env; Variables: { recipientId?: string } }>();

// In-memory store for pending clone offers (lives in Worker isolate).
// For production with multiple isolates, use KV or D1. This is fine for
// single-user self-hosted use.
interface CloneOffer {
  encrypted_bundle: string;
  expires_at: number;
  claimed: boolean;
}

const pendingOffers = new Map<string, CloneOffer>();

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 无 I/O/0/1 避免混淆

function generateCode(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => CHARSET[b % CHARSET.length]).join("");
}

function cleanExpired() {
  const now = Date.now();
  for (const [code, offer] of pendingOffers) {
    if (offer.expires_at < now) pendingOffers.delete(code);
  }
}

const EXPIRE_MS = 5 * 60_000; // 5 minutes

// ── POST /offer — Old device uploads encrypted key bundle ──
app.post("/offer", authRecipientToken(), async (c) => {
  const { encrypted_bundle } = await c.req.json<{ encrypted_bundle: string }>();

  if (!encrypted_bundle) {
    return c.json({ error: "encrypted_bundle is required" }, 400);
  }

  cleanExpired();

  // Generate unique 6-digit code
  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
  } while (pendingOffers.has(code) && attempts < 20);

  const expiresAt = Date.now() + EXPIRE_MS;

  pendingOffers.set(code, {
    encrypted_bundle,
    expires_at: expiresAt,
    claimed: false,
  });

  return c.json({
    code,
    expires_at: expiresAt,
    expires_in_seconds: Math.floor(EXPIRE_MS / 1000),
  }, 201);
});

// ── POST /claim — New device downloads encrypted key bundle ──
app.post("/claim", async (c) => {
  // No auth required — the code IS the auth
  const { code } = await c.req.json<{ code: string }>();

  if (!code) {
    return c.json({ error: "code is required" }, 400);
  }

  cleanExpired();

  const offer = pendingOffers.get(code);

  if (!offer) {
    return c.json({ error: "无效或已过期的配对码" }, 404);
  }

  if (offer.claimed) {
    return c.json({ error: "此配对码已被使用" }, 410);
  }

  if (offer.expires_at < Date.now()) {
    pendingOffers.delete(code);
    return c.json({ error: "配对码已过期" }, 410);
  }

  // Mark as claimed and delete
  offer.claimed = true;
  pendingOffers.delete(code);

  return c.json({
    encrypted_bundle: offer.encrypted_bundle,
  });
});

export default app;
