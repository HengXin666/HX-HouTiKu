/**
 * Minimal Web Push (VAPID) implementation for Cloudflare Workers.
 * Replaces the unpublished `cf-webpush` npm package.
 *
 * Only handles VAPID authentication (RFC 8292) — the payload is
 * already encrypted by the SDK before reaching the worker, so we
 * just need to sign the JWT and forward the ciphertext.
 */

export interface PushTarget {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushOptions {
  applicationServerKeys: {
    publicKey: string;
    privateKey: string;
  };
  payload: string;
  target: PushTarget;
  adminContact: string;
  ttl: number;
  urgency?: "very-low" | "low" | "normal" | "high";
}

export interface PushHTTPRequest {
  headers: Headers;
  body: Uint8Array;
  endpoint: string;
}

// --- Base64url helpers ---

function base64urlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// --- JWT (ES256 / VAPID) ---

async function importVapidPrivateKey(base64urlKey: string): Promise<CryptoKey> {
  const rawKey = base64urlDecode(base64urlKey);

  // The raw private key is 32 bytes (the "d" parameter of the EC key).
  // We need to import it as JWK because SubtleCrypto doesn't support
  // raw EC private key import directly.
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: base64urlKey,
    // x and y are required for JWK import — derive them from the private key
    // by doing a throwaway ECDH operation. However, SubtleCrypto needs them
    // upfront. We'll use PKCS8 instead.
  };

  // Build a PKCS8 wrapper around the 32-byte raw private scalar.
  const pkcs8 = buildPkcs8P256(rawKey);

  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/**
 * Wrap a raw 32-byte P-256 private scalar into PKCS8 DER.
 * The structure is fixed for P-256 so we can hard-code the ASN.1 envelope.
 */
function buildPkcs8P256(rawPrivateKey: Uint8Array): ArrayBuffer {
  // PKCS8 header for P-256 EC key (RFC 5958 / SEC 1)
  // SEQUENCE {
  //   INTEGER 0
  //   SEQUENCE { OID ecPublicKey, OID prime256v1 }
  //   OCTET STRING {
  //     SEQUENCE { INTEGER 1, OCTET STRING <32 bytes> }
  //   }
  // }
  const header = new Uint8Array([
    0x30, 0x41, // SEQUENCE, length 65
    0x02, 0x01, 0x00, // INTEGER 0 (version)
    0x30, 0x13, // SEQUENCE, length 19
    0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, // OID 1.2.840.10045.2.1 (ecPublicKey)
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, // OID 1.2.840.10045.3.1.7 (prime256v1)
    0x04, 0x27, // OCTET STRING, length 39
    0x30, 0x25, // SEQUENCE, length 37
    0x02, 0x01, 0x01, // INTEGER 1 (version)
    0x04, 0x20, // OCTET STRING, length 32
  ]);

  const result = new Uint8Array(header.length + 32);
  result.set(header);
  result.set(rawPrivateKey, header.length);
  return result.buffer;
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

async function createVapidJwt(
  audience: string,
  subject: string,
  privateKey: CryptoKey,
  expSeconds: number,
): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: audience,
    exp: now + expSeconds,
    sub: subject,
  };

  const encodedHeader = base64urlEncode(textToBytes(JSON.stringify(header)));
  const encodedPayload = base64urlEncode(textToBytes(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    textToBytes(signingInput),
  );

  // SubtleCrypto returns the signature in IEEE P1363 format (r || s, 64 bytes)
  // which is exactly what JWT ES256 expects.
  const encodedSignature = base64urlEncode(new Uint8Array(signature));

  return `${signingInput}.${encodedSignature}`;
}

// --- Public API ---

export async function generatePushHTTPRequest(
  options: PushOptions,
): Promise<PushHTTPRequest> {
  const { applicationServerKeys, payload, target, adminContact, ttl, urgency } = options;
  const endpoint = target.endpoint;

  // Extract the origin from the push service endpoint for the JWT audience
  const url = new URL(endpoint);
  const audience = url.origin;

  const privateKey = await importVapidPrivateKey(applicationServerKeys.privateKey);

  const jwt = await createVapidJwt(audience, adminContact, privateKey, 12 * 60 * 60);

  const headers = new Headers({
    "Content-Type": "application/octet-stream",
    "Content-Encoding": "aes128gcm",
    Authorization: `vapid t=${jwt}, k=${applicationServerKeys.publicKey}`,
    TTL: String(ttl),
  });

  if (urgency) {
    headers.set("Urgency", urgency);
  }

  const body = textToBytes(payload);

  return { headers, body, endpoint };
}
