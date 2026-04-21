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

  // Use the unified hook for fetching + WebSocket + push integration
  const { messages, loading, refresh, wsStatus } = useMessages();

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
      {/* Group title */}
      {groupName && (
        <h2 className="feed-group-title">{groupName}</h2>
      )}

      {/* WebSocket status + stats bar */}
      <div className="feed-status-bar">
        <div className={cn(
          "feed-ws-status",
          wsStatus === "connected" && "feed-ws-status--connected",
          wsStatus === "connecting" && "feed-ws-status--connecting",
          (wsStatus === "disconnected" || wsStatus === "error") && "feed-ws-status--disconnected",
        )}>
          {wsStatus === "connected" ? (
            <Wifi style={{ width: 14, height: 14 }} />
          ) : (
            <WifiDisconnected style={{ width: 14, height: 14 }} />
          )}
          <span>
            {wsStatus === "connected" ? "实时连接" : wsStatus === "connecting" ? "连接中..." : "离线"}
          </span>
        </div>
        <span className="feed-status-count">
          今日 {messages.filter((m) => {
            const today = new Date();
            const d = new Date(m.timestamp);
            return d.toDateString() === today.toDateString();
          }).length} 条
          {messages.filter((m) => !m.is_read).length > 0 && (
            <> · <strong>{messages.filter((m) => !m.is_read).length} 未读</strong></>
          )}
        </span>
      </div>

      {/* Priority filter tabs */}
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

      {/* Message list */}
      <MessageList messages={filtered} loading={loading} />
    </div>
  );
}
