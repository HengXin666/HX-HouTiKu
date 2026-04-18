import { Newspaper, FolderOpen, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMessageStore } from "@/stores/message-store";

interface BottomNavProps {
  className?: string;
}

const NAV_ITEMS = [
  { to: "/", icon: Newspaper, label: "信息流" },
  { to: "/groups", icon: FolderOpen, label: "分组" },
  { to: "/settings", icon: Settings, label: "设置" },
] as const;

export function BottomNav({ className }: BottomNavProps) {
  const totalUnread = useMessageStore((s) => s.totalUnread);

  return (
    <nav
      className={cn(
        "bottom-nav-bar fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/90 backdrop-blur-xl safe-bottom transition-transform duration-200",
        className
      )}
    >
      <div className="flex items-center justify-around py-2">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )
            }
          >
            <div className="relative">
              <Icon className="h-5 w-5" />
              {to === "/" && totalUnread > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-priority-urgent px-1 text-[10px] font-bold text-white">
                  {totalUnread > 9 ? "9+" : totalUnread}
                </span>
              )}
            </div>
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
