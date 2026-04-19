import { useLocation, useNavigate } from "react-router-dom";
import { Newspaper, FolderOpen, Settings } from "lucide-react";
import { useMessageStore } from "@/stores/message-store";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  className?: string;
}

const tabs = [
  { key: "/", label: "信息流", icon: Newspaper },
  { key: "/groups", label: "分组", icon: FolderOpen },
  { key: "/settings", label: "设置", icon: Settings },
] as const;

export function BottomNav({ className }: BottomNavProps) {
  const totalUnread = useMessageStore((s) => s.totalUnread);
  const location = useLocation();
  const navigate = useNavigate();

  const activeKey =
    tabs.find((t) => {
      if (t.key === "/") return location.pathname === "/";
      return location.pathname.startsWith(t.key);
    })?.key ?? "/";

  return (
    <nav className={cn("bottom-nav", className)}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeKey === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => navigate(tab.key)}
            className={cn(
              "bottom-nav-item",
              isActive && "bottom-nav-item--active"
            )}
          >
            <div className="bottom-nav-icon-wrap">
              <Icon className="bottom-nav-icon" />
              {tab.key === "/" && totalUnread > 0 && (
                <span className="bottom-nav-badge">
                  {totalUnread > 9 ? "9+" : totalUnread}
                </span>
              )}
            </div>
            <span className="bottom-nav-label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
