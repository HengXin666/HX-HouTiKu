import { useEffect, useState, useRef } from "react";
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
import { StarredPage } from "@/pages/StarredPage";
import { AppShell } from "@/components/layout/AppShell";
import { registerPushSubscription } from "@/lib/push";
import { hasWebPush, isNativeAndroid, getNativeBridge } from "@/lib/platform";
import { wsInit, wsDestroy } from "@/lib/ws-manager";

export function App() {
  const status = useAuthStore((s) => s.status);
  const initAuth = useAuthStore((s) => s.initialize);
  const initSettings = useSettingsStore((s) => s.initialize);
  const pushEnabled = useSettingsStore((s) => s.pushEnabled);
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string } | null>(null);

  useEffect(() => {
    initAuth();
    initSettings();
  }, [initAuth, initSettings]);

  // Android 更新检测回调
  useEffect(() => {
    if (isNativeAndroid) {
      window.__hxNativeUpdateAvailable = (version: string, url: string) => {
        setUpdateInfo({ version, url });
      };
      return () => { window.__hxNativeUpdateAvailable = undefined; };
    }
  }, []);

  // ── WebSocket lifecycle: init when unlocked, destroy on lock/logout ──
  useEffect(() => {
    if (status === "unlocked" && recipientToken) {
      wsInit(recipientToken);
    } else {
      wsDestroy();
    }
  }, [status, recipientToken]);

  // Auto-register push when unlocked + pushEnabled + permission already granted
  // 使用 ref 避免重复调用 startWebSocket 导致服务端设备计数增长
  const pushRegisteredRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      status !== "unlocked" ||
      !recipientToken ||
      !pushEnabled
    ) {
      pushRegisteredRef.current = null;
      return;
    }

    if (pushRegisteredRef.current === recipientToken) return;

    // Native Android: always try to register (native bridge handles permission)
    // Web: only if Web Push is supported and permission is already granted
    if (isNativeAndroid || (hasWebPush && Notification.permission === "granted")) {
      pushRegisteredRef.current = recipientToken;
      registerPushSubscription(recipientToken).catch(console.error);
    }
  }, [status, recipientToken, pushEnabled]);

  if (status === "loading") {
    return <SplashScreen />;
  }

  return (
    <BrowserRouter>
      {updateInfo && (
        <UpdateBanner
          version={updateInfo.version}
          url={updateInfo.url}
          onDismiss={() => {
            const bridge = getNativeBridge();
            if (bridge) bridge.skipUpdate(updateInfo.version);
            setUpdateInfo(null);
          }}
          onUpdate={() => {
            const bridge = getNativeBridge();
            if (bridge) bridge.openUrl(updateInfo.url);
          }}
        />
      )}
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

function UpdateBanner({ version, url, onDismiss, onUpdate }: {
  version: string;
  url: string;
  onDismiss: () => void;
  onUpdate: () => void;
}) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
      color: "#fff", padding: "12px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      fontSize: "14px", gap: "8px",
      paddingTop: "calc(12px + var(--sat, 0px))",
    }}>
      <span>🚀 新版本 v{version} 可用</span>
      <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
        <button onClick={onDismiss} style={{
          background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
          borderRadius: "6px", padding: "4px 12px", cursor: "pointer",
        }}>跳过</button>
        <button onClick={onUpdate} style={{
          background: "#fff", border: "none", color: "#1d4ed8",
          borderRadius: "6px", padding: "4px 12px", cursor: "pointer", fontWeight: 600,
        }}>更新</button>
      </div>
    </div>
  );
}
