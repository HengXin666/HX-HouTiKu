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

  return (
    <div className="lock-screen-container flex items-center justify-center bg-background px-6 py-8">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {(["welcome", "password", "export", "push"] as const).map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-1.5 w-8 rounded-full transition-colors",
                stepIndex(step) >= i ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Step: Welcome */}
        {step === "welcome" && (
          <div className="text-center animate-[fade-in_0.3s_ease-out]">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
              <Shield className="h-10 w-10 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">
              欢迎使用 HX-HouTiKu
            </h1>
            <p className="text-muted-foreground mb-8 text-sm leading-relaxed max-w-xs mx-auto">
              端到端加密的统一消息推送平台。你的消息，只有你能看。
            </p>

            <div className="space-y-4">
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="设备名称（可选，如 my-phone）"
                className="w-full rounded-xl border border-border bg-input px-4 py-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={() => setStep("password")}
                className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                开始设置
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Password */}
        {step === "password" && (
          <div className="animate-[fade-in_0.3s_ease-out]">
            <div className="text-center mb-6">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Lock className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-xl font-bold">创建主密码</h2>
              <p className="text-sm text-muted-foreground mt-1">
                这是你的 App 解锁密码，请牢记
              </p>
            </div>

            {/* Explanation */}
            <div className="mb-5 rounded-xl bg-muted/50 border border-border px-4 py-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                🔐 主密码用于保护你的加密私钥。每次打开 App 时需要输入（也可以选择记住密码跳过）。
                <strong className="text-foreground">请设一个你记得住的密码</strong>，比如常用的个人密码。
              </p>
            </div>

            <div className="space-y-4">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                placeholder="设置你的主密码（至少 8 位）"
                autoFocus
                enterKeyHint="next"
                className="w-full rounded-xl border border-border bg-input px-4 py-3.5 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />

              {/* Strength bar */}
              {password.length > 0 && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={cn(
                          "h-1 flex-1 rounded-full transition-colors",
                          passwordStrength >= level
                            ? level <= 1
                              ? "bg-destructive"
                              : level <= 2
                                ? "bg-priority-high"
                                : "bg-priority-low"
                            : "bg-muted"
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {passwordStrength <= 1
                      ? "弱"
                      : passwordStrength <= 2
                        ? "一般"
                        : passwordStrength <= 3
                          ? "强"
                          : "非常强"}
                  </p>
                </div>
              )}

              <input
                type="password"
                value={confirmPwd}
                onChange={(e) => {
                  setConfirmPwd(e.target.value);
                  setError(null);
                }}
                placeholder="再输入一次确认密码"
                enterKeyHint="done"
                className="w-full rounded-xl border border-border bg-input px-4 py-3.5 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <button
                onClick={handleGenerateKeys}
                disabled={loading || !password || !confirmPwd}
                className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成密钥中...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4" />
                    生成密钥对
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step: Export public key */}
        {step === "export" && (
          <div className="animate-[fade-in_0.3s_ease-out]">
            <div className="text-center mb-8">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-priority-low/10">
                <Check className="h-7 w-7 text-priority-low" />
              </div>
              <h2 className="text-xl font-bold">密钥已生成</h2>
              <p className="text-sm text-muted-foreground mt-1">
                将公钥配置到推送 SDK 中
              </p>
            </div>

            <div className="space-y-4">
              {/* Public key display */}
              <div className="rounded-xl border border-border bg-muted p-4">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  你的公钥
                </p>
                <p className="break-all font-mono text-xs text-foreground leading-relaxed">
                  {publicKey}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-priority-low" />
                      已复制
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      复制公钥
                    </>
                  )}
                </button>
                <button
                  className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted transition-colors flex items-center justify-center gap-2"
                  title="生成二维码（即将支持）"
                  disabled
                >
                  <QrCode className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={() => setStep("push")}
                className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                下一步
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step: Push permission */}
        {step === "push" && (
          <div className="text-center animate-[fade-in_0.3s_ease-out]">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Bell className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold mb-2">开启推送通知</h2>
            <p className="text-sm text-muted-foreground mb-8 max-w-xs mx-auto">
              收到紧急消息时，即使 App 未打开也能第一时间通知你
            </p>

            <div className="space-y-3">
              <button
                onClick={handlePush}
                className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]"
              >
                允许通知
              </button>
              <button
                onClick={() => setStep("done")}
                className="w-full rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                稍后设置
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="text-center animate-[fade-in_0.3s_ease-out]">
            <div className="text-6xl mb-6">🎉</div>
            <h2 className="text-2xl font-bold mb-2">设置完成</h2>
            <p className="text-sm text-muted-foreground mb-8">
              现在配置推送 SDK，开始接收消息吧
            </p>
            <button
              onClick={() => window.location.replace("/")}
              className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]"
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
