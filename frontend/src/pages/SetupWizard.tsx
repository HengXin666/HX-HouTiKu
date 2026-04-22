import { useState } from "react";
import {
  Key,
  Lock,
  Copy,
  QrCode,
  Bell,
  Check,
  ArrowRight,
  Loader2,
  Shield,
  Smartphone,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { copyToClipboard, cn } from "@/lib/utils";
import { requestNotificationPermission } from "@/lib/push";

type Step = "welcome" | "password" | "export" | "push" | "done";

export function SetupWizard() {
  const [step, setStep] = useState<Step>("welcome");
  const [deviceName, setDeviceName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateKeys = useAuthStore((s) => s.generateKeys);

  const passwordStrength = getPasswordStrength(password);

  const handleGenerateKeys = async () => {
    if (password.length < 8) {
      setError("密码至少 8 位");
      return;
    }
    if (password !== confirmPwd) {
      setError("两次密码不一致");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const pk = await generateKeys(password, deviceName || "default");
      setPublicKey(pk);
      setStep("export");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(publicKey);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePush = async () => {
    await requestNotificationPermission();
    setStep("done");
  };

  const currentIndex = stepIndex(step);

  return (
    <div className="setup-wizard-page">
      <div className="setup-wizard-inner">
        {/* Progress bar */}
        <div className="setup-progress">
          {(["welcome", "password", "export", "push"] as const).map((s, i) => (
            <div key={s} className="setup-progress-segment">
              <div
                className={cn(
                  "setup-progress-bar",
                  currentIndex >= i && "setup-progress-bar--active",
                  currentIndex > i && "setup-progress-bar--done"
                )}
              />
              {i < 3 && <div className="setup-progress-gap" />}
            </div>
          ))}
        </div>

        {/* Step: Welcome */}
        {step === "welcome" && (
          <div className="setup-step setup-step--center">
            <div className="setup-icon-ring setup-icon-ring--large">
              <Shield className="setup-icon--lg" />
            </div>

            <h1 className="setup-title">欢迎使用 HX-HouTiKu</h1>
            <p className="setup-subtitle">
              端到端加密的统一消息推送平台
              <br />
              <span className="setup-subtitle-em">你的消息，只有你能看</span>
            </p>

            <div className="setup-card">
              <label className="setup-field-label">
                <Smartphone className="setup-field-label-icon" />
                设备名称
                <span className="setup-field-optional">（可选）</span>
              </label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="例如 my-phone、work-laptop"
                className="setup-input"
              />
              <p className="setup-field-hint">
                为这台设备取个名字，方便你以后在多设备间区分。
              </p>
            </div>

            <button
              onClick={() => setStep("password")}
              className="setup-btn setup-btn--primary"
            >
              开始设置
              <ArrowRight className="setup-btn-icon" />
            </button>

            <button
              onClick={() => window.location.href = "/clone"}
              className="setup-btn setup-btn--ghost"
              style={{ marginTop: "0.5rem" }}
            >
              从其他设备导入
            </button>
          </div>
        )}

        {/* Step: Password */}
        {step === "password" && (
          <div className="setup-step">
            <div className="setup-step-header">
              <div className="setup-icon-ring">
                <Lock className="setup-icon" />
              </div>
              <h2 className="setup-step-title">创建主密码</h2>
              <p className="setup-step-desc">
                这是你的 App 解锁密码，请牢记
              </p>
            </div>

            {/* Tip */}
            <div className="setup-tip">
              <span className="setup-tip-emoji">🔐</span>
              <p className="setup-tip-text">
                主密码用于保护你的加密私钥。每次打开 App 时需要输入（也可以选择记住密码跳过）。
                <strong>请设一个你记得住的密码</strong>，比如常用的个人密码。
              </p>
            </div>

            <div className="setup-card">
              <label className="setup-field-label">主密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="至少 8 个字符"
                autoFocus
                enterKeyHint="next"
                className="setup-input"
              />

              {/* Strength bar */}
              {password.length > 0 && (
                <div className="setup-strength">
                  <div className="setup-strength-bars">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={cn(
                          "setup-strength-bar",
                          passwordStrength >= level
                            ? level <= 1
                              ? "setup-strength-bar--weak"
                              : level <= 2
                                ? "setup-strength-bar--fair"
                                : "setup-strength-bar--strong"
                            : "setup-strength-bar--empty"
                        )}
                      />
                    ))}
                  </div>
                  <span className="setup-strength-label">
                    {passwordStrength <= 1
                      ? "弱"
                      : passwordStrength <= 2
                        ? "一般"
                        : passwordStrength <= 3
                          ? "强"
                          : "非常强"}
                  </span>
                </div>
              )}

              <div className="setup-field-divider" />

              <label className="setup-field-label">确认密码</label>
              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => {
                  setConfirmPwd(e.target.value);
                  setError(null);
                }}
                placeholder="再输入一次"
                enterKeyHint="done"
                className="setup-input"
              />
            </div>

            {error && (
              <p className="setup-error">{error}</p>
            )}

            <button
              onClick={handleGenerateKeys}
              disabled={loading || !password || !confirmPwd}
              className="setup-btn setup-btn--primary"
            >
              {loading ? (
                <>
                  <Loader2 className="setup-btn-icon animate-spin" />
                  生成密钥中…
                </>
              ) : (
                <>
                  <Key className="setup-btn-icon" />
                  生成密钥对
                </>
              )}
            </button>
          </div>
        )}

        {/* Step: Export public key */}
        {step === "export" && (
          <div className="setup-step">
            <div className="setup-step-header">
              <div className="setup-icon-ring setup-icon-ring--success">
                <Check className="setup-icon" />
              </div>
              <h2 className="setup-step-title">密钥已生成 🎉</h2>
              <p className="setup-step-desc">
                将下面的公钥配置到推送 SDK 中
              </p>
            </div>

            <div className="setup-card">
              <label className="setup-field-label">你的公钥</label>
              <div className="setup-pubkey">
                {publicKey}
              </div>
            </div>

            <div className="setup-actions-row">
              <button
                onClick={handleCopy}
                className="setup-btn setup-btn--outline setup-btn--flex"
              >
                {copied ? (
                  <>
                    <Check className="setup-btn-icon setup-btn-icon--success" />
                    已复制
                  </>
                ) : (
                  <>
                    <Copy className="setup-btn-icon" />
                    复制公钥
                  </>
                )}
              </button>
              <button
                className="setup-btn setup-btn--outline setup-btn--icon-only"
                title="生成二维码（即将支持）"
                disabled
              >
                <QrCode className="setup-btn-icon" />
              </button>
            </div>

            <button
              onClick={() => setStep("push")}
              className="setup-btn setup-btn--primary"
            >
              下一步
              <ArrowRight className="setup-btn-icon" />
            </button>
          </div>
        )}

        {/* Step: Push permission */}
        {step === "push" && (
          <div className="setup-step setup-step--center">
            <div className="setup-icon-ring setup-icon-ring--large">
              <Bell className="setup-icon--lg" />
            </div>
            <h2 className="setup-title">开启推送通知</h2>
            <p className="setup-subtitle">
              收到紧急消息时，即使 App 未打开
              <br />
              也能第一时间通知你
            </p>

            <div className="setup-btn-group">
              <button
                onClick={handlePush}
                className="setup-btn setup-btn--primary"
              >
                允许通知
              </button>
              <button
                onClick={() => setStep("done")}
                className="setup-btn setup-btn--ghost"
              >
                稍后设置
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="setup-step setup-step--center">
            <div className="setup-done-emoji">🎉</div>
            <h2 className="setup-title">设置完成</h2>
            <p className="setup-subtitle">
              现在配置推送 SDK，开始接收消息吧
            </p>
            <button
              onClick={() => window.location.replace("/")}
              className="setup-btn setup-btn--primary"
            >
              进入应用
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function stepIndex(step: Step): number {
  return ["welcome", "password", "export", "push", "done"].indexOf(step);
}

function getPasswordStrength(pwd: string): number {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}
