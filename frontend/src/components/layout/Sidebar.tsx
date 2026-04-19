import {
  Newspaper,
  FolderOpen,
  Settings,
  Shield,
  Lock,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMessageStore } from "@/stores/message-store";
import { useAuthStore } from "@/stores/auth-store";
import { useCallback } from "react";

interface SidebarProps {
  className?: string;
}

const NAV_ITEMS = [
  {
    to: "/",
    icon: Newspaper,
    label: "信息流",
    desc: "所有消息",
    end: true,
  },
  {
    to: "/groups",
    icon: FolderOpen,
    label: "分组",
    desc: "按分类查看",
    end: false,
  },
  {
    to: "/settings",
    icon: Settings,
    label: "设置",
    desc: "账户与偏好",
    end: false,
  },
] as const;

export function Sidebar({ className }: SidebarProps) {
  const totalUnread = useMessageStore((s) => s.totalUnread);
  const loading = useMessageStore((s) => s.loading);
  const fetchAndDecrypt = useMessageStore((s) => s.fetchAndDecrypt);
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const privateKeyHex = useAuthStore((s) => s.privateKeyHex);
  const deviceName = useAuthStore((s) => s.deviceName);
  const lock = useAuthStore((s) => s.lock);

  const handleRefresh = useCallback(() => {
    if (!recipientToken || !privateKeyHex) return;
    fetchAndDecrypt(recipientToken, privateKeyHex);
  }, [recipientToken, privateKeyHex, fetchAndDecrypt]);

  return (
    <aside className={cn("sidebar", className)}>
      {/* ── Logo area ── */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <Shield className="sidebar-logo-shield" />
        </div>
        <div className="sidebar-logo-text">
          <span className="sidebar-logo-name">HX-HouTiKu</span>
          <span className="sidebar-logo-tag">E2E Encrypted</span>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="sidebar-nav">
        <div className="sidebar-nav-label">导航</div>
        {NAV_ITEMS.map(({ to, icon: Icon, label, desc, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn("sidebar-nav-item", isActive && "sidebar-nav-item--active")
            }
          >
            <div className="sidebar-nav-icon-wrap">
              <Icon className="sidebar-nav-icon" />
            </div>
            <div className="sidebar-nav-content">
              <span className="sidebar-nav-label-text">{label}</span>
              <span className="sidebar-nav-desc">{desc}</span>
            </div>
            {to === "/" && totalUnread > 0 ? (
              <span className="sidebar-badge">
                {totalUnread > 99 ? "99+" : totalUnread}
              </span>
            ) : (
              <ChevronRight className="sidebar-nav-arrow" />
            )}
          </NavLink>
        ))}
      </nav>

      {/* ── Spacer ── */}
      <div className="sidebar-spacer" />

      {/* ── Quick actions ── */}
      <div className="sidebar-actions">
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="sidebar-action-btn"
          title="刷新消息"
        >
          <RefreshCw
            className={cn(
              "sidebar-action-icon",
              loading && "animate-spin"
            )}
          />
          <span>刷新</span>
        </button>
        <button onClick={lock} className="sidebar-action-btn" title="锁定">
          <Lock className="sidebar-action-icon" />
          <span>锁定</span>
        </button>
      </div>

      {/* ── Footer: device info ── */}
      <div className="sidebar-footer">
        <div className="sidebar-device">
          <div className="sidebar-device-avatar">
            {(deviceName ?? "D")[0].toUpperCase()}
          </div>
          <div className="sidebar-device-info">
            <span className="sidebar-device-name">
              {deviceName ?? "default"}
            </span>
            <span className="sidebar-device-status">
              {recipientToken ? "已连接" : "未配置"}
            </span>
          </div>
        </div>
        <p className="sidebar-version">v1.0.0</p>
      </div>
    </aside>
  );
}
