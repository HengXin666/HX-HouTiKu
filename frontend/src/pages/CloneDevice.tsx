/**
 * Device Clone page — transfer account between devices.
 *
 * Two modes:
 *   /clone          → choose share or import
 *   /clone?code=XXX → auto-enter import mode with pre-filled code
 *
 * Share flow: export keyData → upload to /api/clone/offer → show 6-digit code
 * Import flow: enter code → /api/clone/claim → decrypt with password → save
 */

import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Smartphone,
  Upload,
  Download,
  Copy,
  Check,
  ArrowLeft,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { cloneOffer, cloneClaim } from "@/lib/api";
import { Toast } from "@/components/ui/Toast";
import { copyToClipboard, cn } from "@/lib/utils";

type Mode = "choose" | "share" | "import";

export function CloneDevice() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preCode = searchParams.get("code");

  const [mode, setMode] = useState<Mode>(preCode ? "import" : "choose");

  return (
    <div className="settings-page" style={{ maxWidth: 440 }}>
      <button
        onClick={() => mode === "choose" ? navigate(-1) : setMode("choose")}
        className="msg-detail-action-btn"
        style={{ marginBottom: "1rem" }}
      >
        <ArrowLeft style={{ width: 16, height: 16 }} />
        返回
      </button>

      {mode === "choose" && <ChooseMode onSelect={setMode} />}
      {mode === "share" && <ShareMode />}
      {mode === "import" && <ImportMode preCode={preCode ?? ""} />}
    </div>
  );
}

// ─── Choose ──────────────────────────────────────────────

