import { useNavigate } from "react-router-dom";
import { ChevronRight, FolderOpen } from "lucide-react";
import { useMessageStore } from "@/stores/message-store";
import { getGroupEmoji, relativeTime } from "@/lib/utils";

export function GroupView() {
  const messages = useMessageStore((s) => s.messages);
  const navigate = useNavigate();

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

  const groups = [...groupMap.entries()].sort(
    (a, b) => b[1].latestTimestamp - a[1].latestTimestamp
  );

  if (groups.length === 0) {
    return (
      <div className="feed-empty-state">
        <div className="feed-empty-icon-ring">
          <FolderOpen className="feed-empty-icon" />
        </div>
        <h3 className="feed-empty-title">暂无分组</h3>
        <p className="feed-empty-desc">消息到达后会自动按分组归类</p>
      </div>
    );
  }

  return (
    <div className="group-view">
      <div className="group-grid">
        {groups.map(([name, stats]) => (
          <button
            key={name}
            onClick={() => navigate(`/groups/${name}`)}
            className="group-card"
          >
            <div className="group-card-emoji">
              {getGroupEmoji(name)}
            </div>

            <div className="group-card-body">
              <div className="group-card-name-row">
                <h3 className="group-card-name">{name}</h3>
                {stats.unread > 0 && (
                  <span className="group-card-badge">{stats.unread}</span>
                )}
              </div>
              <p className="group-card-meta">
                {stats.total} 条消息 · 最后更新 {relativeTime(stats.latestTimestamp)}
              </p>
            </div>

            <ChevronRight className="group-card-arrow" />
          </button>
        ))}
      </div>
    </div>
  );
}
