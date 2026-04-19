import { useLocation, useNavigate } from "react-router-dom";
import { Home, FolderOpen, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMessageStore } from "@/stores/message-store";

const TABS = [
  { path: "/", label: "信息流", icon: Home },
  { path: "/groups", label: "分组", icon: FolderOpen },
  { path: "/settings", label: "设置", icon: Settings },
] as const;

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const totalUnread = useMessageStore((s) => s.totalUnread);

  return (
    <nav className="bottom-nav" aria-label="底部导航">
      {TABS.map(({ path, label, icon: Icon }) => {
        const isActive =
          path === "/"
            ? location.pathname === "/" ||
              location.pathname.startsWith("/message") ||
              (location.pathname.startsWith("/groups/") && location.pathname !== "/groups")
            : location.pathname === path;

        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={cn("bottom-nav-item", isActive && "bottom-nav-item--active")}
            aria-label={label}
          >
            <div className="bottom-nav-icon-wrap">
              <Icon className="bottom-nav-icon" />
              {path === "/" && totalUnread > 0 && (
                <span className="bottom-nav-badge">
                  {totalUnread > 99 ? "99+" : totalUnread}
                </span>
              )}
            </div>
            <span className="bottom-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
