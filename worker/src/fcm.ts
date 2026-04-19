/**
 * Firebase Cloud Messaging (FCM) HTTP v1 API — push to Android native.
 *
 * Uses a Google Service Account (JSON) to obtain an OAuth2 access token,
 * then calls the FCM v1 send endpoint.
 *
 * Environment:
 *   FCM_SERVICE_ACCOUNT — base64-encoded service account JSON
 *
 * Reference: https://firebase.google.com/docs/cloud-messaging/send-message#send-messages-to-specific-devices
 */

// ─── Base64 / JWT helpers ───

function base64urlEncode(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** Import a PKCS8-PEM private key (RSA) for RS256 signing. */
async function importRsaKey(pkcs8Pem: string): Promise<CryptoKey> {
  const pemBody = pkcs8Pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/** Create an RS256 JWT for Google OAuth2 token exchange. */
async function createGoogleJwt(
  serviceEmail: string,
  privateKey: CryptoKey,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceEmail,
    sub: serviceEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  const encodedHeader = base64urlEncode(textToBytes(JSON.stringify(header)));
  const encodedPayload = base64urlEncode(textToBytes(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    textToBytes(signingInput),
  );

  return `${signingInput}.${base64urlEncode(new Uint8Array(signature))}`;
}

// ─── Token cache (per-isolate, ~55 min lifetime) ───

let cachedToken: { token: string; expiresAt: number } | null = null;

interface ServiceAccountJson {
  project_id: string;
  client_email: string;
  private_key: string;
}

function parseServiceAccount(base64Json: string): ServiceAccountJson {
  const json = atob(base64Json);
  return JSON.parse(json);
}

async function getAccessToken(sa: ServiceAccountJson): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.token;
  }

  const key = await importRsaKey(sa.private_key);
  const jwt = await createGoogleJwt(sa.client_email, key);

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google OAuth2 token exchange failed: ${resp.status} — ${text}`);
  }

  const data = (await resp.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

// ─── Public API ───

export interface FcmMessage {
  /** FCM device registration token (the part after "fcm://"). */
  deviceToken: string;
  /** JSON-stringified push payload (same format as web push). */
  payload: string;
  /** Push priority for Android notification channel. */
  priority: string;
  /** Message group / topic name. */
  group: string;
}

/**
 * Send a data-only FCM message to an Android device.
 *
 * Data-only messages are handled by the Capacitor PushNotifications plugin
 * which fires the `pushNotificationReceived` listener even when the app is
 * in the foreground. For background delivery, Android will show a system
 * notification using the `notification` payload we include.
 */
export async function sendFcmPush(
  serviceAccountBase64: string,
  msg: FcmMessage,
): Promise<void> {
  const sa = parseServiceAccount(serviceAccountBase64);
  const accessToken = await getAccessToken(sa);

  const priorityLabel =
    msg.priority === "urgent" ? "紧急" : msg.priority === "high" ? "重要" : "新";

  // FCM HTTP v1 API request body
  // We send BOTH `data` (for foreground JS handling) and `notification`
  // (for system tray display when app is in background / killed).
  const fcmBody = {
    message: {
      token: msg.deviceToken,
      // `notification` field → Android system tray notification
      // Shown when app is NOT in foreground (background / killed)
      notification: {
        title: `${msg.group} · ${priorityLabel}消息`,
        body: "点击查看详情",
      },
      // `data` field → handled by Capacitor PushNotifications plugin
      // Available in both foreground and background
      data: {
        type: "new_message",
        payload: msg.payload,
        priority: msg.priority,
        group: msg.group,
      },
      android: {
        // HIGH priority ensures the notification wakes the device
        priority: msg.priority === "urgent" || msg.priority === "high" ? "HIGH" : "NORMAL",
        notification: {
          channel_id: `hx_push_${msg.priority}`,
          // Vibration pattern in milliseconds
          ...(msg.priority === "urgent"
            ? { default_vibrate_timings: false, vibrate_timings: ["0s", "0.2s", "0.1s", "0.2s", "0.1s", "0.2s"] }
            : msg.priority === "high"
              ? { default_vibrate_timings: false, vibrate_timings: ["0s", "0.2s", "0.1s", "0.2s"] }
              : { default_vibrate_timings: true }),
          // Sound
          sound: "default",
          // Visibility on lock screen
          visibility: msg.priority === "urgent" || msg.priority === "high" ? "PUBLIC" : "PRIVATE",
        },
      },
    },
  };

  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(fcmBody),
  });

  if (!resp.ok) {
    const text = await resp.text();
    // 404 / UNREGISTERED means the device token is stale
    if (resp.status === 404 || text.includes("UNREGISTERED")) {
      throw new Error("FCM token expired");
    }
    console.error(`FCM send failed: ${resp.status} — ${text}`);
    throw new Error(`FCM send failed: ${resp.status}`);
  }
}
