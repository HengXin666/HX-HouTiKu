import { Inbox } from "lucide-react";

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="rounded-2xl bg-muted p-4 mb-4">
        <Inbox className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-medium text-foreground mb-1">暂无消息</h3>
      <p className="text-xs text-muted-foreground max-w-[240px]">
        配置推送 SDK 后，消息会出现在这里
      </p>
    </div>
  );
}
