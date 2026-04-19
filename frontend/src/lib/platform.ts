/**
 * Platform detection utilities.
 * Since the app is now web-only (native Android is a separate Kotlin app),
 * Capacitor is no longer used. These helpers remain for compatibility.
 */

/** Always false — native is now a separate Kotlin app, not Capacitor. */
export const isNativePlatform = false;

/** Always "web". */
export const currentPlatform = "web";

/** True when Web Push (Service Worker + PushManager) is available. */
export const hasWebPush =
  "serviceWorker" in navigator && "PushManager" in window;

/** True when the Notification API is available (Web only). */
export const hasWebNotification = "Notification" in window;

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
