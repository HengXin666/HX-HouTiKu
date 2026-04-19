/**
 * Web Push (VAPID + RFC 8291 aes128gcm) for Cloudflare Workers.
 *
 * Implements the full Web Push encryption pipeline:
 *   1. VAPID JWT signing (RFC 8292) — authenticates the application server
 *   2. Payload encryption (RFC 8291 / aes128gcm) — encrypts the push payload
 *      using ECDH key agreement with the client's push subscription keys
 *
 * References:
 *   - RFC 8291: Message Encryption for Web Push
 *   - RFC 8188: Encrypted Content-Encoding for HTTP (aes128gcm)
 *   - RFC 8292: Voluntary Application Server Identification (VAPID)
 */

export interface PushTarget {
  endpoint: string;
  keys: {
    /** Client's P-256 public key (base64url-encoded, 65 bytes uncompressed) */
    p256dh: string;
    /** Client's auth secret (base64url-encoded, 16 bytes) */
    auth: string;
  };
}

export interface PushOptions {
  applicationServerKeys: {
    publicKey: string;  // VAPID public key (base64url, 65 bytes uncompressed)
    privateKey: string; // VAPID private key (base64url, 32 bytes raw scalar)
  };
  payload: string;
  target: PushTarget;
  adminContact: string; // mailto: or https: URL
  ttl: number;
  urgency?: "very-low" | "low" | "normal" | "high";
}

export interface PushHTTPRequest {
  headers: Headers;
  body: Uint8Array;
  endpoint: string;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Base64url helpers
// ═══════════════════════════════════════════════════════════════════════════

function b64urlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function textEncode(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLen = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
//  VAPID JWT (ES256 / RFC 8292)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Wrap a raw 32-byte P-256 private scalar into PKCS8 DER.
 * The ASN.1 structure is fixed for P-256, so we hard-code the envelope.
 */
function buildPkcs8P256(rawKey: Uint8Array): ArrayBuffer {
  const header = new Uint8Array([
    0x30, 0x41,
    0x02, 0x01, 0x00,
    0x30, 0x13,
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
    0x04, 0x27,
    0x30, 0x25,
    0x02, 0x01, 0x01,
    0x04, 0x20,
  ]);
  const result = new Uint8Array(header.length + 32);
  result.set(header);
  result.set(rawKey, header.length);
  return result.buffer;
}

async function importECDSAPrivateKey(rawKeyB64url: string): Promise<CryptoKey> {
  const rawKey = b64urlDecode(rawKeyB64url);
  return crypto.subtle.importKey(
    "pkcs8",
    buildPkcs8P256(rawKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function createVapidJwt(
  audience: string,
  subject: string,
  privateKey: CryptoKey,
  expSeconds: number,
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + expSeconds, sub: subject };

  const h = b64urlEncode(textEncode(JSON.stringify(header)));
  const p = b64urlEncode(textEncode(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    textEncode(signingInput),
  );

  // SubtleCrypto returns IEEE P1363 format (r||s, 64 bytes) — exactly what JWT ES256 expects
  return `${signingInput}.${b64urlEncode(new Uint8Array(signature))}`;
}

// ═══════════════════════════════════════════════════════════════════════════
//  RFC 8291 — Web Push Message Encryption (aes128gcm)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Import client's P-256 public key for ECDH key agreement.
 */
async function importClientPublicKey(b64url: string): Promise<CryptoKey> {
  const raw = b64urlDecode(b64url);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
}

/**
 * Generate an ephemeral P-256 key pair for ECDH.
 */
async function generateEphemeralKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,  // extractable — we need to export the public key
    ["deriveBits"],
  );
}

/**
 * HKDF — derive key material.
 * RFC 5869: HMAC-based Extract-and-Expand Key Derivation Function.
 */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Build the info string for HKDF, as specified in RFC 8291 Section 3.4.
 *
 * info = "WebPush: info\0" || ua_public || as_public
 *
 * For the content encryption key and nonce, we use:
 *   CEK info = "Content-Encoding: aes128gcm\0\1"
 *   Nonce info = "Content-Encoding: nonce\0\1"
 */
function buildInfo(
  type: "aesgcm" | "nonce",
  clientPublicKey: Uint8Array,
  serverPublicKey: Uint8Array,
): Uint8Array {
  // For aes128gcm, the info for IKM derivation is:
  // "WebPush: info\0" + client_public(65) + server_public(65)
  // This is used to derive the IKM from the ECDH shared secret and auth secret.
  // But we also need separate info strings for CEK and nonce derivation.

  if (type === "aesgcm") {
    // Content-Encoding: aes128gcm\0 + \1
    return concat(textEncode("Content-Encoding: aes128gcm\0"), new Uint8Array([1]));
  }
  // Content-Encoding: nonce\0 + \1
  return concat(textEncode("Content-Encoding: nonce\0"), new Uint8Array([1]));
}

/**
 * Encrypt the push payload according to RFC 8291 (aes128gcm encoding).
 *
 * Steps:
 * 1. Generate ephemeral ECDH key pair
 * 2. ECDH shared secret = ecdh(ephemeral_private, client_public)
 * 3. Derive IKM from auth_secret + shared_secret using HKDF with
 *    info = "WebPush: info\0" + client_public + server_public
 * 4. Derive CEK (16 bytes) and nonce (12 bytes) from IKM using HKDF
 *    with salt = random 16 bytes
 * 5. Pad plaintext: plaintext + \x02 + padding zeros
 * 6. AES-128-GCM encrypt with CEK and nonce
 * 7. Build aes128gcm header: salt(16) + rs(4) + idlen(1) + keyid(65)
 * 8. Return header + ciphertext
 */
async function encryptPayload(
  clientPublicKeyB64: string,
  clientAuthB64: string,
  plaintext: Uint8Array,
): Promise<{ encrypted: Uint8Array; serverPublicKeyRaw: Uint8Array }> {
  // Import client's public key
  const clientPublicKey = await importClientPublicKey(clientPublicKeyB64);
  const clientPublicKeyRaw = b64urlDecode(clientPublicKeyB64); // 65 bytes uncompressed

  // Client's auth secret (16 bytes)
  const authSecret = b64urlDecode(clientAuthB64);

  // Generate ephemeral server key pair
  const ephemeralKeyPair = await generateEphemeralKeyPair();

  // Export the ephemeral public key (65 bytes, uncompressed point)
  const serverPublicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey),
  );

  // ECDH shared secret
  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey },
    ephemeralKeyPair.privateKey,
    256, // 32 bytes
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  // ── Step 3: Derive IKM from auth_secret and shared_secret ──
  // ikm_info = "WebPush: info\0" + ua_public(65) + as_public(65)
  const ikmInfo = concat(
    textEncode("WebPush: info\0"),
    clientPublicKeyRaw,
    serverPublicKeyRaw,
  );

