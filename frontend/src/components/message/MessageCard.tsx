import { useNavigate } from "react-router-dom";
import { PriorityBadge } from "./PriorityBadge";
import { GroupChip } from "./GroupChip";
import { cn, formatTime } from "@/lib/utils";
import type { Message } from "@/stores/message-store";

interface MessageCardProps {
  message: Message;
}

export function MessageCard({ message }: MessageCardProps) {
  const navigate = useNavigate();

  const priorityBorderClass = !message.is_read
    ? ({
        urgent: "msg-card--urgent",
        high: "msg-card--high",
        default: "msg-card--default",
        low: "msg-card--low",
        debug: "msg-card--debug",
      }[message.priority] ?? "")
    : "";

  return (
    <button
      onClick={() => navigate(`/message/${message.id}`)}
      className={cn(
        "msg-card",
        priorityBorderClass,
        message.is_read && "msg-card--read"
      )}
    >
      {/* Top row: meta */}
      <div className="msg-card-meta">
        <PriorityBadge priority={message.priority} />
        <GroupChip group={message.group} />
        <span className="msg-card-time">
          {formatTime(message.timestamp)}
        </span>
      </div>

      {/* Title */}
      <h3
        className={cn(
          "msg-card-title",
          !message.is_read && "msg-card-title--unread"
        )}
      >
        {message.title}
      </h3>

      {/* Preview */}
      {message.body && (
        <p className="msg-card-preview">
          {message.body.length > 160
            ? message.body.slice(0, 160) + "…"
            : message.body}
        </p>
      )}

      {/* Tags */}
      {message.tags.length > 0 && (
        <div className="msg-card-tags">
          {message.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="msg-card-tag">
              #{tag}
            </span>
          ))}
          {message.tags.length > 3 && (
            <span className="msg-card-tag msg-card-tag--more">
              +{message.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
