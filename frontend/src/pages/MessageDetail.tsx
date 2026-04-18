import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Copy, Clock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import { PriorityBadge } from "@/components/message/PriorityBadge";
import { GroupChip } from "@/components/message/GroupChip";
import { copyToClipboard, cn } from "@/lib/utils";

export function MessageDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const messages = useMessageStore((s) => s.messages);
  const markRead = useMessageStore((s) => s.markRead);

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
        <button
          onClick={() => navigate(-1)}
          className="mt-4 text-primary text-sm hover:underline"
        >
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

  return (
    <div className="max-w-2xl mx-auto animate-[fade-in_0.2s_ease-out]">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        返回
      </button>

      {/* Header */}
      <div className="space-y-3 mb-6">
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
      <hr className="border-border mb-6" />

      {/* Title */}
      <h1 className="text-xl font-bold tracking-tight mb-4">
        {message.title}
      </h1>

      {/* Body — Markdown */}
      {message.body && (
        <div className="prose prose-sm prose-invert max-w-none [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-4 [&_code]:text-primary [&_a]:text-primary [&_a]:underline [&_ul]:space-y-1 [&_ol]:space-y-1 [&_li]:text-muted-foreground [&_p]:text-foreground/90 [&_p]:leading-relaxed [&_h2]:text-foreground [&_h3]:text-foreground [&_strong]:text-foreground [&_blockquote]:border-l-primary/50 [&_blockquote]:text-muted-foreground">
          <ReactMarkdown>{message.body}</ReactMarkdown>
        </div>
      )}

      {/* Tags */}
      {message.tags.length > 0 && (
        <>
          <hr className="border-border my-6" />
          <div className="flex flex-wrap gap-2">
            {message.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-muted px-2.5 py-1 text-xs text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-8">
        {!message.is_read && recipientToken && (
          <button
            onClick={() => markRead(recipientToken, [message.id])}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            <Check className="h-4 w-4" />
            标记已读
          </button>
        )}

        <button
          onClick={() =>
            copyToClipboard(`${message.title}\n\n${message.body}`)
          }
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <Copy className="h-4 w-4" />
          复制内容
        </button>
      </div>
    </div>
  );
}
