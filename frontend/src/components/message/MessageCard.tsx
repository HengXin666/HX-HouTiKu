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
  const preview = body ? extractPreview(body, 140) : "";
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

// 从消息 body 中提取干净的预览文本
function extractPreview(text: string, maxLen: number): string {
  let content = text;

  // 如果包含 <hr/> 或 <hr>，取其后的内容作为正文预览（跳过邮件元信息头）
  const hrIdx = content.search(/<hr\s*\/?>/i);
  if (hrIdx !== -1) {
    content = content.slice(hrIdx).replace(/<hr\s*\/?>/i, "");
  }

  // 去除 HTML 标签
  content = content
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|blockquote|pre)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "");

  // 去除 Markdown 语法
  content = content
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`[^`]+`/g, "[code]")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "[image]")
    .replace(/>\s/g, "");

  // 压缩空白
  content = content
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return content.slice(0, maxLen);
}
