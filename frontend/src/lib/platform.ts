/**
 * Platform detection utilities for Capacitor / Web dual-target.
 */

import { Capacitor } from "@capacitor/core";

/** True when running inside a native Capacitor shell (Android / iOS). */
export const isNativePlatform = Capacitor.isNativePlatform();

/** Current platform: "android" | "ios" | "web". */
export const currentPlatform = Capacitor.getPlatform();

/** True when Web Push (Service Worker + PushManager) is available. */
export const hasWebPush =
  !isNativePlatform &&
  "serviceWorker" in navigator &&
  "PushManager" in window;

/** True when the Notification API is available (Web only). */
export const hasWebNotification =
  !isNativePlatform && "Notification" in window;

/**
 * Trigger device vibration.
 * On native: uses navigator.vibrate (supported in Android WebView).
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
