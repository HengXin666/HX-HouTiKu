import { useEffect, useCallback, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Toast } from "antd-mobile";
import { WifiOff, AlertCircle, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import { MessageList } from "@/components/message/MessageList";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "all", label: "全部", emoji: "" },
  { key: "urgent", label: "紧急", emoji: "🔴" },
  { key: "high", label: "重要", emoji: "🟠" },
  { key: "default", label: "普通", emoji: "🔵" },
  { key: "low", label: "低优", emoji: "🟢" },
  { key: "debug", label: "调试", emoji: "⚪" },
] as const;

const MIN_REFRESH_INTERVAL = 5_000;

export function Feed() {
  const { groupName } = useParams();
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);

  const messages = useMessageStore((s) => s.messages);
  const loading = useMessageStore((s) => s.loading);
  const error = useMessageStore((s) => s.error);
  const activeTab = useMessageStore((s) => s.activeTab);
  const setActiveTab = useMessageStore((s) => s.setActiveTab);
  const fetchAndDecrypt = useMessageStore((s) => s.fetchAndDecrypt);
  const loadCached = useMessageStore((s) => s.loadCached);

  const lastRefreshRef = useRef(0);
  const [noToken, setNoToken] = useState(false);

  const refresh = useCallback(async () => {
    if (!recipientToken || !privateKeyHex) {
      setNoToken(true);
      return;
    }
    setNoToken(false);

    const now = Date.now();
    if (now - lastRefreshRef.current < MIN_REFRESH_INTERVAL) {
      Toast.show({ content: "操作太频繁，请稍后再试", position: "bottom" });
      return;
    }
    lastRefreshRef.current = now;

    await fetchAndDecrypt(recipientToken, privateKeyHex);
  }, [recipientToken, privateKeyHex, fetchAndDecrypt]);

  useEffect(() => {
    loadCached();
    if (recipientToken && privateKeyHex) {
      fetchAndDecrypt(recipientToken, privateKeyHex);
      lastRefreshRef.current = Date.now();
    } else {
      setNoToken(true);
    }
  }, [loadCached, recipientToken, privateKeyHex, fetchAndDecrypt]);

  // Filter
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

  // No token
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

      {/* Priority filter tabs — X.com style */}
      <div className="feed-tabs">
        {TABS.map(({ key, label, emoji }) => {
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
              {emoji && <span className="feed-tab-emoji">{emoji}</span>}
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
