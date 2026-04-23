import { Star } from "lucide-react";
import { useMessageStore } from "@/stores/message-store";
import { MessageList } from "@/components/message/MessageList";

export function StarredPage() {
  const messages = useMessageStore((s) => s.messages);
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
    <div className="feed-container">
      <MessageList messages={starred} loading={false} />
    </div>
  );
}
