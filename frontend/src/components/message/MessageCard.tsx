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

  return (
    <button
      onClick={() => navigate(`/message/${message.id}`)}
      className={cn(
        "w-full text-left rounded-xl border border-border bg-card p-4 transition-all",
        "hover:border-border hover:bg-card/80 hover:shadow-lg hover:shadow-black/5",
        "active:scale-[0.99]",
        "animate-[fade-in_0.2s_ease-out]",
        !message.is_read && "border-l-2",
        !message.is_read && message.priority === "urgent" && "border-l-priority-urgent",
        !message.is_read && message.priority === "high" && "border-l-priority-high",
        !message.is_read && message.priority === "default" && "border-l-primary",
        !message.is_read && message.priority === "low" && "border-l-priority-low",
        !message.is_read && message.priority === "debug" && "border-l-priority-debug",
        message.is_read && "opacity-60"
      )}
    >
      {/* Top row: badge + group + time */}
      <div className="flex items-center gap-2 mb-2">
        <PriorityBadge priority={message.priority} />
        <GroupChip group={message.group} />
        <span className="ml-auto text-[11px] text-muted-foreground whitespace-nowrap">
          {formatTime(message.timestamp)}
        </span>
      </div>

      {/* Title */}
      <h3
        className={cn(
          "text-sm leading-snug mb-1 line-clamp-1",
          !message.is_read ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
        )}
      >
        {message.title}
      </h3>

      {/* Body preview */}
      {message.body && (
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {message.body}
        </p>
      )}

      {/* Tags */}
      {message.tags.length > 0 && (
        <div className="flex gap-1 mt-2">
          {message.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
