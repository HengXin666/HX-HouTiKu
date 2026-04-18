import { MessageCard } from "./MessageCard";
import { EmptyState } from "./EmptyState";
import { groupByDate } from "@/lib/utils";
import type { Message } from "@/stores/message-store";

interface MessageListProps {
  messages: Message[];
  loading?: boolean;
}

export function MessageList({ messages, loading }: MessageListProps) {
  if (!loading && messages.length === 0) {
    return <EmptyState />;
  }

  const groups = groupByDate(messages);

  return (
    <div className="space-y-6">
      {[...groups.entries()].map(([date, msgs]) => (
        <section key={date}>
          <h2 className="sticky top-0 z-10 mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {date}
          </h2>
          <div className="space-y-2">
            {msgs.map((msg) => (
              <MessageCard key={msg.id} message={msg} />
            ))}
          </div>
        </section>
      ))}

      {loading && (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
        </div>
      )}
    </div>
  );
}
