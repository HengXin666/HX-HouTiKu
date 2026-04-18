import { useState } from "react";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

export function LockScreen() {
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const unlock = useAuthStore((s) => s.unlock);
  const reset = useAuthStore((s) => s.reset);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await unlock(password);
    } catch {
      setError("密码错误，请重试");
      setPassword("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Unified Push</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            输入主密码解锁消息
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="主密码"
              autoFocus
              autoComplete="current-password"
              disabled={loading}
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
        <div className="mt-8 text-center">
          <button
            onClick={() => {
              if (window.confirm("确定要重置所有数据吗？密钥将永久丢失。")) {
                reset();
              }
            }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
          >
            忘记密码？重置设备
          </button>
        </div>
      </div>
    </div>
  );
}
