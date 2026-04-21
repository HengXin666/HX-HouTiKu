import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { NotificationToast } from "@/components/NotificationToast";
import { useMessageReceiver } from "@/hooks/use-messages";
import { useWebSocket } from "@/hooks/use-websocket";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  // Global message receiver — never unmounts while app is unlocked
  useMessageReceiver();

  // WS status — shared across sidebar + bottom nav
  const { status: wsStatus, deviceCount } = useWebSocket();

  return (
    <div className="app-shell">
      <Sidebar wsStatus={wsStatus} deviceCount={deviceCount} />
      <main className="app-shell-main">
        <Header />
        <div className="app-shell-content">
          <div className="app-shell-container">
            {children}
          </div>
        </div>
      </main>
      <BottomNav wsStatus={wsStatus} />
      <NotificationToast />
    </div>
  );
}
