/**
 * POST /api/test-push — Test push endpoint.
 *
 * Accepts a **plaintext** message, encrypts it server-side for each target
 * recipient using their stored public key (ECIES secp256k1 via @noble/curves),
 * then delivers via the standard three-layer pipeline (DO WebSocket + Web Push + FCM).
 *
 * Admin-only — bypasses normal client-side encryption for testing.
 */

import { Hono } from "hono";
import { secp256k1 } from "@noble/curves/secp256k1";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import type { Env, RecipientRow } from "../types";
import { authPushToken, authRecipientToken } from "../auth";
import { deliverToRecipient } from "../push-service";

interface TestPushRequest {
  title: string;
  body: string;
  priority?: string;
  group?: string;
  recipients?: string[];
  tags?: string[];
  channel_id?: string;
}

const app = new Hono<{ Bindings: Env; Variables: { recipientId?: string } }>();

// ── POST /self — Test push to yourself (Recipient Token auth) ──
app.post("/self", authRecipientToken(), async (c) => {
  const recipientId = c.get("recipientId");
  if (!recipientId) {
    return c.json({ error: "recipient_id required — check your Recipient Token" }, 400);
  }

  const recipient = await c.env.DB.prepare(
    "SELECT id, name, public_key FROM recipients WHERE id = ? AND is_active = 1"
  )
    .bind(recipientId)
    .first<RecipientRow>();

  if (!recipient) {
    return c.json({ error: "Recipient not found or inactive" }, 404);
  }

  const messageId = crypto.randomUUID();
  const timestamp = Date.now();

  const plainPayload = JSON.stringify({
    title: "🔔 测试推送",
    body: "恭喜！推送管道工作正常 ✅",
    tags: ["test"],
  });

  let encryptedBase64: string;
  try {
    encryptedBase64 = await eciesEncrypt(recipient.public_key, plainPayload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Encryption failed: ${msg}` }, 500);
  }

  await c.env.DB.prepare(
    `INSERT INTO messages (id, recipient_id, encrypted_data, priority, content_type, group_name, channel_id, group_key, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(messageId, recipient.id, encryptedBase64, "default", "markdown", "general", "default", "", timestamp, timestamp).run();

  const delivery = await deliverToRecipient(c.env, recipient.id, {
    id: messageId,
    encrypted_data: encryptedBase64,
    priority: "default",
    content_type: "markdown",
    group: "general",
    timestamp,
    channel_id: "default",
    group_key: "",
  });

  return c.json({
    status: "ok",
    id: messageId,
    pushed_to: [recipient.name],
    ws_sent: delivery.ws_sent,
    push_sent: delivery.push_sent,
  }, 201);
});

// ── POST / — Test push to all/specified recipients (Admin/API Token auth) ──
app.post("/", authPushToken(), async (c) => {
  const body = await c.req.json<TestPushRequest>();

  if (!body.title || !body.body) {
    return c.json({ error: "title and body are required" }, 400);
  }

  const messageId = crypto.randomUUID();
  const priority = body.priority ?? "default";
  const group = body.group ?? "general";
  const channelId = body.channel_id ?? "default";
  const timestamp = Date.now();

  const plainPayload = JSON.stringify({
    title: body.title,
    body: body.body,
    tags: body.tags ?? [],
  });

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
  const wsSent: string[] = [];
  const pushSent: string[] = [];
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
        `INSERT INTO messages (id, recipient_id, encrypted_data, priority, content_type, group_name, channel_id, group_key, timestamp, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(msgId, recipient.id, encryptedBase64, priority, "markdown", group, channelId, "", timestamp, timestamp)
    );

    pushedTo.push(name);

    const delivery = await deliverToRecipient(c.env, recipient.id, {
      id: msgId,
      encrypted_data: encryptedBase64,
      priority,
      content_type: "markdown",
      group,
      timestamp,
      channel_id: channelId,
      group_key: "",
    });

    if (delivery.ws_sent) wsSent.push(name);
    if (delivery.push_sent) pushSent.push(name);
  }

  if (statements.length > 0) {
    await c.env.DB.batch(statements);
  }

  return c.json({
    status: "ok",
    id: messageId,
    pushed_to: pushedTo,
    ws_sent: wsSent,
    push_sent: pushSent,
    encryption_errors: encryptionErrors.length > 0 ? encryptionErrors : undefined,
  }, 201);
});

// ─── ECIES Encryption (secp256k1 via @noble/curves) ───

/**
 * ECIES encrypt using secp256k1, compatible with eciesjs v0.4 format.
 *
 * Output: base64( ephemeral_pub_uncompressed(65) || iv(16) || tag(16) || ciphertext )
 */
async function eciesEncrypt(recipientPubHex: string, plaintext: string): Promise<string> {
  const pubHex = recipientPubHex.startsWith("0x") ? recipientPubHex.slice(2) : recipientPubHex;

  // Use @noble/curves to decompress / validate the public key
  const pubPoint = secp256k1.ProjectivePoint.fromHex(pubHex);
  const recipientPubBytes = pubPoint.toRawBytes(false); // 65 bytes, uncompressed

  // Generate ephemeral key pair
  const ephPrivKey = secp256k1.utils.randomPrivateKey();
  const ephPubPoint = secp256k1.ProjectivePoint.BASE.multiply(
    bytesToBigint(ephPrivKey)
  );
  const ephPubBytes = ephPubPoint.toRawBytes(false); // 65 bytes

  // ECDH: shared = ephPriv × recipientPub
  const sharedPoint = pubPoint.multiply(bytesToBigint(ephPrivKey));
  const sharedX = bigintToBytes(sharedPoint.x, 32);

  // HKDF-SHA256(ikm=shared_x, salt='', info='') → 32 bytes AES key
  const aesKeyBytes = hkdf(sha256, sharedX, new Uint8Array(0), new Uint8Array(0), 32);

  // AES-256-GCM
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const cryptoKey = await crypto.subtle.importKey("raw", aesKeyBytes, "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  );

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

function bytesToBigint(bytes: Uint8Array): bigint {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return BigInt("0x" + (hex || "0"));
}

function bigintToBytes(n: bigint, len: number): Uint8Array {
  const hex = n.toString(16).padStart(len * 2, "0");
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export default app;
