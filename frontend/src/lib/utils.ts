/**
 * Utility functions.
 */

/** Merge class names (simple version, no clsx dependency). */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Format timestamp to relative time (Chinese). */
export function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;

  return new Date(timestamp).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

/** Format timestamp to time string. */
export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format timestamp to date string. */
export function formatDate(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return "今天";
  if (isYesterday) return "昨天";

  return date.toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
}

/** Group messages by date. */
export function groupByDate<T extends { timestamp: number }>(
  items: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = formatDate(item.timestamp);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

/** Priority config. */
export const PRIORITY_CONFIG = {
  urgent: { label: "紧急", emoji: "🔴", color: "var(--color-priority-urgent)" },
  high: { label: "重要", emoji: "🟠", color: "var(--color-priority-high)" },
  default: { label: "普通", emoji: "🔵", color: "var(--color-priority-default)" },
  low: { label: "低优", emoji: "🟢", color: "var(--color-priority-low)" },
  debug: { label: "调试", emoji: "⚪", color: "var(--color-priority-debug)" },
} as const;

export type PriorityLevel = keyof typeof PRIORITY_CONFIG;

/** Group emoji mapping. */
export const GROUP_EMOJI: Record<string, string> = {
  alerts: "🔴",
  work: "📋",
  "ai-daily": "🤖",
  crawler: "🕷",
  "ci-cd": "🔧",
  general: "📬",
  backup: "💾",
  monitor: "📊",
};

export function getGroupEmoji(group: string): string {
  return GROUP_EMOJI[group] ?? "📂";
}

/** Copy text to clipboard — with fallback for Android WebView. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Modern API
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard API may throw in insecure contexts (Android WebView)
  }

  // Fallback: execCommand
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
