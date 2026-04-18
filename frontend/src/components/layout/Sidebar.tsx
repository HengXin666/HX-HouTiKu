import { Newspaper, FolderOpen, Settings, Shield } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMessageStore } from "@/stores/message-store";

interface SidebarProps {
  className?: string;
}

const NAV_ITEMS = [
  { to: "/", icon: Newspaper, label: "信息流" },
  { to: "/groups", icon: FolderOpen, label: "分组" },
  { to: "/settings", icon: Settings, label: "设置" },
] as const;

export function Sidebar({ className }: SidebarProps) {
  const totalUnread = useMessageStore((s) => s.totalUnread);

  return (
    <aside
      className={cn(
        "w-60 shrink-0 flex-col border-r border-border bg-card",
        className
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Shield className="h-6 w-6 text-primary" />
        <span className="font-semibold tracking-tight">HX-HouTiKu</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {to === "/" && totalUnread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-[11px] font-medium text-primary">
                {totalUnread}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <p className="text-[11px] text-muted-foreground text-center">
          v1.0.0 · E2E Encrypted
        </p>
      </div>
    </aside>
  );
}
