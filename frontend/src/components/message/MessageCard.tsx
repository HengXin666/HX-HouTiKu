import { useNavigate } from "react-router-dom";
import {
  Flame,
  AlertTriangle,
  Circle,
  ArrowDown,
  Bug,
  FolderOpen,
  CheckSquare,
  Square,
} from "lucide-react";
import { cn, relativeTime, PRIORITY_CONFIG, type PriorityLevel } from "@/lib/utils";

import type { LucideIcon } from "lucide-react";

const PRIORITY_ICONS: Record<string, LucideIcon> = {
  urgent: Flame,
  high: AlertTriangle,
  default: Circle,
  low: ArrowDown,
  debug: Bug,
};

interface MessageCardProps {
  id: string;
  title: string;
  body: string;
  priority: string;
  group: string;
  timestamp: number;
  is_read: boolean;
  tags: string[];
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function MessageCard({
  id,
  title,
  body,
  priority,
  group,
  timestamp,
  is_read,
  tags,
  selectMode,
  selected,
  onToggleSelect,
}: MessageCardProps) {
  const navigate = useNavigate();
  const config = PRIORITY_CONFIG[priority as PriorityLevel] ?? PRIORITY_CONFIG.default;
  const PriorityIcon = PRIORITY_ICONS[priority] ?? Circle;
  const preview = body ? stripMarkdown(body).slice(0, 140) : "";
  const showUrgentLabel = priority === "urgent" || priority === "high";

  const handleClick = () => {
    if (selectMode && onToggleSelect) {
      onToggleSelect(id);
    } else {
      navigate(`/message/${id}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "msg-card",
        is_read && "msg-card--read",
        selectMode && selected && "msg-card--selected",
      )}
    >
      {/* 选择模式: 复选框 */}
      {selectMode && (
        <div className="msg-card-checkbox">
          {selected ? (
            <CheckSquare style={{ width: 20, height: 20, color: "var(--color-primary)" }} />
          ) : (
            <Square style={{ width: 20, height: 20, opacity: 0.4 }} />
          )}
        </div>
      )}

      {/* Left: priority vertical bar */}
      <div className={cn("msg-card-bar", `msg-card-bar--${priority}`)} />

      {/* Right: content */}
      <div className="msg-card-content">
        {/* Meta row: group name · priority · time */}
        <div className="msg-card-meta">
          <FolderOpen style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.6 }} />
          <span className="msg-card-group">{group}</span>
          {showUrgentLabel && (
            <>
              <span className="msg-card-dot" />
              <PriorityIcon style={{ width: 14, height: 14, flexShrink: 0 }} />
              <span className={cn("msg-card-priority-label", `msg-card-priority-label--${priority}`)}>
                {config.label}
              </span>
            </>
          )}
          <span className="msg-card-time">{relativeTime(timestamp)}</span>
        </div>

        {/* Title */}
        <div className={cn("msg-card-title", !is_read && "msg-card-title--unread")}>
          {title}
        </div>

        {/* Body preview */}
        {preview && (
          <div className="msg-card-preview">{preview}</div>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="msg-card-tags">
            {tags.slice(0, 3).map((tag) => (
              <span key={tag} className="msg-card-tag">{tag}</span>
            ))}
            {tags.length > 3 && (
              <span className="msg-card-tag" style={{ opacity: 0.5 }}>+{tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Unread dot */}
      {!selectMode && !is_read && <div className="msg-card-unread-dot" />}
    </button>
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
