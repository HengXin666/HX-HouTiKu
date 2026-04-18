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

    const KEYBOARD_THRESHOLD = 150; // px difference to consider keyboard open

    const update = () => {
      const fullHeight = window.innerHeight;
      const viewportHeight = vv.height;
      const keyboardOpen = fullHeight - viewportHeight > KEYBOARD_THRESHOLD;

      // Set CSS variable for visual viewport height
      document.documentElement.style.setProperty(
        "--visual-vh",
        `${viewportHeight * 0.01}px`
      );

      // Toggle keyboard-open class
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
    <div className="flex min-h-dvh bg-background">
      {/* Desktop sidebar */}
      <Sidebar className="hidden md:flex" />

      <div className="flex flex-1 flex-col min-w-0">
        <Header />

        <main className="main-content flex-1 overflow-y-auto px-4 pb-20 md:pb-4 pt-2">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <BottomNav className="md:hidden" />
      </div>
    </div>
  );
}
