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
import { CloneDevice } from "@/pages/CloneDevice";
import { SearchPage } from "@/pages/SearchPage";
import { StarredPage } from "@/pages/StarredPage";
import { AppShell } from "@/components/layout/AppShell";
import { registerPushSubscription } from "@/lib/push";
import { hasWebPush, isNativeAndroid } from "@/lib/platform";
import { wsInit, wsDestroy } from "@/lib/ws-manager";

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

  // ── WebSocket lifecycle: init when unlocked, destroy on lock/logout ──
  useEffect(() => {
    if (status === "unlocked" && recipientToken) {
      wsInit(recipientToken);
    } else {
      wsDestroy();
    }
  }, [status, recipientToken]);

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
        <Route path="/clone" element={<CloneDevice />} />
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
        <Route path="/channels" element={<Feed />} />
        <Route path="/channels/:channelId" element={<Feed />} />
        <Route path="/groups" element={<GroupView />} />
        <Route path="/groups/:groupName" element={<Feed />} />
        <Route path="/starred" element={<StarredPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/message/:id" element={<MessageDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/clone" element={<CloneDevice />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function SplashScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="text-center">
        <div className="splash-loader">
          <div className="splash-loader-ring" />
          <div className="splash-loader-icon">🔐</div>
        </div>
        <p className="text-muted-foreground text-sm mt-6 animate-pulse">正在加载...</p>
      </div>
    </div>
  );
}
