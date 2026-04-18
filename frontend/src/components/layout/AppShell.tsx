import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <Sidebar className="hidden md:flex" />

      <div className="flex flex-1 flex-col min-w-0">
        <Header />

        <main className="flex-1 overflow-y-auto px-4 pb-20 md:pb-4 pt-2">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <BottomNav className="md:hidden" />
      </div>
    </div>
  );
}
