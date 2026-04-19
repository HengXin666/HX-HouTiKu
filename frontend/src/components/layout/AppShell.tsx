import { type ReactNode, useEffect } from "react";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const KEYBOARD_THRESHOLD = 150;

    const update = () => {
      const fullHeight = window.innerHeight;
      const viewportHeight = vv.height;
      const keyboardOpen = fullHeight - viewportHeight > KEYBOARD_THRESHOLD;
      document.documentElement.style.setProperty(
        "--visual-vh",
        `${viewportHeight * 0.01}px`
      );
      document.documentElement.classList.toggle("keyboard-open", keyboardOpen);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.documentElement.classList.remove("keyboard-open");
      document.documentElement.style.removeProperty("--visual-vh");
    };
  }, []);

  return (
    <div className="app-shell">
      {/* Desktop sidebar — hidden on mobile via CSS */}
      <Sidebar />

      {/* Main column */}
      <div className="app-shell-main">
        <Header />

        <main className="app-shell-content">
          <div className="app-shell-container">
            {children}
          </div>
        </main>

        {/* Mobile bottom nav — hidden on desktop via CSS */}
        <BottomNav />
      </div>
    </div>
  );
}
