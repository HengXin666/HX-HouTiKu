/**
 * Platform detection utilities.
 *
 * In the WebView hybrid architecture, the Android native shell injects:
 *  - User-Agent suffix: "HxNativeAndroid/<version>"
 *  - JS Bridge: `window.HxNative` (via @JavascriptInterface)
 *
 * On pure web (desktop/mobile browser), neither is present.
 */

// ─── Native Android detection ───

/** JS Bridge interface exposed by the Android native shell. */
export interface HxNativeBridge {
  getPlatform(): string;
  getAppVersion(): string;
  getNotificationStatus(): string;
  requestNotification(): void;
  getFcmToken(): void;
  registerFcmPush(apiBase: string, recipientToken: string): void;
  showToast(message: string): void;
}

declare global {
  interface Window {
    HxNative?: HxNativeBridge;
    __hxNativeFcmCallback?: (token: string | null) => void;
    __hxNativeFcmRegisterCallback?: (statusCode: number) => void;
    __hxNativeNotificationCallback?: (status: string) => void;
  }
}

/** True when running inside the Android WebView shell. */
export const isNativeAndroid: boolean =
  typeof window !== "undefined" &&
  (navigator.userAgent.includes("HxNativeAndroid") || !!window.HxNative);

/** True when running on any native platform (currently only Android). */
export const isNativePlatform: boolean = isNativeAndroid;

/** The current platform identifier. */
export const currentPlatform: "android" | "web" = isNativeAndroid
  ? "android"
  : "web";

/** True when Web Push (Service Worker + PushManager) is available. */
export const hasWebPush: boolean =
  !isNativeAndroid &&
  typeof navigator !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

/** True when the Notification API is available (Web only). */
export const hasWebNotification: boolean =
  typeof window !== "undefined" && "Notification" in window;

/**
 * Get the native bridge, or null if not in Android WebView.
 */
export function getNativeBridge(): HxNativeBridge | null {
  if (isNativeAndroid && window.HxNative) {
    return window.HxNative;
  }
  return null;
}

/**
 * Get FCM token from native bridge (async via callback).
 * Resolves with the token string, or null if unavailable.
 */
export function getNativeFcmToken(): Promise<string | null> {
  const bridge = getNativeBridge();
  if (!bridge) return Promise.resolve(null);

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.__hxNativeFcmCallback = undefined;
      resolve(null);
    }, 10_000);

    window.__hxNativeFcmCallback = (token) => {
      clearTimeout(timeout);
      window.__hxNativeFcmCallback = undefined;
      resolve(token);
    };

    bridge.getFcmToken();
  });
}

/**
 * Request notification permission via native bridge (Android 13+).
 * Resolves with "granted" or "denied".
 */
export function requestNativeNotificationPermission(): Promise<string> {
  const bridge = getNativeBridge();
  if (!bridge) return Promise.resolve("denied");

  // Check current status first
  const current = bridge.getNotificationStatus();
  if (current === "granted") return Promise.resolve("granted");

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      window.__hxNativeNotificationCallback = undefined;
      resolve("denied");
    }, 60_000);

    window.__hxNativeNotificationCallback = (status) => {
      clearTimeout(timeout);
      window.__hxNativeNotificationCallback = undefined;
      resolve(status);
    };

    bridge.requestNotification();
  });
}

/**
 * Trigger device vibration.
 * Falls back to no-op if unavailable.
 */
export function vibrate(pattern: number | number[]): void {
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Silently ignore — vibration is non-critical
  }
}