  // IKM = HKDF(salt=auth_secret, ikm=ecdh_secret, info=ikm_info, length=32)
  const ikm = await hkdf(authSecret, sharedSecret, ikmInfo, 32);

  // ── Step 4: Random salt for this message ──
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive Content Encryption Key (16 bytes) and Nonce (12 bytes)
  const cekInfo = buildInfo("aesgcm", clientPublicKeyRaw, serverPublicKeyRaw);
  const nonceInfo = buildInfo("nonce", clientPublicKeyRaw, serverPublicKeyRaw);

  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  // ── Step 5: Pad the plaintext ──
  // For aes128gcm, padding is: plaintext + delimiter(0x02) + zeros
  // We use minimal padding (just the delimiter, no extra zeros)
  const padded = concat(plaintext, new Uint8Array([2]));

  // ── Step 6: AES-128-GCM encrypt ──
  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek,
    "AES-GCM",
    false,
    ["encrypt"],
  );

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      padded,
    ),
  );

  // ── Step 7: Build aes128gcm header ──
  // Header: salt(16) + rs(4, big-endian uint32) + idlen(1) + keyid(serverPublicKey, 65)
  const rs = 4096; // Record size (must be >= plaintext + padding + 17 for tag)
  const rsBytes = new Uint8Array(4);
  new DataView(rsBytes.buffer).setUint32(0, rs, false); // big-endian

  const header = concat(
    salt,                           // 16 bytes
    rsBytes,                        // 4 bytes
    new Uint8Array([serverPublicKeyRaw.length]), // 1 byte (idlen = 65)
    serverPublicKeyRaw,             // 65 bytes (keyid)
  );

  // ── Step 8: Final payload = header + ciphertext ──
  const encrypted = concat(header, ciphertext);

  return { encrypted, serverPublicKeyRaw };
}

// ═══════════════════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a complete Web Push HTTP request with VAPID authentication
 * and RFC 8291 encrypted payload.
 */
export async function generatePushHTTPRequest(
  options: PushOptions,
): Promise<PushHTTPRequest> {
  const { applicationServerKeys, payload, target, adminContact, ttl, urgency } = options;
  const endpoint = target.endpoint;

  // ── VAPID JWT ──
  const url = new URL(endpoint);
  const audience = url.origin;
  const vapidPrivateKey = await importECDSAPrivateKey(applicationServerKeys.privateKey);
  const jwt = await createVapidJwt(audience, adminContact, vapidPrivateKey, 12 * 60 * 60);

  // ── Encrypt payload (RFC 8291) ──
  const plaintext = textEncode(payload);
  const { encrypted } = await encryptPayload(
    target.keys.p256dh,
    target.keys.auth,
    plaintext,
  );

  // ── Build HTTP request ──
  const headers = new Headers({
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    "Content-Length": String(encrypted.length),
    Authorization: `vapid t=${jwt}, k=${applicationServerKeys.publicKey}`,
    TTL: String(ttl),
  });

  if (urgency) {
    headers.set("Urgency", urgency);
  }

  return { headers, body: encrypted, endpoint };
}
