import { Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore, type Message } from "@/stores/message-store";
import { cn, relativeTime, PRIORITY_CONFIG, type PriorityLevel } from "@/lib/utils";

export function StarredPage() {
  const messages = useMessageStore((s) => s.messages);
  const toggleStar = useMessageStore((s) => s.toggleStar);
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const navigate = useNavigate();
  const starred = messages.filter((m) => m.is_starred);

  if (starred.length === 0) {
    return (
      <div className="feed-empty-state">
        <div className="feed-empty-icon-ring">
          <Star className="feed-empty-icon" />
        </div>
        <h3 className="feed-empty-title">暂无收藏</h3>
        <p className="feed-empty-desc">
          在消息详情页点击收藏按钮，消息会出现在这里
        </p>
      </div>
    );
  }

  return (
    <div className="starred-page">
      <div className="starred-count">{starred.length} 条收藏</div>
      <div className="starred-list">
        {starred.map((m) => (
          <StarredCard
            key={m.id}
            message={m}
            onOpen={() => navigate(`/message/${m.id}`)}
            onUnstar={() => {
              if (recipientToken) toggleStar(recipientToken, m.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StarredCard({
  message: m,
  onOpen,
  onUnstar,
}: {
  message: Message;
  onOpen: () => void;
  onUnstar: () => void;
}) {
  const config = PRIORITY_CONFIG[m.priority as PriorityLevel] ?? PRIORITY_CONFIG.default;

  return (
    <div className="starred-card" onClick={onOpen}>
      <div className={cn("msg-card-bar", `msg-card-bar--${m.priority}`)} />
      <div className="starred-card-content">
        <div className="starred-card-header">
          <span className="starred-card-group">{m.group}</span>
          <span className="starred-card-time">{relativeTime(m.timestamp)}</span>
        </div>
        <div className="starred-card-title">{m.title}</div>
        {m.body && (
          <div className="starred-card-preview">
            {stripMarkdown(m.body).slice(0, 100)}
          </div>
        )}
        {(m.tags ?? []).length > 0 && (
          <div className="starred-card-tags">
            {(m.tags ?? []).slice(0, 3).map((tag) => (
              <span key={tag} className="msg-card-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <button
        className="starred-card-unstar"
        onClick={(e) => {
          e.stopPropagation();
          onUnstar();
        }}
        title="取消收藏"
      >
        <Star style={{ width: 16, height: 16, fill: "currentColor" }} />
      </button>
    </div>
  );
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`[^`]+`/g, "[code]")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[image]")
    .replace(/>\s/g, "")
    .replace(/[-*+]\s/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
