import { Loader2 } from "lucide-react";
import { groupByDate } from "@/lib/utils";
import { MessageCard } from "./MessageCard";
import { EmptyState } from "./EmptyState";

import type { Message } from "@/stores/message-store";

interface MessageListProps {
  messages: Message[];
  loading: boolean;
}

export function MessageList({ messages, loading }: MessageListProps) {
  if (loading && messages.length === 0) {
    return (
      <div className="msg-list-loading">
        <Loader2 className="msg-list-loading-icon animate-spin" />
        <span>获取消息中…</span>
      </div>
    );
  }

  if (!loading && messages.length === 0) {
    return <EmptyState />;
  }

  const groups = groupByDate(messages);

  return (
    <div className="msg-list">
      {[...groups.entries()].map(([date, msgs]) => (
        <div key={date} className="msg-list-group">
          <div className="msg-list-date">
            <span className="msg-list-date-text">{date}</span>
            <span className="msg-list-date-count">{msgs.length} 条</span>
          </div>
          <div className="msg-list-items">
            {msgs.map((msg) => (
              <MessageCard key={msg.id} {...msg} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
