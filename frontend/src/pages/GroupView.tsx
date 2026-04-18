import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { useMessageStore } from "@/stores/message-store";
import { getGroupEmoji, relativeTime, cn } from "@/lib/utils";

export function GroupView() {
  const messages = useMessageStore((s) => s.messages);
  const navigate = useNavigate();

  // Aggregate groups
  const groupMap = new Map<
    string,
    { total: number; unread: number; latestTimestamp: number }
  >();

  for (const msg of messages) {
    const existing = groupMap.get(msg.group) ?? {
      total: 0,
      unread: 0,
      latestTimestamp: 0,
    };
    existing.total++;
    if (!msg.is_read) existing.unread++;
    if (msg.timestamp > existing.latestTimestamp) {
      existing.latestTimestamp = msg.timestamp;
    }
    groupMap.set(msg.group, existing);
  }

  const groups = [...groupMap.entries()]
    .sort((a, b) => b[1].latestTimestamp - a[1].latestTimestamp);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-4xl mb-4">📂</div>
        <h3 className="text-sm font-medium mb-1">暂无分组</h3>
        <p className="text-xs text-muted-foreground">
          消息到达后会自动按分组归类
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
        分组
      </h2>

      {groups.map(([name, stats]) => (
        <button
          key={name}
          onClick={() => navigate(`/groups/${name}`)}
          className="w-full flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-all hover:bg-card/80 hover:shadow-lg hover:shadow-black/5 active:scale-[0.99]"
        >
          {/* Emoji */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-lg">
            {getGroupEmoji(name)}
          </div>

          {/* Info */}
          <div className="flex-1 text-left min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate">{name}</h3>
              {stats.unread > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
                  {stats.unread}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.total} 条消息 · 最新 {relativeTime(stats.latestTimestamp)}
            </p>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      ))}
    </div>
  );
}
