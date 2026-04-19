import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-shell-main">
        <Header />
        <div className="app-shell-content">
          <div className="app-shell-container">
            {children}
          </div>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
