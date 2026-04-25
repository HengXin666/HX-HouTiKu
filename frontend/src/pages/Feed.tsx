import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  WifiOff,
  AlertCircle,
  RefreshCw,
  Layers,
  Flame,
  AlertTriangle,
  Circle,
  ArrowDown,
  Bug,
  Wifi,
  WifiOff as WifiDisconnected,
  CheckCircle2,
  Bell,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import { useMessages } from "@/hooks/use-messages";
import { MessageList } from "@/components/message/MessageList";
import { cn } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

const TABS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "all", label: "全部", icon: Layers },
  { key: "urgent", label: "紧急", icon: Flame },
  { key: "high", label: "重要", icon: AlertTriangle },
  { key: "default", label: "普通", icon: Circle },
  { key: "low", label: "低优", icon: ArrowDown },
  { key: "debug", label: "调试", icon: Bug },
];

export function Feed() {
  const { groupName } = useParams();
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);

  const { messages, loading, refresh, wsStatus, deviceCount } = useMessages();

  const error = useMessageStore((s) => s.error);
  const activeTab = useMessageStore((s) => s.activeTab);
  const setActiveTab = useMessageStore((s) => s.setActiveTab);

  const noToken = !recipientToken || !privateKeyHex;

  // Filter messages by group and priority
  const filtered = messages.filter((m) => {
    if (groupName && m.group !== groupName) return false;
    if (activeTab !== "all" && m.priority !== activeTab) return false;
    return true;
  });

  const scopedMsgs = groupName
    ? messages.filter((m) => m.group === groupName)
    : messages;

  // Stats for status bar
  const today = new Date();
  const todayCount = messages.filter((m) => {
    const d = new Date(m.timestamp);
    return d.toDateString() === today.toDateString();
  }).length;
  const unreadCount = messages.filter((m) => !m.is_read).length;
  const urgentCount = messages.filter((m) => m.priority === "urgent" && !m.is_read).length;

  const counts: Record<string, number> = {
    all: scopedMsgs.length,
    urgent: scopedMsgs.filter((m) => m.priority === "urgent").length,
    high: scopedMsgs.filter((m) => m.priority === "high").length,
    default: scopedMsgs.filter((m) => m.priority === "default").length,
    low: scopedMsgs.filter((m) => m.priority === "low").length,
    debug: scopedMsgs.filter((m) => m.priority === "debug").length,
  };

  // No token state
  if (noToken && messages.length === 0) {
    return (
      <div className="feed-empty-state">
        <div className="feed-empty-icon-ring">
          <WifiOff className="feed-empty-icon" />
        </div>
        <h3 className="feed-empty-title">未配置 Recipient Token</h3>
        <p className="feed-empty-desc">
          前往 <strong>设置 → 连接</strong> 填写你的 Recipient Token 后即可接收消息。
        </p>
      </div>
    );
  }

  return (
    <div className="feed-container">
      {/* Group title (only when viewing a specific group) */}
      {groupName && (
        <h2 className="feed-group-title">{groupName}</h2>
      )}

      {/* ── Dashboard status bar (kanban style) ── */}
      <div className="feed-dashboard">
        <div className="feed-dashboard-stats">
          <div className="feed-stat">
            <span className="feed-stat-value">{todayCount}</span>
            <span className="feed-stat-label">今日</span>
          </div>
          <div className="feed-stat-divider" />
          <div className="feed-stat">
            <CheckCircle2 style={{ width: 14, height: 14, color: "var(--color-priority-low)" }} />
            <span className="feed-stat-label">CI 通过</span>
          </div>
          <div className="feed-stat-divider" />
          <div className="feed-stat">
            <Bell style={{ width: 14, height: 14, color: urgentCount > 0 ? "var(--color-priority-urgent)" : "var(--color-muted-foreground)" }} />
            <span className="feed-stat-value" style={urgentCount > 0 ? { color: "var(--color-priority-urgent)" } : undefined}>
              {urgentCount}
            </span>
            <span className="feed-stat-label">告警</span>
          </div>
          <div className="feed-stat-divider" />
          <div className={cn(
            "feed-ws-pill",
            wsStatus === "connected" && "feed-ws-pill--connected",
            wsStatus === "connecting" && "feed-ws-pill--connecting",
            (wsStatus === "disconnected" || wsStatus === "idle") && "feed-ws-pill--disconnected",
          )}>
            {wsStatus === "connected" ? (
              <Wifi style={{ width: 12, height: 12 }} />
            ) : (
              <WifiDisconnected style={{ width: 12, height: 12 }} />
            )}
            <span>
              {wsStatus === "connected"
                ? `在线${deviceCount > 1 ? ` · ${deviceCount}` : ""}`
                : wsStatus === "connecting" ? "连接中" : "离线"}
            </span>
          </div>
        </div>
        {unreadCount > 0 && (
          <div className="feed-dashboard-unread">
            <strong>{unreadCount}</strong> 未读
          </div>
        )}
      </div>

      {/* ── Horizontal scrolling category tabs ── */}
      <div className="feed-tabs">
        {TABS.map(({ key, label, icon: Icon }) => {
          const count = counts[key] ?? 0;
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "feed-tab",
                isActive && "feed-tab--active"
              )}
            >
              <Icon style={{ width: 16, height: 16, flexShrink: 0 }} />
              <span>{label}</span>
              {count > 0 && (
                <span className="feed-tab-count">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="feed-error">
          <AlertCircle className="feed-error-icon" />
          <div className="feed-error-content">
            <p className="feed-error-title">获取消息失败</p>
            <p className="feed-error-msg">{error}</p>
          </div>
          <button onClick={refresh} className="feed-error-retry">
            <RefreshCw className="feed-error-retry-icon" />
            重试
          </button>
        </div>
      )}

      {/* Message list with time grouping */}
      <MessageList messages={filtered} loading={loading} />
    </div>
  );
}
