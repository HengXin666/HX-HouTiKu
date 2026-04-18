import { useState } from "react";
import {
  User,
  Bell,
  Palette,
  Trash2,
  Copy,
  Check,
  Moon,
  Sun,
  Monitor,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { resetAll, clearMessages } from "@/lib/db";
import { copyToClipboard, cn } from "@/lib/utils";

export function Settings() {
  const publicKeyHex = useAuthStore((s) => s.publicKeyHex);
  const deviceName = useAuthStore((s) => s.deviceName);
  const lock = useAuthStore((s) => s.lock);
  const resetAuth = useAuthStore((s) => s.reset);
  const rememberPassword = useAuthStore((s) => s.rememberPassword);
  const setRememberPassword = useAuthStore((s) => s.setRememberPassword);

  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setFontSize = useSettingsStore((s) => s.setFontSize);

  const [copied, setCopied] = useState(false);

  const handleCopyKey = async () => {
    if (!publicKeyHex) return;
    const ok = await copyToClipboard(publicKeyHex);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm("确定清除本地消息缓存？")) return;
    await clearMessages();
    window.location.reload();
  };

  const handleFullReset = async () => {
    if (!window.confirm("⚠️ 确定重置所有数据？密钥将永久丢失，无法恢复！")) return;
    if (!window.confirm("最后确认：此操作不可撤销。")) return;
    await resetAll();
    resetAuth();
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Account */}
      <SettingsSection icon={User} title="账户">
        <SettingsRow label="设备名称" value={deviceName ?? "default"} />
        <SettingsRow
          label="公钥"
          value={
            publicKeyHex
              ? `${publicKeyHex.slice(0, 16)}...${publicKeyHex.slice(-8)}`
              : "—"
          }
          action={
            <button
              onClick={handleCopyKey}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? (
                <Check className="h-4 w-4 text-priority-low" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
          }
        />
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <div>
            <span className="text-sm">自动解锁</span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              记住密码，打开 App 时跳过输入
            </p>
          </div>
          <label className="relative inline-flex cursor-pointer">
            <input
              type="checkbox"
              checked={rememberPassword}
              onChange={(e) => setRememberPassword(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-10 h-5.5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:transition-transform peer-checked:after:translate-x-[18px]" />
          </label>
        </div>
      </SettingsSection>

      {/* Appearance */}
      <SettingsSection icon={Palette} title="外观">
        <div className="px-4 py-3">
          <p className="text-sm font-medium mb-3">主题</p>
          <div className="flex gap-2">
            {(
              [
                { value: "dark", icon: Moon, label: "深色" },
                { value: "light", icon: Sun, label: "浅色" },
                { value: "system", icon: Monitor, label: "跟随系统" },
              ] as const
            ).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1.5 rounded-xl border py-3 text-xs font-medium transition-all",
                  theme === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-border">
          <p className="text-sm font-medium mb-3">字体大小</p>
          <div className="flex gap-2">
            {(
              [
                { value: "small", label: "小" },
                { value: "medium", label: "中" },
                { value: "large", label: "大" },
              ] as const
            ).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFontSize(value)}
                className={cn(
                  "flex-1 rounded-xl border py-2.5 text-sm font-medium transition-all",
                  fontSize === value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>

      {/* Notification */}
      <SettingsSection icon={Bell} title="通知">
        <SettingsRow
          label="Web Push"
          value={
            "Notification" in window
              ? Notification.permission === "granted"
                ? "✅ 已开启"
                : "未开启"
              : "不支持"
          }
        />
        <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">
          <p>urgent → 持续震动 · high → 震动 · default → 静默 · low/debug → 不推送</p>
        </div>
      </SettingsSection>

      {/* Data */}
      <SettingsSection icon={Trash2} title="数据">
        <button
          onClick={handleClearCache}
          className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-muted transition-colors"
        >
          <span>清除本地消息缓存</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          onClick={handleFullReset}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors border-t border-border"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            重置所有数据
          </span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </SettingsSection>

      {/* Footer */}
      <div className="text-center py-4">
        <p className="text-[11px] text-muted-foreground">
          v1.0.0 · E2E Encrypted ·{" "}
          <a
            href="https://github.com/HX-HouTiKu"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline underline-offset-2"
          >
            GitHub
          </a>
        </p>
      </div>
    </div>
  );
}

// --- Sub-components ---

function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2 px-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 [&:not(:first-child)]:border-t border-border">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground font-mono">
          {value}
        </span>
        {action}
      </div>
    </div>
  );
}
