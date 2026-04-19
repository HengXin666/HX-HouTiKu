import { RefreshCw, Lock, Settings, ChevronLeft } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

export function Header() {
  const lock = useAuthStore((s) => s.lock);
  const totalUnread = useMessageStore((s) => s.totalUnread);
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);
  const fetchAndDecrypt = useMessageStore((s) => s.fetchAndDecrypt);
  const loading = useMessageStore((s) => s.loading);
  const location = useLocation();
  const navigate = useNavigate();

  const handleRefresh = useCallback(() => {
    if (!recipientToken || !privateKeyHex) return;
    fetchAndDecrypt(recipientToken, privateKeyHex);
  }, [recipientToken, privateKeyHex, fetchAndDecrypt]);

  const pageTitle = (() => {
    if (location.pathname === "/groups") return "分组";
    if (location.pathname === "/settings") return "设置";
    if (location.pathname.startsWith("/message/")) return "消息详情";
    if (location.pathname.startsWith("/groups/")) {
      return decodeURIComponent(location.pathname.split("/groups/")[1]);
    }
    return "信息流";
  })();

  const isSubPage =
    location.pathname !== "/" &&
    location.pathname !== "/groups" &&
    location.pathname !== "/settings";

  return (
    <header className="app-header">
      <div className="app-header-inner">
        {/* Left */}
        <div className="app-header-left">
          {isSubPage ? (
            <button
              onClick={() => navigate(-1)}
              className="app-header-back"
              aria-label="返回"
            >
              <ChevronLeft className="app-header-back-icon" />
            </button>
          ) : null}

          <h1 className="app-header-title">{pageTitle}</h1>

          {totalUnread > 0 && location.pathname === "/" && (
            <span className="app-header-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
          )}
        </div>

        {/* Right */}
        <div className="app-header-right">
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="app-header-action"
            title="刷新消息"
          >
            <RefreshCw
              className={cn("app-header-action-icon", loading && "animate-spin")}
            />
          </button>

          <Link
            to="/settings"
            className="app-header-action app-header-action--hide-desktop"
            title="设置"
          >
            <Settings className="app-header-action-icon" />
          </Link>

          <button
            onClick={lock}
            className="app-header-action app-header-action--hide-desktop"
            title="锁定"
          >
            <Lock className="app-header-action-icon" />
          </button>
        </div>
      </div>
    </header>
  );
}
