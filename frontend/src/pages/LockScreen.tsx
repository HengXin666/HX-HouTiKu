import { useState, useEffect, useRef } from "react";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

export function LockScreen() {
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const unlock = useAuthStore((s) => s.unlock);
  const reset = useAuthStore((s) => s.reset);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fix mobile keyboard: scroll form into view when focused
  useEffect(() => {
    const handleResize = () => {
      // On mobile keyboard open, scroll to ensure form is visible
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    };

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", handleResize);
      return () => vv.removeEventListener("resize", handleResize);
    }
  }, []);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await unlock(password, remember);
    } catch {
      setError("密码错误，请重试");
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lock-screen-container flex items-center justify-center bg-background px-6 py-8">
      <div className="w-full max-w-sm" ref={containerRef}>
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">HX-HouTiKu</h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            输入你的主密码来解锁消息
          </p>
        </div>

        {/* Help text */}
        <div className="mb-5 rounded-xl bg-muted/50 border border-border px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            💡 主密码是你<strong className="text-foreground">首次设置 App 时自己创建的密码</strong>，
            用于保护你的加密私钥。如果忘记了，只能重置设备（会丢失已有密钥）。
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="输入你设置过的主密码"
              autoFocus
              autoComplete="current-password"
              disabled={loading}
              enterKeyHint="go"
              className="w-full rounded-xl border border-border bg-input px-4 py-3.5 pr-12 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-shadow"
            />
            <button
              type="button"
              onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPwd ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Remember password toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none px-1">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="text-sm text-muted-foreground">
              记住密码，下次自动解锁
            </span>
          </label>

          {error && (
            <p className="text-sm text-destructive animate-[fade-in_0.2s_ease-out]">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full rounded-xl bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {loading ? (
              <Loader2 className="mx-auto h-5 w-5 animate-spin" />
            ) : (
              "解 锁"
            )}
          </button>
        </form>

        {/* Reset link */}
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              if (window.confirm("⚠️ 确定要重置所有数据吗？\n\n你的加密密钥将永久丢失，之前的消息将无法解密。\n\n重置后需要重新设置密码和密钥。")) {
                reset();
              }
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          >
            忘记密码？重置设备重新开始
          </button>
        </div>
      </div>
    </div>
  );
}
