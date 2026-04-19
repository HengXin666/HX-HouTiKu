import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Tag, Button, Space, Selector, Toast } from "antd-mobile";
import { Check, Copy, Clock } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import { PriorityBadge } from "@/components/message/PriorityBadge";
import { GroupChip } from "@/components/message/GroupChip";
import { ContentRenderer } from "@/components/message/ContentRenderer";
import { copyToClipboard } from "@/lib/utils";

type ContentFormat = "auto" | "markdown" | "html" | "json" | "text";

const FORMAT_OPTIONS = [
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
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-muted-foreground text-sm">消息未找到</p>
        <Button
          size="small"
          onClick={() => navigate(-1)}
          className="mt-4"
          color="primary"
          fill="none"
        >
          返回
        </Button>
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

  const handleCopy = async () => {
    const ok = await copyToClipboard(`${message.title}\n\n${message.body}`);
    if (ok) {
      Toast.show({ content: "已复制", position: "bottom" });
    }
  };

  return (
    <div className="max-w-2xl mx-auto animate-[fade-in_0.2s_ease-out]">
      {/* Meta */}
      <div className="space-y-3 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <PriorityBadge priority={message.priority} size="md" />
          <GroupChip group={message.group} />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>{formattedDate}</span>
        </div>
      </div>

      {/* Divider */}
      <hr className="border-border mb-5" />

      {/* Title */}
      <h1 className="text-lg sm:text-xl font-bold tracking-tight mb-4">
        {message.title}
      </h1>

      {/* Format selector */}
      {message.body && (
        <div className="mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground shrink-0">渲染模式:</span>
            <div className="flex gap-1.5 flex-wrap">
              {FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value as ContentFormat)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                    format === opt.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Body — multi-format */}
      {message.body && (
        <ContentRenderer content={message.body} format={format} />
      )}

      {/* Tags */}
      {message.tags.length > 0 && (
        <>
          <hr className="border-border my-6" />
          <div className="flex flex-wrap gap-2">
            {message.tags.map((tag) => (
              <Tag
                key={tag}
                round
                color="default"
                style={{
                  "--border-color": "var(--color-border)",
                  "--text-color": "var(--color-muted-foreground)",
                  "--background-color": "var(--color-muted)",
                } as React.CSSProperties}
              >
                #{tag}
              </Tag>
            ))}
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-8 flex-wrap">
        {!message.is_read && recipientToken && (
          <Button
            onClick={() => markRead(recipientToken, [message.id])}
            size="middle"
            style={{
              "--border-color": "var(--color-border)",
              "--text-color": "var(--color-foreground)",
              "--background-color": "var(--color-card)",
            } as React.CSSProperties}
          >
            <span className="flex items-center gap-2">
              <Check className="h-4 w-4" />
              标记已读
            </span>
          </Button>
        )}

        <Button
          onClick={handleCopy}
          size="middle"
          style={{
            "--border-color": "var(--color-border)",
            "--text-color": "var(--color-foreground)",
            "--background-color": "var(--color-card)",
          } as React.CSSProperties}
        >
          <span className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            复制内容
          </span>
        </Button>
      </div>
    </div>
  );
}
