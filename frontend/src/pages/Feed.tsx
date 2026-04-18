import { useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore, type Message } from "@/stores/message-store";
import { MessageList } from "@/components/message/MessageList";
import { PRIORITY_CONFIG, cn } from "@/lib/utils";

const TABS = [
  { key: "all", label: "全部" },
  { key: "urgent", label: "🔴 紧急" },
  { key: "high", label: "🟠 重要" },
  { key: "default", label: "🔵 普通" },
  { key: "low", label: "🟢 低优" },
  { key: "debug", label: "⚪ 调试" },
] as const;

export function Feed() {
  const { groupName } = useParams();
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);

  const messages = useMessageStore((s) => s.messages);
  const loading = useMessageStore((s) => s.loading);
  const activeTab = useMessageStore((s) => s.activeTab);
  const setActiveTab = useMessageStore((s) => s.setActiveTab);
  const fetchAndDecrypt = useMessageStore((s) => s.fetchAndDecrypt);
  const loadCached = useMessageStore((s) => s.loadCached);

  const refresh = useCallback(() => {
    if (!recipientToken || !privateKeyHex) return;
    fetchAndDecrypt(recipientToken, privateKeyHex);
  }, [recipientToken, privateKeyHex, fetchAndDecrypt]);

  useEffect(() => {
    loadCached();
    refresh();
  }, [loadCached, refresh]);

  // Filter messages
  const filtered = messages.filter((m) => {
    if (groupName && m.group !== groupName) return false;
    if (activeTab !== "all" && m.priority !== activeTab) return false;
    return true;
  });

  // Count per priority
  const counts = {
    all: messages.length,
    urgent: messages.filter((m) => m.priority === "urgent").length,
    high: messages.filter((m) => m.priority === "high").length,
    default: messages.filter((m) => m.priority === "default").length,
    low: messages.filter((m) => m.priority === "low").length,
    debug: messages.filter((m) => m.priority === "debug").length,
  };

  return (
    <div className="space-y-4">
      {/* Group title */}
      {groupName && (
        <h2 className="text-lg font-semibold">
          {groupName}
        </h2>
      )}

      {/* Priority tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        {TABS.map(({ key, label }) => {
          const count = counts[key as keyof typeof counts];
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-all whitespace-nowrap",
                activeTab === key
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {count > 0 && (
                <span className="ml-1 opacity-70">({count})</span>
              )}
            </button>
          );
        })}

        {/* Refresh button */}
        <button
          onClick={refresh}
          disabled={loading}
          className="ml-auto shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          title="刷新"
        >
          <RefreshCw
            className={cn("h-4 w-4", loading && "animate-spin")}
          />
        </button>
      </div>

      {/* Message list */}
      <MessageList messages={filtered} loading={loading} />
    </div>
  );
}
