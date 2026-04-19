import { Inbox } from "lucide-react";

export function EmptyState() {
  return (
    <div className="feed-empty-state">
      <div className="feed-empty-icon-ring">
        <Inbox className="feed-empty-icon" />
      </div>
      <h3 className="feed-empty-title">暂无消息</h3>
      <p className="feed-empty-desc">
        配置好推送 SDK 后，你的消息将会出现在这里
      </p>
    </div>
  );
}
