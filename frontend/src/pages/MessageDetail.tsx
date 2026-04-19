import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Toast } from "@/components/ui/Toast";
import { Check, Copy, Clock, ArrowLeft } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import { PriorityBadge } from "@/components/message/PriorityBadge";
import { GroupChip } from "@/components/message/GroupChip";
import { ContentRenderer, resolveFormat, getFormatInfo, type ContentFormat } from "@/components/message/ContentRenderer";
import { copyToClipboard, cn } from "@/lib/utils";

const FORMAT_OPTIONS: { label: string; value: ContentFormat }[] = [
  { label: "自动", value: "auto" },
  { label: "Markdown", value: "markdown" },
  { label: "HTML", value: "html" },
  { label: "JSON", value: "json" },
  { label: "纯文本", value: "text" },
];

export function MessageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const messages = useMessageStore((s) => s.messages);
  const markRead = useMessageStore((s) => s.markRead);
  const [format, setFormat] = useState<ContentFormat>("auto");

  const message = messages.find((m) => m.id === id);

  // Auto-mark as read
  useEffect(() => {
    if (message && !message.is_read && recipientToken) {
      markRead(recipientToken, [message.id]);
    }
  }, [message, recipientToken, markRead]);

  if (!message) {
    return (
      <div className="feed-empty-state">
        <h3 className="feed-empty-title">消息未找到</h3>
        <p className="feed-empty-desc">该消息可能已被删除</p>
        <button
          onClick={() => navigate(-1)}
          className="msg-detail-action-btn"
          style={{ marginTop: "1rem" }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
          返回
        </button>
      </div>
    );
  }

  const formattedDate = new Date(message.timestamp).toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Detect the resolved format so we can show an indicator
  const detectedFormat = message.body ? resolveFormat(message.body, format) : "text";
  const { label: formatLabel, Icon: FormatIcon } = getFormatInfo(detectedFormat);

  const handleCopy = async () => {
    const ok = await copyToClipboard(`${message.title}\n\n${message.body ?? ""}`);

    if (ok) {
      Toast.show({ content: "已复制", position: "bottom" });
    }
  };

  return (
    <div className="msg-detail">
      {/* Meta badges */}
      <div className="msg-detail-meta">
        <PriorityBadge priority={message.priority} size="md" />
        <GroupChip group={message.group} />
        {message.body && (
          <span className="group-chip" title={`检测为 ${formatLabel} 格式`}>
            <FormatIcon style={{ width: 12, height: 12, flexShrink: 0 }} />
            <span>{formatLabel}</span>
          </span>
        )}
      </div>

      {/* Timestamp */}
      <div className="msg-detail-time">
        <Clock style={{ width: 16, height: 16, flexShrink: 0 }} />
        <span>{formattedDate}</span>
      </div>

      {/* Title */}
      <h1 className="msg-detail-title">{message.title}</h1>

      {/* Format selector */}
      {message.body && (
        <>
          <div className="msg-detail-divider" />
          <div className="msg-detail-format">
            <span className="msg-detail-format-label">渲染:</span>
            <div className="msg-detail-format-btns">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={cn(
                    "msg-detail-format-btn",
                    format === opt.value && "msg-detail-format-btn--active"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Body */}
      {message.body && (
        <ContentRenderer content={message.body} format={format} />
      )}

      {/* Tags */}
      {(message.tags ?? []).length > 0 && (
        <div className="msg-detail-tags">
          {(message.tags ?? []).map((tag) => (
            <span key={tag} className="msg-detail-tag">{tag}</span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="msg-detail-actions">
        {!message.is_read && recipientToken && (
          <button
            onClick={() => markRead(recipientToken, [message.id])}
            className="msg-detail-action-btn msg-detail-action-btn--primary"
          >
            <Check style={{ width: 16, height: 16 }} />
            标记已读
          </button>
        )}
        <button onClick={handleCopy} className="msg-detail-action-btn">
          <Copy style={{ width: 16, height: 16 }} />
          复制内容
        </button>
      </div>
    </div>
  );
}
