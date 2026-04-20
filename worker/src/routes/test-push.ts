/**
 * POST /api/test-push — Test push endpoint.
 *
 * Accepts a **plaintext** message (title + body), encrypts it
 * server-side for each target recipient using their stored public key,
 * then delegates to the standard push pipeline (DB insert + Web Push / FCM).
 *
 * This is intentionally admin-only — it bypasses the normal client-side
 * encryption workflow and is meant solely for verifying that the push
 * pipeline works end-to-end.
 *
 * Request body:
 *   {
 *     "title": "Test message",
 *     "body":  "Hello from the server!",
 *     "priority": "default",          // optional
 *     "group": "general",             // optional
 *     "recipients": ["my-phone"],     // optional — all active if omitted
 *     "tags": ["test"]                // optional
 *   }
 */

import { Hono } from "hono";
import type { Env, RecipientRow, PushSubscriptionRow } from "../types";
import { authPushToken } from "../auth";

interface TestPushRequest {
  title: string;
  body: string;
  priority?: string;
  group?: string;
  recipients?: string[];
  tags?: string[];
}

const app = new Hono<{ Bindings: Env }>();

app.post("/", authPushToken(), async (c) => {
  const body = await c.req.json<TestPushRequest>();

  if (!body.title || !body.body) {
    return c.json({ error: "title and body are required" }, 400);
  }

  const messageId = crypto.randomUUID();
  const priority = body.priority ?? "default";
  const group = body.group ?? "general";
  const timestamp = Date.now();
  const now = timestamp;

  // Build the plaintext payload (same JSON structure that clients expect after decryption)
  const plainPayload = JSON.stringify({
    title: body.title,
    body: body.body,
    tags: body.tags ?? [],
  });

  // Resolve target recipients
  let targetNames = body.recipients;
  if (!targetNames || targetNames.length === 0) {
    const allRecipients = await c.env.DB.prepare(
      "SELECT name FROM recipients WHERE is_active = 1"
    ).all<RecipientRow>();
    targetNames = allRecipients.results.map((r) => r.name);
  }

  if (targetNames.length === 0) {
    return c.json({ error: "No active recipients found" }, 404);
  }

  const pushedTo: string[] = [];
  const webPushSent: string[] = [];
  const encryptionErrors: string[] = [];
  const statements: D1PreparedStatement[] = [];

  for (const name of targetNames) {
    const recipient = await c.env.DB.prepare(
      "SELECT id, public_key FROM recipients WHERE name = ? AND is_active = 1"
    )
      .bind(name)
      .first<RecipientRow>();

    if (!recipient) {
      encryptionErrors.push(`${name}: not found`);
      continue;
    }

    // Encrypt the plaintext payload using the recipient's public key (ECIES secp256k1)
    let encryptedBase64: string;
    try {
      encryptedBase64 = await eciesEncrypt(recipient.public_key, plainPayload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      encryptionErrors.push(`${name}: encryption failed — ${msg}`);
      continue;
    }

    const msgId = targetNames.length === 1 ? messageId : `${messageId}_${name}`;

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO messages (id, recipient_id, encrypted_data, priority, content_type, group_name, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(msgId, recipient.id, encryptedBase64, priority, "markdown", group, timestamp, now)
    );

    pushedTo.push(name);

    // ── Send push notifications ──
    const subs = await c.env.DB.prepare(
      "SELECT * FROM push_subscriptions WHERE recipient_id = ?"
    )
      .bind(recipient.id)
      .all<PushSubscriptionRow>();

    if (subs.results.length > 0) {
      webPushSent.push(name);

      const pushPayload = JSON.stringify({
        type: "new_message",
        message: {
          id: msgId,
          encrypted_data: encryptedBase64,
          priority,
          content_type: "markdown",
          group,
          timestamp,
          is_read: false,
        },
      });

      for (const sub of subs.results) {
        try {
          if (sub.endpoint.startsWith("fcm://")) {
            await sendFcmPush(c.env, sub, pushPayload, priority, group);
          } else {
            await sendWebPush(c.env, sub, pushPayload);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Push failed for sub ${sub.id}: ${msg}`);

          if (msg.includes("410") || msg.includes("expired")) {
            await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?")
              .bind(sub.id)
              .run();
          }
        }
      }
    }
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({
    status: "ok",
    id: messageId,
    pushed_to: pushedTo,
    web_push_sent: webPushSent,
    encryption_errors: encryptionErrors.length > 0 ? encryptionErrors : undefined,
  }, 201);
});

// ─── ECIES Encryption (secp256k1, compatible with eciesjs / eciespy / Android BouncyCastle) ───

/**
 * Encrypt plaintext using ECIES on secp256k1.
 *
 * Output format (compatible with eciesjs v0.4):
 *   ephemeral_uncompressed_pubkey (65 bytes) || iv (16 bytes) || tag (16 bytes) || ciphertext
 *
 * Steps:
 *   1. Generate an ephemeral secp256k1 key pair
 *   2. ECDH shared secret = ephemeral_private × recipient_public
 *   3. HKDF-SHA256(ikm=shared_x, salt='', info='') → 32 bytes AES key
 *   4. AES-256-GCM(key, iv=random_16, plaintext) → (ciphertext, tag)
 *   5. Concatenate: ephemeral_pub(65) || iv(16) || tag(16) || ciphertext
 *   6. Base64 encode the result
 */
async function eciesEncrypt(recipientPubHex: string, plaintext: string): Promise<string> {
  // Import the recipient's public key (uncompressed, 65 bytes starting with 0x04)
  let pubBytes = hexToBytes(recipientPubHex);

  // If compressed (33 bytes), we need to decompress. For simplicity in Workers runtime,
  // we require uncompressed keys (the frontend/SDK always stores uncompressed 65-byte keys).
  if (pubBytes.length === 33) {
    throw new Error("Compressed public keys not supported in test-push; use uncompressed (65-byte) keys");
  }
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error(`Invalid public key: expected 65-byte uncompressed key starting with 0x04, got ${pubBytes.length} bytes`);
  }

  // Generate ephemeral key pair
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Since Workers crypto doesn't support secp256k1 natively, we use a pure-JS approach:
  // We'll use the eciesjs-compatible format but leverage the existing push.ts's web crypto
  // for the AES-GCM part. However, secp256k1 ECDH is not available in Web Crypto.
  //
  // Alternative strategy: use a simpler encryption that the client can still decrypt.
  // Actually, the cleanest approach for a TEST endpoint is to use a known working method.
  //
  // Since this is a Cloudflare Worker and secp256k1 is NOT supported in WebCrypto,
  // we'll take a different approach: call the existing push pipeline with pre-encrypted data.
  // But wait — we need to actually encrypt.
  //
  // The pragmatic solution: implement ECIES using pure JavaScript math for secp256k1.
  // This is a test-only endpoint so performance isn't critical.

  // We'll use a simplified approach — since the Worker environment may not support secp256k1,
  // let's use a mini elliptic curve implementation.
  return eciesEncryptSecp256k1(pubBytes, new TextEncoder().encode(plaintext));
}

// ─── Pure-JS secp256k1 ECIES for Cloudflare Workers ───

// secp256k1 curve parameters
const P = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F");
const N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
const Gx = BigInt("0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798");
const Gy = BigInt("0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8");

function mod(a: bigint, m: bigint): bigint {
  return ((a % m) + m) % m;
}

function modInv(a: bigint, m: bigint): bigint {
  let [old_r, r] = [a, m];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) {
    const q = old_r / r;
    [old_r, r] = [r, old_r - q * r];
    [old_s, s] = [s, old_s - q * s];
  }
  return mod(old_s, m);
}

type Point = { x: bigint; y: bigint } | null;

function pointAdd(p1: Point, p2: Point): Point {
  if (!p1) return p2;
  if (!p2) return p1;
  if (p1.x === p2.x && p1.y === p2.y) {
    // Point doubling
    const s = mod(3n * p1.x * p1.x * modInv(2n * p1.y, P), P);
    const x = mod(s * s - 2n * p1.x, P);
    const y = mod(s * (p1.x - x) - p1.y, P);
    return { x, y };
  }
  if (p1.x === p2.x) return null; // point at infinity
  const s = mod((p2.y - p1.y) * modInv(p2.x - p1.x, P), P);
  const x = mod(s * s - p1.x - p2.x, P);
  const y = mod(s * (p1.x - x) - p1.y, P);
  return { x, y };
}

function pointMul(k: bigint, p: Point): Point {
  let result: Point = null;
  let addend = p;
  let scalar = k;
  while (scalar > 0n) {
    if (scalar & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    scalar >>= 1n;
  }
  return result;
}

function bigintToBytes(n: bigint, len: number): Uint8Array {
  const hex = n.toString(16).padStart(len * 2, "0");
  return hexToBytes(hex);
}

function bytesToBigint(bytes: Uint8Array): bigint {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt("0x" + (hex || "0"));
}

function pointToUncompressed(p: Point): Uint8Array {
  if (!p) throw new Error("Cannot serialize point at infinity");
  const result = new Uint8Array(65);
  result[0] = 0x04;
  result.set(bigintToBytes(p.x, 32), 1);
  result.set(bigintToBytes(p.y, 32), 33);
  return result;
}

function parseUncompressedPoint(bytes: Uint8Array): Point {
  if (bytes.length !== 65 || bytes[0] !== 0x04) throw new Error("Invalid uncompressed point");
  const x = bytesToBigint(bytes.slice(1, 33));
  const y = bytesToBigint(bytes.slice(33, 65));
  return { x, y };
}

async function hkdfSha256(ikm: Uint8Array, length: number): Promise<Uint8Array> {
  // HKDF with empty salt and empty info (eciesjs default)
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new Uint8Array(0) },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

async function eciesEncryptSecp256k1(recipientPubBytes: Uint8Array, plaintext: Uint8Array): Promise<string> {
  const G: Point = { x: Gx, y: Gy };
  const recipientPoint = parseUncompressedPoint(recipientPubBytes);

  // Generate ephemeral private key
  const ephPrivBytes = crypto.getRandomValues(new Uint8Array(32));
  let ephPriv = bytesToBigint(ephPrivBytes);
  // Ensure it's in valid range [1, N-1]
  ephPriv = mod(ephPriv, N - 1n) + 1n;

  // Ephemeral public key
  const ephPub = pointMul(ephPriv, G);
  const ephPubBytes = pointToUncompressed(ephPub);

  // ECDH: shared = ephPriv × recipientPub
  const shared = pointMul(ephPriv, recipientPoint);
  if (!shared) throw new Error("ECDH resulted in point at infinity");

  // Use shared secret x-coordinate as IKM for HKDF
  const sharedX = bigintToBytes(shared.x, 32);
  const aesKey = await hkdfSha256(sharedX, 32);

  // AES-256-GCM encryption
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const cryptoKey = await crypto.subtle.importKey("raw", aesKey, "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    cryptoKey,
    plaintext
  );

  // encrypted contains ciphertext + tag (last 16 bytes)
  const encBytes = new Uint8Array(encrypted);
  const ciphertext = encBytes.slice(0, encBytes.length - 16);
  const tag = encBytes.slice(encBytes.length - 16);

  // eciesjs format: ephemeral_pub(65) || iv(16) || tag(16) || ciphertext
  const result = new Uint8Array(65 + 16 + 16 + ciphertext.length);
  result.set(ephPubBytes, 0);
  result.set(iv, 65);
  result.set(tag, 81);
  result.set(ciphertext, 97);

  // Base64 encode
  let binary = "";
  for (const byte of result) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// ─── Push helpers (copied from push.ts to avoid circular deps) ───

async function sendFcmPush(
  env: Env,
  sub: PushSubscriptionRow,
  payload: string,
  priority: string,
  group: string,
): Promise<void> {
  if (!env.FCM_SERVICE_ACCOUNT) {
    console.warn("FCM_SERVICE_ACCOUNT not configured — skipping native push");
    return;
  }

  const { sendFcmPush: fcmSend } = await import("../fcm");
  const deviceToken = sub.endpoint.replace("fcm://", "");

  await fcmSend(env.FCM_SERVICE_ACCOUNT, {
    deviceToken,
    payload,
    priority,
    group,
  });
}

async function sendWebPush(
  env: Env,
  sub: PushSubscriptionRow,
  payload: string
): Promise<void> {
  const { generatePushHTTPRequest } = await import("../webpush");

  const { headers, body, endpoint } = await generatePushHTTPRequest({
    applicationServerKeys: {
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    },
    payload,
    target: {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.key_p256dh,
        auth: sub.key_auth,
      },
    },
    adminContact: "mailto:admin@hx-houtiku.dev",
    ttl: 60 * 60,
  });

  const resp = await fetch(endpoint, { method: "POST", headers, body });

  if (!resp.ok) {
    const respBody = await resp.text().catch(() => "");
    if (resp.status === 410 || resp.status === 404) {
      throw new Error("410 Subscription expired");
    }
    throw new Error(`Web Push failed: ${resp.status} — ${respBody}`);
  }
}

// ─── Hex helpers ───

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

export default app;
