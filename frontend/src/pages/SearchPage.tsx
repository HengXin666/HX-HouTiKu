import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { useMessageStore } from "@/stores/message-store";
import { MessageList } from "@/components/message/MessageList";

export function SearchPage() {
  const [query, setQuery] = useState("");
  const messages = useMessageStore((s) => s.messages);

  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return messages.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q) ||
        m.group.toLowerCase().includes(q) ||
        (m.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [query, messages]);

  return (
    <div className="feed-container">
      {/* Search bar */}
      <div className="search-bar">
        <Search style={{ width: 18, height: 18, flexShrink: 0, color: "var(--color-muted-foreground)" }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索消息标题、内容、分组..."
          className="search-input"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="search-clear"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        )}
      </div>

      {/* Results */}
      {query.trim() ? (
        <>
          <div className="search-result-count">
            {filtered.length} 条结果
          </div>
          <MessageList messages={filtered} loading={false} />
        </>
      ) : (
        <div className="feed-empty-state">
          <div className="feed-empty-icon-ring">
            <Search className="feed-empty-icon" />
          </div>
          <h3 className="feed-empty-title">搜索消息</h3>
          <p className="feed-empty-desc">
            输入关键词搜索标题、内容或分组
          </p>
        </div>
      )}
    </div>
  );
}
