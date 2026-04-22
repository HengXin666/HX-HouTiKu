/**
 * Device cloning — transfer encrypted key bundle between devices.
 *
 * Flow:
 *   1. Old device: POST /api/clone/offer  { encrypted_bundle }
 *      → Returns { code: "ABCD1234", expires_at }
 *   2. New device: POST /api/clone/claim  { code: "ABCD1234" }
 *      → Returns { encrypted_bundle }
 *   3. New device decrypts bundle locally using master password
 *
 * Storage: D1 table `clone_offers` (persistent across isolates).
 * Codes expire after 5 minutes and are single-use.
 */

import { Hono } from "hono";
import type { Env } from "../types";
import { authRecipientToken } from "../auth";

const app = new Hono<{ Bindings: Env; Variables: { recipientId?: string } }>();

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
const EXPIRE_MS = 5 * 60_000; // 5 minutes

function generateCode(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => CHARSET[b % CHARSET.length]).join("");
}

// ── POST /offer — Old device uploads encrypted key bundle ──
app.post("/offer", authRecipientToken(), async (c) => {
  const { encrypted_bundle } = await c.req.json<{ encrypted_bundle: string }>();

  if (!encrypted_bundle) {
    return c.json({ error: "encrypted_bundle is required" }, 400);
  }

  // Clean expired offers
  await c.env.DB.prepare(
    "DELETE FROM clone_offers WHERE expires_at < ?"
  ).bind(Date.now()).run();

  // Generate unique 8-char code
  let code: string;
  let attempts = 0;
  do {
    code = generateCode();
    attempts++;
    const existing = await c.env.DB.prepare(
      "SELECT code FROM clone_offers WHERE code = ?"
    ).bind(code).first();
    if (!existing) break;
  } while (attempts < 20);

  const expiresAt = Date.now() + EXPIRE_MS;

  await c.env.DB.prepare(
    "INSERT INTO clone_offers (code, encrypted_bundle, expires_at, claimed) VALUES (?, ?, ?, 0)"
  ).bind(code, encrypted_bundle, expiresAt).run();

  return c.json({
    code,
    expires_at: expiresAt,
    expires_in_seconds: Math.floor(EXPIRE_MS / 1000),
  }, 201);
});

// ── POST /claim — New device downloads encrypted key bundle ──
app.post("/claim", async (c) => {
  const { code } = await c.req.json<{ code: string }>();

  if (!code) {
    return c.json({ error: "code is required" }, 400);
  }

  const normalizedCode = code.trim().toUpperCase();

  // Clean expired
  await c.env.DB.prepare(
    "DELETE FROM clone_offers WHERE expires_at < ?"
  ).bind(Date.now()).run();

  const offer = await c.env.DB.prepare(
    "SELECT code, encrypted_bundle, expires_at, claimed FROM clone_offers WHERE code = ?"
  ).bind(normalizedCode).first<{
    code: string;
    encrypted_bundle: string;
    expires_at: number;
    claimed: number;
  }>();

  if (!offer) {
    return c.json({ error: "无效或已过期的配对码" }, 404);
  }

  if (offer.claimed) {
    return c.json({ error: "此配对码已被使用" }, 410);
  }

  if (offer.expires_at < Date.now()) {
    await c.env.DB.prepare("DELETE FROM clone_offers WHERE code = ?").bind(normalizedCode).run();
    return c.json({ error: "配对码已过期" }, 410);
  }

  // Mark claimed and delete
  await c.env.DB.prepare("DELETE FROM clone_offers WHERE code = ?").bind(normalizedCode).run();

  return c.json({
    encrypted_bundle: offer.encrypted_bundle,
  });
});

// ── POST /cancel — Delete a pending offer (when user leaves the page) ──
app.post("/cancel", authRecipientToken(), async (c) => {
  const { code } = await c.req.json<{ code: string }>();

  if (!code) {
    return c.json({ error: "code is required" }, 400);
  }

  await c.env.DB.prepare("DELETE FROM clone_offers WHERE code = ?").bind(code.trim().toUpperCase()).run();

  return c.json({ ok: true });
});

export default app;
