import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/Switch";
import { Dialog } from "@/components/ui/Dialog";
import { Toast } from "@/components/ui/Toast";
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
  AlertTriangle,
  Key,
  Server,
  Edit3,
  ChevronRight,
  Smartphone,
  Fingerprint,
  Type,
  Send,
  Share2,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useSettingsStore } from "@/stores/settings-store";
import { resetAll, clearMessages, setPref, getPref } from "@/lib/db";
import { invalidateApiBaseCache, sendTestPush, sendTestPushSelf, ApiError } from "@/lib/api";
import { copyToClipboard } from "@/lib/utils";
import { isNativePlatform, hasWebNotification, hasWebPush } from "@/lib/platform";
import { usePush } from "@/hooks/use-push";

export function Settings() {
  const navigate = useNavigate();
  const publicKeyHex = useAuthStore((s) => s.publicKeyHex);
  const deviceName = useAuthStore((s) => s.deviceName);
  const lock = useAuthStore((s) => s.lock);
  const resetAuth = useAuthStore((s) => s.reset);
  const rememberPassword = useAuthStore((s) => s.rememberPassword);
  const setRememberPassword = useAuthStore((s) => s.setRememberPassword);
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const setRecipientToken = useAuthStore((s) => s.setRecipientToken);

  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const apiBase = useSettingsStore((s) => s.apiBase);
  const setApiBase = useSettingsStore((s) => s.setApiBase);

  const [copied, setCopied] = useState(false);
  const [tokenInput, setTokenInput] = useState(recipientToken ?? "");
  const [apiInput, setApiInput] = useState(apiBase);
  const [editingToken, setEditingToken] = useState(false);
  const [editingApi, setEditingApi] = useState(false);

  const { pushEnabled, enable: enablePush, disable: disablePush, loading: pushLoading } = usePush();

  // Dialog states for clear cache and full reset (declarative, React 19 compatible)
  const [clearCacheVisible, setClearCacheVisible] = useState(false);
  const [resetVisible, setResetVisible] = useState(false);
  const [resetConfirmVisible, setResetConfirmVisible] = useState(false);

  // Test push states
  const [testPushDialogVisible, setTestPushDialogVisible] = useState(false);
  const [adminTokenInput, setAdminTokenInput] = useState("");
  const [testPushSending, setTestPushSending] = useState(false);
  const [adminTokenLoaded, setAdminTokenLoaded] = useState(false);
  const [selfPushSending, setSelfPushSending] = useState(false);

  // Push to self — uses Recipient Token, no Admin Token needed
  const handleSelfPush = useCallback(async () => {
    if (!recipientToken) {
      Toast.show({ content: "请先配置 Recipient Token", position: "bottom" });
      return;
    }

    setSelfPushSending(true);
    try {
      const result = await sendTestPushSelf(recipientToken);
      if (result.push_sent) {
        Toast.show({
          content: `推送成功！已发送到 ${result.pushed_to.join(", ")}`,
          position: "bottom",
          duration: 3000,
        });
      } else {
        Toast.show({
          content: "消息已存储，但没有找到推送订阅（请先开启消息推送）",
          position: "bottom",
          duration: 3000,
        });
      }
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.status === 401
          ? "Recipient Token 无效，请检查后重试"
          : err.message
        : "发送失败，请检查网络";
      Toast.show({ content: msg, position: "bottom", duration: 3000 });
    } finally {
      setSelfPushSending(false);
    }
  }, [recipientToken]);

  // Load saved admin token on first dialog open
  const openTestPushDialog = useCallback(async () => {
    if (!adminTokenLoaded) {
      const saved = await getPref<string>("adminToken");
      if (saved) setAdminTokenInput(saved);
      setAdminTokenLoaded(true);
    }
    setTestPushDialogVisible(true);
  }, [adminTokenLoaded]);

  const handleTestPush = useCallback(async () => {
    const token = adminTokenInput.trim();
    if (!token) {
      Toast.show({ content: "请输入 Admin Token", position: "bottom" });
      return;
    }

    setTestPushSending(true);
    try {
      // Save the admin token for future use
      await setPref("adminToken", token);

      const result = await sendTestPush(token, {
        title: "🔔 测试推送",
        body: "恭喜！推送管道工作正常 ✅",
      });

      setTestPushDialogVisible(false);

      if (result.pushed_to.length > 0) {
        Toast.show({
          content: `推送成功！已发送到 ${result.pushed_to.join(", ")}`,
          position: "bottom",
          duration: 3000,
        });
      } else {
        Toast.show({
          content: "没有找到活跃的接收设备",
          position: "bottom",
        });
      }
    } catch (err) {
      const msg = err instanceof ApiError
        ? err.status === 401
          ? "Admin Token 无效，请检查后重试"
          : err.message
        : "发送失败，请检查网络";
      Toast.show({ content: msg, position: "bottom", duration: 3000 });
    } finally {
      setTestPushSending(false);
    }
  }, [adminTokenInput]);

  const handleCopyKey = async () => {
    if (!publicKeyHex) return;
    const ok = await copyToClipboard(publicKeyHex);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      Toast.show({ content: "已复制公钥", position: "bottom" });
    }
  };

  const handleSaveToken = async () => {
    const trimmed = tokenInput.trim();
    if (!trimmed) {
      Toast.show({ content: "Token 不能为空", position: "bottom" });
      return;
    }
    const recipientId = trimmed.startsWith("rt_") ? trimmed.slice(3) : trimmed;
    const token = trimmed.startsWith("rt_") ? trimmed : `rt_${trimmed}`;
    await setRecipientToken(token, recipientId);
    setEditingToken(false);
    Toast.show({ content: "Recipient Token 已保存", position: "bottom" });
  };

  const handleSaveApiBase = async () => {
    let trimmed = apiInput.trim();
    if (trimmed.endsWith("/")) trimmed = trimmed.slice(0, -1);
    await setApiBase(trimmed);
    setEditingApi(false);
    Toast.show({
      content: trimmed ? "API 地址已保存，刷新后生效" : "已恢复默认 API 地址",
      position: "bottom",
    });
  };

  const handleClearCache = useCallback(async () => {
    await clearMessages();
    setClearCacheVisible(false);
    window.location.reload();
  }, []);

  const handleFullReset = useCallback(async () => {
    setResetConfirmVisible(false);
    await resetAll();
    invalidateApiBaseCache();
    await resetAuth();
    window.location.replace("/");
  }, [resetAuth]);

  return (
    <div className="settings-page">
      {/* ── Connection ── */}
      <div className="settings-group">
        <div className="settings-group-label">连接</div>
        <div className="settings-card">
          <div className="settings-field">
            <div className="settings-field-label">
              <Key /> Recipient Token
            </div>
            <div className="settings-field-hint">
              从服务端注册设备后获得（格式：<code>rt_uuid</code>）
            </div>
            {editingToken ? (
              <div className="settings-field-form">
                <input
                  type="text"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="rt_xxxxxxxx-xxxx-xxxx..."
                  className="settings-field-input"
                  autoFocus
                />
                <button
                  onClick={handleSaveToken}
                  className="settings-field-btn settings-field-btn--save"
                >
                  保存
                </button>
                <button
                  onClick={() => {
                    setEditingToken(false);
                    setTokenInput(recipientToken ?? "");
                  }}
                  className="settings-field-btn settings-field-btn--cancel"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="settings-field-display">
                <span className="settings-field-value">
                  {recipientToken ?? "未配置"}
                </span>
                <button
                  onClick={() => {
                    setTokenInput(recipientToken ?? "");
                    setEditingToken(true);
                  }}
                  className="settings-field-edit-btn"
                  title="编辑"
                >
                  <Edit3 />
                </button>
              </div>
            )}
          </div>

          <div className="settings-field">
            <div className="settings-field-label">
              <Server /> API 地址
            </div>
            <div className="settings-field-hint">
              后端 Worker 的完整 URL，留空使用默认值
            </div>
            {editingApi ? (
              <div className="settings-field-form">
                <input
                  type="url"
                  value={apiInput}
                  onChange={(e) => setApiInput(e.target.value)}
                  placeholder="https://houtiku.api.woa.qzz.io"
                  className="settings-field-input"
                  autoFocus
                />
                <button
                  onClick={handleSaveApiBase}
                  className="settings-field-btn settings-field-btn--save"
                >
                  保存
                </button>
                <button
                  onClick={() => {
                    setEditingApi(false);
                    setApiInput(apiBase);
                  }}
                  className="settings-field-btn settings-field-btn--cancel"
                >
                  取消
                </button>
              </div>
            ) : (
              <div className="settings-field-display">
                <span className="settings-field-value">
                  {apiBase || "(默认)"}
                </span>
                <button
                  onClick={() => {
                    setApiInput(apiBase);
                    setEditingApi(true);
                  }}
                  className="settings-field-edit-btn"
                  title="编辑"
                >
                  <Edit3 />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Account ── */}
      <div className="settings-group">
        <div className="settings-group-label">账户</div>
        <div className="settings-card">
          <div className="settings-item">
            <div className="settings-item-icon settings-item-icon--indigo">
              <Smartphone />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">设备名称</div>
            </div>
            <span className="settings-item-value">
              {deviceName ?? "default"}
            </span>
          </div>

          <div className="settings-item">
            <div className="settings-item-icon settings-item-icon--slate">
              <Fingerprint />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">公钥</div>
            </div>
            <span className="settings-item-value">
              {publicKeyHex
                ? `${publicKeyHex.slice(0, 10)}…${publicKeyHex.slice(-4)}`
                : "—"}
            </span>
            <button
              onClick={handleCopyKey}
              className="settings-field-edit-btn"
              title="复制公钥"
            >
              {copied ? <Check /> : <Copy />}
            </button>
          </div>

          <div className="settings-item">
            <div className="settings-item-icon settings-item-icon--green">
              <User />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">自动解锁</div>
              <div className="settings-item-desc">
                记住密码，打开时跳过输入
              </div>
            </div>
            <div className="settings-item-action">
              <Switch
                checked={rememberPassword}
                onChange={setRememberPassword}
                style={
                  { "--checked-color": "var(--color-primary)" } as React.CSSProperties
                }
              />
            </div>
          </div>

          <button
            onClick={() => navigate("/clone")}
            className="settings-item settings-item--btn"
          >
            <div className="settings-item-icon settings-item-icon--amber">
              <Share2 />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">设备克隆</div>
              <div className="settings-item-desc">分享账号到其他设备，或从旧设备导入</div>
            </div>
            <ChevronRight className="settings-item-chevron" />
          </button>
        </div>
      </div>

      {/* ── Appearance ── */}
      <div className="settings-group">
        <div className="settings-group-label">外观</div>
        <div className="settings-card">
          <div className="settings-item">
            <div className="settings-item-icon settings-item-icon--indigo">
              <Palette />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">主题</div>
            </div>
          </div>
          <div className="settings-theme-row">
            {(
              [
                { value: "dark", icon: Moon, label: "深色" },
                { value: "light", icon: Sun, label: "浅色" },
                { value: "system", icon: Monitor, label: "系统" },
              ] as const
            ).map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`settings-theme-btn${theme === value ? " settings-theme-btn--active" : ""}`}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>

          <div className="settings-item">
            <div className="settings-item-icon settings-item-icon--amber">
              <Type />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">字体大小</div>
            </div>
          </div>
          <div className="settings-fontsize-row">
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
                className={`settings-fontsize-btn${fontSize === value ? " settings-fontsize-btn--active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Notification ── */}
      <div className="settings-group">
        <div className="settings-group-label">通知</div>
        <div className="settings-card">
          <div className="settings-item">
            <div className="settings-item-icon settings-item-icon--amber">
              <Bell />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">消息推送</div>
              <div className="settings-item-desc">
                {isNativePlatform
                  ? pushEnabled
                    ? "已订阅原生推送 (FCM)"
                    : "开启后接收实时推送"
                  : hasWebPush
                    ? Notification.permission === "denied"
                      ? "浏览器已禁止通知，请在设置中允许"
                      : pushEnabled
                        ? "已订阅 Web Push 通知"
                        : "开启后接收实时推送"
                    : !hasWebNotification
                      ? "当前浏览器不支持通知"
                      : "当前环境不支持 Web Push"}
              </div>
            </div>
            <div className="settings-item-action">
              {(hasWebPush || isNativePlatform) && (!hasWebPush || Notification.permission !== "denied") && (
                <Switch
                  checked={pushEnabled}
                  loading={pushLoading}
                  onChange={async (checked) => {
                    if (checked) {
                      const ok = await enablePush();
                      if (!ok) {
                        Toast.show({ content: "推送注册失败，请检查权限", position: "bottom" });
                      } else {
                        Toast.show({ content: "推送已开启", position: "bottom" });
                      }
                    } else {
                      await disablePush();
                      Toast.show({ content: "推送已关闭", position: "bottom" });
                    }
                  }}
                  style={
                    { "--checked-color": "var(--color-primary)" } as React.CSSProperties
                  }
                />
              )}
            </div>
          </div>

          <button
            onClick={handleSelfPush}
            disabled={selfPushSending || !recipientToken}
            className="settings-item settings-item--btn"
          >
            <div className="settings-item-icon settings-item-icon--green">
              <Send />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">
                {selfPushSending ? "发送中…" : "推送给自己"}
              </div>
              <div className="settings-item-desc">
                {recipientToken
                  ? "使用 Recipient Token 向当前设备发送测试推送"
                  : "需要先配置 Recipient Token"}
              </div>
            </div>
            <ChevronRight className="settings-item-chevron" />
          </button>

          <button
            onClick={openTestPushDialog}
            className="settings-item settings-item--btn"
          >
            <div className="settings-item-icon settings-item-icon--slate">
              <Send />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">推送给所有设备</div>
              <div className="settings-item-desc">
                需要 Admin Token，向所有活跃设备推送测试消息
              </div>
            </div>
            <ChevronRight className="settings-item-chevron" />
          </button>
        </div>
        <div className="settings-group-footer">
          urgent → 持续震动 · high → 震动 · default → 静默 · low/debug → 不推送
        </div>
      </div>

      {/* ── Data ── */}
      <div className="settings-group">
        <div className="settings-group-label">数据</div>
        <div className="settings-card">
          <button
            onClick={() => setClearCacheVisible(true)}
            className="settings-item settings-item--btn"
          >
            <div className="settings-item-icon settings-item-icon--slate">
              <Trash2 />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">清除本地消息缓存</div>
            </div>
            <ChevronRight className="settings-item-chevron" />
          </button>

          <button
            onClick={() => setResetVisible(true)}
            className="settings-item settings-item--btn settings-item--destructive"
          >
            <div className="settings-item-icon settings-item-icon--red">
              <AlertTriangle />
            </div>
            <div className="settings-item-body">
              <div className="settings-item-label">重置所有数据</div>
              <div className="settings-item-desc">密钥将永久丢失，无法恢复</div>
            </div>
            <ChevronRight className="settings-item-chevron" />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="settings-footer">
        v1.0.0 · E2E Encrypted ·{" "}
        <a
          href="https://github.com/HX-HouTiKu"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
      </div>

      {/* ── Declarative Dialogs (React 19 compatible) ── */}
      <Dialog
        visible={clearCacheVisible}
        content="确定清除本地消息缓存？"
        closeOnAction
        onClose={() => setClearCacheVisible(false)}
        actions={[
          [
            { key: "cancel", text: "取消", onClick: () => setClearCacheVisible(false) },
            { key: "confirm", text: "确定", bold: true, danger: true, onClick: handleClearCache },
          ],
        ]}
      />

      <Dialog
        visible={resetVisible}
        content="⚠️ 确定重置所有数据？密钥将永久丢失，无法恢复！"
        closeOnAction
        onClose={() => setResetVisible(false)}
        actions={[
          [
            { key: "cancel", text: "取消", onClick: () => setResetVisible(false) },
            {
              key: "confirm",
              text: "确定",
              bold: true,
              danger: true,
              onClick: () => {
                setResetVisible(false);
                setResetConfirmVisible(true);
              },
            },
          ],
        ]}
      />

      <Dialog
        visible={resetConfirmVisible}
        content="最后确认：此操作不可撤销。"
        closeOnAction
        onClose={() => setResetConfirmVisible(false)}
        actions={[
          [
            { key: "cancel", text: "取消", onClick: () => setResetConfirmVisible(false) },
            { key: "confirm", text: "不可逆重置", bold: true, danger: true, onClick: handleFullReset },
          ],
        ]}
      />

      {/* Test Push Dialog */}
      <Dialog
        visible={testPushDialogVisible}
        onClose={() => setTestPushDialogVisible(false)}
        content={
          <div className="test-push-dialog">
            <div className="test-push-dialog-title">发送测试推送</div>
            <p className="test-push-dialog-desc">
              输入 Admin Token 后，服务端将向所有活跃设备推送一条测试消息。
            </p>
            <input
              type="password"
              value={adminTokenInput}
              onChange={(e) => setAdminTokenInput(e.target.value)}
              placeholder="输入 Admin Token"
              className="settings-field-input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !testPushSending) handleTestPush();
              }}
            />
            <div className="test-push-dialog-hint">
              即部署时设置的 ADMIN_TOKEN，Token 会保存在本地
            </div>
          </div>
        }
        actions={[
          [
            { key: "cancel", text: "取消", onClick: () => setTestPushDialogVisible(false) },
            {
              key: "send",
              text: testPushSending ? "发送中…" : "发送",
              bold: true,
              onClick: handleTestPush,
            },
          ],
        ]}
      />
    </div>
  );
}