function ChooseMode({ onSelect }: { onSelect: (m: Mode) => void }) {
  const hasKeys = useAuthStore((s) => s.status === "unlocked");

  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <Smartphone style={{ width: 48, height: 48, margin: "0 auto 0.75rem", color: "var(--color-primary)" }} />
        <h2 className="setup-step-title">设备克隆</h2>
        <p className="setup-step-desc">在多个设备间同步你的账号和密钥</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {hasKeys && (
          <button
            onClick={() => onSelect("share")}
            className="setup-card"
            style={{ cursor: "pointer", textAlign: "left", border: "1.5px solid var(--color-border)" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div className="settings-item-icon settings-item-icon--indigo">
                <Upload />
              </div>
              <div>
                <div className="settings-item-label">分享到其他设备</div>
                <div className="settings-item-desc">生成配对码，让新设备导入你的账号</div>
              </div>
            </div>
          </button>
        )}

        <button
          onClick={() => onSelect("import")}
          className="setup-card"
          style={{ cursor: "pointer", textAlign: "left", border: "1.5px solid var(--color-border)" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div className="settings-item-icon settings-item-icon--green">
              <Download />
            </div>
            <div>
              <div className="settings-item-label">从其他设备导入</div>
              <div className="settings-item-desc">输入配对码，从旧设备克隆账号</div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Share Mode ──────────────────────────────────────────

function ShareMode() {
  const exportBundle = useAuthStore((s) => s.exportBundle);
  const recipientToken = useAuthStore((s) => s.recipientToken);
  const [code, setCode] = useState("");
  const [expiresIn, setExpiresIn] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    if (!recipientToken) {
      setError("请先配置 Recipient Token");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const bundle = await exportBundle();
      if (!bundle) {
        setError("没有可导出的密钥数据");
        return;
      }

      const result = await cloneOffer(recipientToken, bundle);
      setCode(result.code);
      setExpiresIn(result.expires_in_seconds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成配对码失败");
    } finally {
      setLoading(false);
    }
  };

  // Countdown
  useEffect(() => {
    if (expiresIn <= 0) return;
    const timer = setInterval(() => {
      setExpiresIn((v) => {
        if (v <= 1) { clearInterval(timer); return 0; }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresIn > 0]);

  const handleCopy = async () => {
    const ok = await copyToClipboard(code);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };

  if (!code) {
    return (
      <div style={{ textAlign: "center" }}>
        <Upload style={{ width: 48, height: 48, margin: "0 auto 1rem", color: "var(--color-primary)" }} />
        <h2 className="setup-step-title">分享账号</h2>
        <p className="setup-step-desc" style={{ marginBottom: "1.5rem" }}>
          生成一个 8 位配对码，在新设备上输入即可克隆账号。<br />
          配对码 5 分钟有效，仅可使用一次。
        </p>
        {error && <p style={{ color: "var(--color-destructive)", fontSize: "0.875rem", marginBottom: "1rem" }}>{error}</p>}
        <button
          onClick={generate}
          disabled={loading}
          className="setup-btn setup-btn--primary"
        >
          {loading ? "生成中..." : "生成配对码"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center" }}>
      <ShieldCheck style={{ width: 48, height: 48, margin: "0 auto 1rem", color: "var(--color-priority-low)" }} />
      <h2 className="setup-step-title">配对码</h2>
      <p className="setup-step-desc">在新设备上输入以下配对码</p>

      <div style={{
        fontSize: "3rem",
        fontWeight: 800,
        letterSpacing: "0.3em",
        fontFamily: "ui-monospace, monospace",
        color: "var(--color-foreground)",
        margin: "1.5rem 0",
        userSelect: "all",
      }}>
        {code.slice(0, 4)} {code.slice(4)}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginBottom: "1rem" }}>
        <button onClick={handleCopy} className="msg-detail-action-btn">
          {copied ? <Check style={{ width: 16, height: 16 }} /> : <Copy style={{ width: 16, height: 16 }} />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>

      {expiresIn > 0 ? (
        <p style={{ fontSize: "0.875rem", color: "var(--color-muted-foreground)" }}>
          {Math.floor(expiresIn / 60)}:{String(expiresIn % 60).padStart(2, "0")} 后过期 · 仅可使用一次
        </p>
      ) : (
        <p style={{ fontSize: "0.875rem", color: "var(--color-destructive)" }}>
          配对码已过期，请重新生成
        </p>
      )}
    </div>
  );
}

// ─── Import Mode ──────────────────────────────────────────

function ImportMode({ preCode }: { preCode: string }) {
  const importBundle = useAuthStore((s) => s.importBundle);
  const navigate = useNavigate();

  const [code, setCode] = useState(preCode);
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"code" | "password" | "done">(preCode ? "password" : "code");
  const [bundle, setBundle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // If we have a pre-filled code, auto-claim
  useEffect(() => {
    if (preCode && step === "password") {
      claimBundle(preCode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claimBundle = async (c: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await cloneClaim(c);
      setBundle(result.encrypted_bundle);
      setStep("password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "配对码无效或已过期");
      setStep("code");
    } finally {
      setLoading(false);
    }
  };

  const handleCodeSubmit = () => {
    const c = code.replace(/\s/g, "").toUpperCase();
    if (c.length !== 8 || !/^[A-Z0-9]+$/.test(c)) {
      setError("请输入 8 位配对码（字母+数字）");
      return;
    }
    claimBundle(c);
  };

  const handlePasswordSubmit = async () => {
    if (!password) {
      setError("请输入主密码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await importBundle(bundle, password);
      setStep("done");
      Toast.show({ content: "账号克隆成功！", position: "bottom" });
    } catch {
      setError("密码错误，无法解密密钥");
    } finally {
      setLoading(false);
    }
  };

  if (step === "done") {
    return (
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>🎉</div>
        <h2 className="setup-step-title">克隆成功</h2>
        <p className="setup-step-desc" style={{ marginBottom: "1.5rem" }}>
          账号已成功导入到此设备
        </p>
        <button
          onClick={() => { window.location.replace("/"); }}
          className="setup-btn setup-btn--primary"
        >
          进入应用
        </button>
      </div>
    );
  }

  if (step === "password") {
    return (
      <div style={{ textAlign: "center" }}>
        <Download style={{ width: 48, height: 48, margin: "0 auto 1rem", color: "var(--color-priority-low)" }} />
        <h2 className="setup-step-title">输入主密码</h2>
        <p className="setup-step-desc" style={{ marginBottom: "1.5rem" }}>
          {bundle ? "密钥包已获取，输入你的主密码解密" : "正在获取密钥包..."}
        </p>

        {bundle && (
          <>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="主密码（与旧设备相同）"
              className="setup-input"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handlePasswordSubmit(); }}
            />
            {error && <p style={{ color: "var(--color-destructive)", fontSize: "0.875rem", marginTop: "0.5rem" }}>{error}</p>}
            <button
              onClick={handlePasswordSubmit}
              disabled={loading}
              className="setup-btn setup-btn--primary"
              style={{ marginTop: "1rem" }}
            >
              {loading ? "解密中..." : "导入账号"}
            </button>
          </>
        )}
        {!bundle && loading && (
          <Loader2 style={{ width: 32, height: 32, margin: "1rem auto", animation: "spin 1s linear infinite", color: "var(--color-primary)" }} />
        )}
      </div>
    );
  }

  // step === "code"
  return (
    <div style={{ textAlign: "center" }}>
      <Download style={{ width: 48, height: 48, margin: "0 auto 1rem", color: "var(--color-primary)" }} />
      <h2 className="setup-step-title">输入配对码</h2>
      <p className="setup-step-desc" style={{ marginBottom: "1.5rem" }}>
        在旧设备上点击「分享到其他设备」获取 8 位配对码
      </p>

      <input
        type="text"
        inputMode="text"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 8))}
        placeholder="XXXX XXXX"
        className="setup-input"
        style={{
          textAlign: "center",
          fontSize: "2rem",
          fontWeight: 800,
          letterSpacing: "0.2em",
          fontFamily: "ui-monospace, monospace",
        }}
        autoFocus
        maxLength={8}
        onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleCodeSubmit(); }}
      />
      {error && <p style={{ color: "var(--color-destructive)", fontSize: "0.875rem", marginTop: "0.5rem" }}>{error}</p>}
      <button
        onClick={handleCodeSubmit}
        disabled={loading || code.length !== 8}
        className="setup-btn setup-btn--primary"
        style={{ marginTop: "1rem" }}
      >
        {loading ? "验证中..." : "下一步"}
      </button>
    </div>
  );
}
