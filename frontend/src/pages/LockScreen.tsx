import { useState, useEffect, useRef } from "react";
import { Dialog } from "antd-mobile";
import { Shield, Eye, EyeOff, Loader2, RotateCcw } from "lucide-react";
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

  useEffect(() => {
    const handleResize = () => {
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

  const handleReset = async () => {
    const result = await Dialog.confirm({
      content:
        "⚠️ 确定要重置所有数据吗？\n\n你的加密密钥将永久丢失，之前的消息将无法解密。\n\n重置后需要重新设置密码和密钥。",
    });
    if (result) {
      reset();
    }
  };

  return (
    <div className="setup-wizard-page">
      <div className="setup-wizard-inner" ref={containerRef}>
        {/* Logo */}
        <div className="setup-step setup-step--center">
          <div className="setup-icon-ring setup-icon-ring--large">
            <Shield className="setup-icon--lg" />
          </div>

          <h1 className="setup-title">HX-HouTiKu</h1>
          <p className="setup-subtitle">输入你的主密码来解锁消息</p>
        </div>

        {/* Hint */}
        <div className="setup-tip">
          <span className="setup-tip-emoji">💡</span>
          <p className="setup-tip-text">
            主密码是你<strong>首次设置 App 时自己创建的密码</strong>，
            用于保护你的加密私钥。如果忘记了，只能重置设备。
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleUnlock}>
          <div className="setup-card">
            <label className="setup-field-label">主密码</label>
            <div className="setup-input-wrapper">
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
                className="setup-input setup-input--has-suffix"
              />
              <button
                type="button"
                onClick={() => setShowPwd(!showPwd)}
                className="setup-input-suffix"
                tabIndex={-1}
              >
                {showPwd ? (
                  <EyeOff className="setup-input-suffix-icon" />
                ) : (
                  <Eye className="setup-input-suffix-icon" />
                )}
              </button>
            </div>

            {/* Remember */}
            <label className="setup-checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="setup-checkbox-input"
              />
              <span className="setup-checkbox-label">
                记住密码，下次自动解锁
              </span>
            </label>
          </div>

          {error && <p className="setup-error">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="setup-btn setup-btn--primary"
          >
            {loading ? (
              <Loader2 className="setup-btn-icon animate-spin" />
            ) : (
              "解 锁"
            )}
          </button>
        </form>

        {/* Reset */}
        <button onClick={handleReset} className="setup-reset-link">
          <RotateCcw className="setup-reset-icon" />
          忘记密码？重置设备重新开始
        </button>
      </div>
    </div>
  );
}
