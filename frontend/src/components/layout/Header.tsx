import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  ArrowLeft,
  Settings,
  RefreshCw,
  Lock,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import { cn } from "@/lib/utils";

const TITLES: Record<string, string> = {
  "/": "信息流",
  "/groups": "分组",
  "/settings": "设置",
};

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const lock = useAuthStore((s) => s.lock);
  const totalUnread = useMessageStore((s) => s.totalUnread);

  const isDetail =
    location.pathname.startsWith("/message/") ||
    location.pathname.startsWith("/groups/") ||
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

  return (
    <header className={cn("app-header", !isDetail && "app-header--hide-mobile")}>
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
  );
}
