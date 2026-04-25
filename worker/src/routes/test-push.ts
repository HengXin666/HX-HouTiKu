/**
 * POST /api/test-push — Test push endpoint.
 *
 * Accepts a **plaintext** message, encrypts it server-side using the first
 * recipient's public key (ECIES secp256k1), stores ONE copy globally,
 * then delivers to ALL active devices via WS + Push.
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
  tags?: string[];
  channel_id?: string;
}

const app = new Hono<{ Bindings: Env; Variables: { recipientId?: string } }>();

// ── POST /self — Test push to yourself (Recipient Token auth) ──
app.post("/self", authRecipientToken(), async (c) => {
  // Get any active recipient's public key for encryption
  const anyRecipient = await c.env.DB.prepare(
    "SELECT id, name, public_key FROM recipients WHERE is_active = 1 LIMIT 1"
  ).first<RecipientRow>();

  if (!anyRecipient) {
    return c.json({ error: "No active recipients found" }, 404);
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
    encryptedBase64 = await eciesEncrypt(anyRecipient.public_key, plainPayload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Encryption failed: ${msg}` }, 500);
  }

  // Store ONE global copy
  await c.env.DB.prepare(
    `INSERT INTO messages (id, recipient_id, encrypted_data, priority, content_type, group_name, channel_id, group_key, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(messageId, "", encryptedBase64, "default", "markdown", "general", "default", "", timestamp, timestamp).run();

  // Deliver to ALL active recipients
  const allRecipients = await c.env.DB.prepare(
    "SELECT id, name FROM recipients WHERE is_active = 1"
  ).all<RecipientRow>();

  const pushedTo: string[] = [];
  let anySent = false;
  let anyPush = false;

  const deliveryPayload = {
    id: messageId,
    encrypted_data: encryptedBase64,
    priority: "default" as const,
    content_type: "markdown" as const,
    group: "general",
    timestamp,
    channel_id: "default",
    group_key: "",
  };

  for (const r of allRecipients.results) {
    pushedTo.push(r.name);
    const d = await deliverToRecipient(c.env, r.id, deliveryPayload);
    if (d.ws_sent) anySent = true;
    if (d.push_sent) anyPush = true;
  }

  return c.json({
    status: "ok",
    id: messageId,
    pushed_to: pushedTo,
    ws_sent: anySent,
    push_sent: anyPush,
  }, 201);
});

// ── POST / — Test push to all (Admin/API Token auth) ──
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

  // Get first active recipient's public key for encryption
  const firstRecipient = await c.env.DB.prepare(
    "SELECT id, name, public_key FROM recipients WHERE is_active = 1 LIMIT 1"
  ).first<RecipientRow>();

  if (!firstRecipient) {
    return c.json({ error: "No active recipients found" }, 404);
  }

  let encryptedBase64: string;
  try {
    encryptedBase64 = await eciesEncrypt(firstRecipient.public_key, plainPayload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Encryption failed: ${msg}`, encryption_errors: [msg] }, 500);
  }

  // Store ONE global copy
  await c.env.DB.prepare(
    `INSERT INTO messages (id, recipient_id, encrypted_data, priority, content_type, group_name, channel_id, group_key, timestamp, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(messageId, "", encryptedBase64, priority, "markdown", group, channelId, "", timestamp, timestamp).run();

  // Deliver to ALL active recipients
  const allRecipients = await c.env.DB.prepare(
    "SELECT id, name FROM recipients WHERE is_active = 1"
  ).all<RecipientRow>();

  const pushedTo: string[] = [];
  const wsSent: string[] = [];
  const pushSent: string[] = [];

  const deliveryPayload = {
    id: messageId,
    encrypted_data: encryptedBase64,
    priority,
    content_type: "markdown" as const,
    group,
    timestamp,
    channel_id: channelId,
    group_key: "",
  };

  for (const r of allRecipients.results) {
    pushedTo.push(r.name);
    const d = await deliverToRecipient(c.env, r.id, deliveryPayload);
    if (d.ws_sent) wsSent.push(r.name);
    if (d.push_sent) pushSent.push(r.name);
  }

  return c.json({
    status: "ok",
    id: messageId,
    pushed_to: pushedTo,
    ws_sent: wsSent,
    push_sent: pushSent,
  }, 201);
});

// ─── ECIES Encryption (secp256k1 via @noble/curves) ───

/**
 * ECIES encrypt using secp256k1, compatible with eciesjs v0.4 format.
 *
 * Key derivation: HKDF-SHA256(ikm = ephPub || sharedPoint, salt=undefined, info=undefined) → 32 bytes
 * Symmetric: AES-256-GCM with 16-byte nonce
 * Output: base64( ephemeral_pub_uncompressed(65) || nonce(16) || tag(16) || ciphertext )
 */
async function eciesEncrypt(recipientPubHex: string, plaintext: string): Promise<string> {
  const pubHex = recipientPubHex.startsWith("0x") ? recipientPubHex.slice(2) : recipientPubHex;

  // Generate ephemeral key pair
  const ephPrivKey = secp256k1.utils.randomPrivateKey();
  const ephPubBytes = secp256k1.getPublicKey(ephPrivKey, false); // 65 bytes, uncompressed

  // ECDH: sharedPoint = secp256k1.getSharedSecret(ephPriv, recipientPub, false)
  // eciesjs 使用 compressed 格式的公钥作为 getSharedSecret 的输入
  const recipientPubCompressed = secp256k1.ProjectivePoint.fromHex(pubHex).toRawBytes(true);
  const sharedPointBytes = secp256k1.getSharedSecret(ephPrivKey, recipientPubCompressed, false); // 65 bytes

  // HKDF-SHA256(ikm = ephPub || sharedPoint, salt=undefined, info=undefined) → 32 bytes AES key
  // 与 eciesjs v0.4 的 getSharedKey(senderPoint, sharedPoint) 一致
  const ikm = new Uint8Array(ephPubBytes.length + sharedPointBytes.length);
  ikm.set(ephPubBytes, 0);
  ikm.set(sharedPointBytes, ephPubBytes.length);
  const aesKeyBytes = hkdf(sha256, ikm, undefined, undefined, 32);

  // AES-256-GCM with 16-byte nonce (eciesjs v0.4 default: symmetricNonceLength = 16)
  const nonce = crypto.getRandomValues(new Uint8Array(16));
  const cryptoKey = await crypto.subtle.importKey("raw", aesKeyBytes, "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, tagLength: 128 },
    cryptoKey,
    new TextEncoder().encode(plaintext),
  );

  // WebCrypto AES-GCM 输出: ciphertext || tag
  const encBytes = new Uint8Array(encrypted);
  const ciphertext = encBytes.slice(0, encBytes.length - 16);
  const tag = encBytes.slice(encBytes.length - 16);

  // eciesjs v0.4 格式: ephemeral_pub(65) || nonce(16) || tag(16) || ciphertext
  const result = new Uint8Array(65 + 16 + 16 + ciphertext.length);
  result.set(ephPubBytes, 0);
  result.set(nonce, 65);
  result.set(tag, 81);
  result.set(ciphertext, 97);

  // Base64 encode
  let binary = "";
  for (const byte of result) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export default app;
