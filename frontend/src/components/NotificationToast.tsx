/**
 * In-app notification toast — macOS-style slide-in from top-right.
 *
 * Subscribes to the onIncomingNotification event bus from use-messages.ts.
 * Shows up to 3 stacked notifications, auto-dismisses after 5s.
 * Click to navigate to message detail.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { onIncomingNotification, type IncomingNotification } from "@/hooks/use-messages";

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 5_000;

interface ToastItem extends IncomingNotification {
  /** Internal key for animation */
  key: number;
  leaving: boolean;
}

let nextKey = 0;

export function NotificationToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const navigate = useNavigate();

  const dismiss = useCallback((key: number) => {
    // Mark as leaving for exit animation
    setToasts((prev) =>
      prev.map((t) => (t.key === key ? { ...t, leaving: true } : t))
    );
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.key !== key));
    }, 300);
  }, []);

  useEffect(() => {
    return onIncomingNotification((n) => {
      const key = nextKey++;
      const item: ToastItem = { ...n, key, leaving: false };

      setToasts((prev) => {
        // Keep only the most recent MAX_VISIBLE
        const updated = [item, ...prev].slice(0, MAX_VISIBLE + 1);
        // If we exceeded MAX_VISIBLE, mark the oldest as leaving
        if (updated.length > MAX_VISIBLE) {
          const oldest = updated[updated.length - 1];
          setTimeout(() => dismiss(oldest.key), 0);
        }
        return updated;
      });

      // Auto dismiss
      setTimeout(() => dismiss(key), AUTO_DISMISS_MS);
    });
  }, [dismiss]);

  const handleClick = (toast: ToastItem) => {
    dismiss(toast.key);
    navigate(`/message/${toast.id}`);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="notification-toast-container" role="log" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.key}
          className={`notification-toast ${toast.leaving ? "notification-toast--leaving" : ""}`}
          onClick={() => handleClick(toast)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") handleClick(toast); }}
        >
          <div className="notification-toast-header">
            <span className={`notification-toast-dot notification-toast-dot--${toast.priority}`} />
            <span className="notification-toast-group">{toast.group}</span>
            <button
              className="notification-toast-close"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(toast.key);
              }}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <p className="notification-toast-title">{toast.title}</p>
          {toast.body && (
            <p className="notification-toast-body">
              {toast.body.length > 80 ? toast.body.slice(0, 80) + "…" : toast.body}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
