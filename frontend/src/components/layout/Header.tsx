import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Settings,
  Lock,
  Search,
  X,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string> = {
  "/": "MsgReader",
  "/groups": "分组",
  "/starred": "收藏",
  "/settings": "设置",
};

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const lock = useAuthStore((s) => s.lock);
  const totalUnread = useMessageStore((s) => s.totalUnread);
  const messages = useMessageStore((s) => s.messages);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isDetail =
    location.pathname.startsWith("/message/") ||
    (location.pathname.startsWith("/groups/") && location.pathname !== "/groups") ||
    location.pathname.startsWith("/clone");
  const isGroupDetail = location.pathname.startsWith("/groups/") && location.pathname !== "/groups";

  let title = TITLES[location.pathname] ?? "";
  if (isGroupDetail) {
    title = decodeURIComponent(location.pathname.split("/groups/")[1] ?? "分组");
  }
  if (location.pathname.startsWith("/message/")) {
    title = "消息详情";
  }
  if (location.pathname.startsWith("/clone")) {
    title = "设备克隆";
  }

  // Always show header on mobile — per prototype design
  const showOnMobile = true;

  // Search results
  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return messages.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.body.toLowerCase().includes(q) ||
        m.group.toLowerCase().includes(q) ||
        (m.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
    );
  }, [query, messages]);

  // Auto-focus input when search opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setQuery("");
    }
  }, [searchOpen]);

  // Close search on route change
  useEffect(() => {
    setSearchOpen(false);
  }, [location.pathname]);

  return (
    <>
      <header className={cn("app-header", !showOnMobile && "app-header--hide-mobile")}>
        <div className="app-header-inner">
          <div className="app-header-left">
            {isDetail ? (
              <button
                onClick={() => navigate(-1)}
                className="app-header-back"
                aria-label="返回"
              >
                <ArrowLeft className="app-header-back-icon" />
              </button>
            ) : null}
            <h1 className="app-header-title">
              {title}
            </h1>
            {!isDetail && totalUnread > 0 && (
              <span className="app-header-badge">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            )}
          </div>

          <div className="app-header-right">
            {!isDetail && (
              <>
                <button
                  onClick={() => setSearchOpen(true)}
                  className="app-header-action"
                  title="搜索"
                >
                  <Search className="app-header-action-icon" />
                </button>
                <button
                  onClick={() => lock()}
                  className="app-header-action app-header-action--hide-desktop"
                  title="锁定"
                >
                  <Lock className="app-header-action-icon" />
                </button>
                <Link
                  to="/settings"
                  className="app-header-action app-header-action--hide-desktop"
                  title="设置"
                >
                  <Settings className="app-header-action-icon" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Search overlay */}
      {searchOpen && (
        <div className="search-overlay" onClick={() => setSearchOpen(false)}>
          <div className="search-overlay-inner" onClick={(e) => e.stopPropagation()}>
            <div className="search-overlay-bar">
              <Search style={{ width: 18, height: 18, flexShrink: 0, color: "var(--color-muted-foreground)" }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索消息标题、内容、分组..."
                className="search-overlay-input"
              />
              {query ? (
                <button onClick={() => setQuery("")} className="search-overlay-clear">
                  <X style={{ width: 16, height: 16 }} />
                </button>
              ) : (
                <button onClick={() => setSearchOpen(false)} className="search-overlay-clear">
                  <X style={{ width: 16, height: 16 }} />
                </button>
              )}
            </div>

            {query.trim() && (
              <div className="search-overlay-results">
                {searchResults.length === 0 ? (
                  <div className="search-overlay-empty">无匹配结果</div>
                ) : (
                  <>
                    <div className="search-overlay-count">{searchResults.length} 条结果</div>
                    {searchResults.slice(0, 20).map((m) => (
                      <button
                        key={m.id}
                        className="search-overlay-item"
                        onClick={() => {
                          setSearchOpen(false);
                          navigate(`/message/${m.id}`);
                        }}
                      >
                        <div className={cn("search-overlay-item-bar", `msg-card-bar--${m.priority}`)} />
                        <div className="search-overlay-item-content">
                          <div className="search-overlay-item-title">{m.title}</div>
                          <div className="search-overlay-item-meta">
                            {m.group} · {new Date(m.timestamp).toLocaleDateString("zh-CN")}
                          </div>
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
