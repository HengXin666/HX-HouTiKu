import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { LockScreen } from "@/pages/LockScreen";
import { SetupWizard } from "@/pages/SetupWizard";
import { Feed } from "@/pages/Feed";
import { GroupView } from "@/pages/GroupView";
import { MessageDetail } from "@/pages/MessageDetail";
import { Settings } from "@/pages/Settings";
import { AppShell } from "@/components/layout/AppShell";
import { registerPushSubscription } from "@/lib/push";
import { hasWebPush, isNativeAndroid } from "@/lib/platform";

export function App() {
  const status = useAuthStore((s) => s.status);
  const initAuth = useAuthStore((s) => s.initialize);
  const initSettings = useSettingsStore((s) => s.initialize);
  const pushEnabled = useSettingsStore((s) => s.pushEnabled);
  const recipientToken = useAuthStore((s) => s.recipientToken);

  useEffect(() => {
    initAuth();
    initSettings();
  }, [initAuth, initSettings]);

  // Auto-register push when unlocked + pushEnabled + permission already granted
  useEffect(() => {
    if (
      status !== "unlocked" ||
      !recipientToken ||
      !pushEnabled
    ) return;

    // Native Android: always try to register (native bridge handles permission)
    // Web: only if Web Push is supported and permission is already granted
    if (isNativeAndroid || (hasWebPush && Notification.permission === "granted")) {
      registerPushSubscription(recipientToken).catch(console.error);
    }
  }, [status, recipientToken, pushEnabled]);

  if (status === "loading") {
    return <SplashScreen />;
  }

  return (
    <BrowserRouter>
      <AppContent status={status} />
    </BrowserRouter>
  );
}

function AppContent({ status }: { status: string }) {
  if (status === "no-keys") {
    return (
      <Routes>
        <Route path="/setup" element={<SetupWizard />} />
        <Route path="*" element={<Navigate to="/setup" replace />} />
      </Routes>
    );
  }

  if (status === "locked") {
    return <LockScreen />;
  }

  // Unlocked — full app
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Feed />} />
        <Route path="/groups" element={<GroupView />} />
        <Route path="/groups/:groupName" element={<Feed />} />
        <Route path="/message/:id" element={<MessageDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function SplashScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="animate-pulse text-center">
        <div className="text-4xl mb-4">🔐</div>
        <p className="text-muted-foreground text-sm">加载中...</p>
      </div>
    </div>
  );
}
