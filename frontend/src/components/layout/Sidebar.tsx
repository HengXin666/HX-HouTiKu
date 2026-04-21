import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  Shield,
  Home,
  FolderOpen,
  Settings,
  RefreshCw,
  Lock,
  Unlock,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useMessageStore } from "@/stores/message-store";
import type { WsStatus } from "@/lib/ws-manager";

const NAV_ITEMS = [
  {
    path: "/",
    label: "信息流",
    icon: Home,
  },
  {
    path: "/groups",
    label: "分组",
    icon: FolderOpen,
  },
  {
    path: "/settings",
    label: "设置",
    icon: Settings,
  },
] as const;

interface SidebarProps {
  wsStatus: WsStatus;
  deviceCount: number;
}

export function Sidebar({ wsStatus, deviceCount }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const deviceName = useAuthStore((s) => s.deviceName);
  const totalUnread = useMessageStore((s) => s.totalUnread);
  const lock = useAuthStore((s) => s.lock);

  return (
    <nav className="sidebar" aria-label="主导航">
      {/* Logo */}
      <Link to="/" className="sidebar-logo" style={{ textDecoration: "none" }}>
        <div className="sidebar-logo-icon">
          <Shield className="sidebar-logo-shield" />
        </div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">HouTiKu</span>
          <span className="sidebar-logo-tag">E2E Encrypted</span>
        </div>
      </Link>

      {/* Navigation */}
      <div className="sidebar-nav">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const isActive =
            path === "/"
              ? location.pathname === "/" || location.pathname.startsWith("/message")
              : location.pathname.startsWith(path);

          return (
            <Link
              key={path}
              to={path}
              className={cn(
                "sidebar-nav-item",
                isActive && "sidebar-nav-item--active"
              )}
            >
              <div className="sidebar-nav-icon-wrap">
                <Icon className="sidebar-nav-icon" />
              </div>
              <div className="sidebar-nav-content">
                <span className="sidebar-nav-label-text">{label}</span>
              </div>
              {path === "/" && totalUnread > 0 && (
                <span className="sidebar-badge">{totalUnread > 99 ? "99+" : totalUnread}</span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="sidebar-spacer" />

      {/* WS connection status */}
      <div className="sidebar-ws-status">
        <div className={cn(
          "sidebar-ws-indicator",
          wsStatus === "connected" && "sidebar-ws-indicator--connected",
          wsStatus === "connecting" && "sidebar-ws-indicator--connecting",
          (wsStatus === "disconnected" || wsStatus === "idle") && "sidebar-ws-indicator--disconnected",
        )}>
          {wsStatus === "connected" ? (
            <Wifi style={{ width: 14, height: 14 }} />
          ) : (
            <WifiOff style={{ width: 14, height: 14 }} />
          )}
          <span>
            {wsStatus === "connected"
              ? `实时连接${deviceCount > 1 ? ` · ${deviceCount} 设备` : ""}`
              : wsStatus === "connecting"
                ? "连接中..."
                : "离线"}
          </span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="sidebar-actions">
        <button
          onClick={() => navigate("/")}
          className="sidebar-action-btn"
          title="刷新消息"
        >
          <RefreshCw className="sidebar-action-icon" />
          刷新
        </button>
        <button
          onClick={() => lock()}
          className="sidebar-action-btn"
          title="锁定"
        >
          <Lock className="sidebar-action-icon" />
          锁定
        </button>
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        <div className="sidebar-device">
          <div className="sidebar-device-avatar">
            {(deviceName ?? "D")[0].toUpperCase()}
          </div>
          <div className="sidebar-device-info">
            <span className="sidebar-device-name">{deviceName ?? "default"}</span>
            <span className="sidebar-device-status">
              <Unlock style={{ width: 12, height: 12, display: "inline", verticalAlign: "middle", marginRight: 4, color: "var(--color-priority-low)" }} />
              已解锁
            </span>
          </div>
        </div>
        <div className="sidebar-version">v1.0.0</div>
      </div>
    </nav>
  );
}
