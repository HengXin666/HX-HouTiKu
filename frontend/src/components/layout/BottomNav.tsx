import { useLocation, useNavigate } from "react-router-dom";
import { Inbox, Star, FolderOpen, Settings, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMessageStore } from "@/stores/message-store";
import type { WsStatus } from "@/lib/ws-manager";

const TABS = [
  { path: "/", label: "收件", icon: Inbox },
  { path: "/starred", label: "收藏", icon: Star },
  { path: "/groups", label: "分组", icon: FolderOpen },
  { path: "/settings", label: "设置", icon: Settings },
] as const;

interface BottomNavProps {
  wsStatus: WsStatus;
  deviceCount: number;
}

export function BottomNav({ wsStatus, deviceCount }: BottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const totalUnread = useMessageStore((s) => s.totalUnread);

  return (
    <nav className="bottom-nav" aria-label="底部导航">
      {/* Mini WS status bar — mobile only */}
      <div className={cn(
        "bottom-nav-ws",
        wsStatus === "connected" && "bottom-nav-ws--connected",
        wsStatus === "connecting" && "bottom-nav-ws--connecting",
        (wsStatus === "disconnected" || wsStatus === "idle") && "bottom-nav-ws--disconnected",
      )}>
        {wsStatus === "connected" ? (
          <Wifi style={{ width: 10, height: 10 }} />
        ) : (
          <WifiOff style={{ width: 10, height: 10 }} />
        )}
        <span>
          {wsStatus === "connected"
            ? `在线${deviceCount > 1 ? ` · ${deviceCount} 设备` : ""}`
            : wsStatus === "connecting" ? "连接中..." : "离线"}
        </span>
      </div>

      {/* Tab buttons */}
      <div className="bottom-nav-tabs">
        {TABS.map(({ path, label, icon: Icon }) => {
          const isActive =
            path === "/"
              ? location.pathname === "/" ||
                location.pathname.startsWith("/message")
              : path === "/groups"
                ? location.pathname.startsWith("/groups")
                : path === "/starred"
                  ? location.pathname === "/starred"
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
      </div>
    </nav>
  );
}
