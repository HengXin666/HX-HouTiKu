import { Search, Settings, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function Header() {
  const lock = useAuthStore((s) => s.lock);
  const totalUnread = useMessageStore((s) => s.totalUnread);
  const [showSearch, setShowSearch] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">
            Unified Push
          </h1>
          {totalUnread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-medium text-primary-foreground">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="搜索"
          >
            <Search className="h-5 w-5" />
          </button>

          <Link
            to="/settings"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="设置"
          >
            <Settings className="h-5 w-5" />
          </Link>

          <button
            onClick={lock}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="锁定"
          >
            <Lock className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Search bar (expandable) */}
      {showSearch && (
        <div className="border-t border-border px-4 py-2 animate-[slide-up_0.2s_ease-out]">
          <input
            type="search"
            placeholder="搜索消息..."
            autoFocus
            className="w-full rounded-lg bg-input px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            onBlur={() => setShowSearch(false)}
          />
        </div>
      )}
    </header>
  );
}
