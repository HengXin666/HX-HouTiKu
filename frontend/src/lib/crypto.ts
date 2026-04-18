/**
 * Browser-side ECIES cryptography using eciesjs.
 *
 * - Key generation (secp256k1)
 * - Private key wrapping with master password (PBKDF2 + AES-256-GCM)
 * - Message decryption (ECIES)
 */

import { PrivateKey, decrypt } from "eciesjs";

const PBKDF2_ITERATIONS = 600_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

// --- Key Generation ---

export interface KeyPair {
  privateKeyHex: string;
  publicKeyHex: string;
}

export function generateKeyPair(): KeyPair {
  const sk = new PrivateKey();
  return {
    privateKeyHex: sk.toHex(),
    publicKeyHex: sk.publicKey.toHex(),
  };
}

// --- Private Key Wrapping (PBKDF2 + AES-256-GCM) ---

export interface WrappedKey {
  salt: string; // hex
  iv: string; // hex
  ciphertext: string; // hex
}

async function deriveWrappingKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function wrapPrivateKey(
  privateKeyHex: string,
  password: string
): Promise<WrappedKey> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const wrappingKey = await deriveWrappingKey(password, salt);

  const plaintext = new TextEncoder().encode(privateKeyHex);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    plaintext
  );

  return {
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(ciphertext)),
  };
}

export async function unwrapPrivateKey(
  wrapped: WrappedKey,
  password: string
): Promise<string> {
  const salt = hexToBytes(wrapped.salt);
  const iv = hexToBytes(wrapped.iv);
  const ciphertext = hexToBytes(wrapped.ciphertext);
  const wrappingKey = await deriveWrappingKey(password, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuffer(iv) },
    wrappingKey,
    toBuffer(ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}

// --- Message Decryption ---

export interface DecryptedMessage {
  title: string;
  body: string;
  tags?: string[];
}

export function decryptMessage(
  privateKeyHex: string,
  encryptedBase64: string
): DecryptedMessage {
  const binaryStr = atob(encryptedBase64);
  const ciphertext = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    ciphertext[i] = binaryStr.charCodeAt(i);
  }
  const plaintext = decrypt(privateKeyHex, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}

// --- Buffer Utilities ---

/** Convert Uint8Array to a plain ArrayBuffer (avoids TS ArrayBufferLike issues). */
function toBuffer(arr: Uint8Array): ArrayBuffer {
  return arr.buffer instanceof ArrayBuffer
    ? arr.buffer
    : new Uint8Array(arr).buffer as ArrayBuffer;
}

// --- Hex Utilities ---

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
