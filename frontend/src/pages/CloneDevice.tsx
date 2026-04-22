/**
 * Device Clone page — transfer account between devices.
 *
 * Two modes:
 *   /clone          → choose share or import
 *   /clone?code=XXX → auto-enter import mode with pre-filled code
 *
 * Share flow: export keyData → upload to /api/clone/offer → show 8-char code + QR
 * Import flow: scan QR / enter code → /api/clone/claim → decrypt with password → save
 */

import { useState, useEffect, useRef, useCallback } from "react";
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
  ScanLine,
  X,
  Camera,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { cloneOffer, cloneClaim, cloneCancel } from "@/lib/api";
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
                <div className="settings-item-desc">生成配对码 + 二维码，让新设备扫码导入</div>
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
              <div className="settings-item-desc">扫码或输入配对码，从旧设备克隆账号</div>
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
  const [qrDataUrl, setQrDataUrl] = useState("");
  const codeRef = useRef("");

  // Cancel the offer when leaving the share page
  useEffect(() => {
    return () => {
      if (codeRef.current && recipientToken) {
        cloneCancel(recipientToken, codeRef.current).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      codeRef.current = result.code;
      setExpiresIn(result.expires_in_seconds);
      // Generate QR code URL encoding the clone deep link
      const qrContent = `houtiku://clone?code=${result.code}`;
      setQrDataUrl(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrContent)}&bgcolor=FFFFFF&color=000000&margin=8`);
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
          生成配对码和二维码，在新设备上扫码或输入即可克隆账号。<br />
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
      <p className="setup-step-desc">在新设备上扫描二维码或输入配对码</p>

      {/* QR Code */}
      {qrDataUrl && (
        <div style={{
          display: "flex",
          justifyContent: "center",
          margin: "1.5rem 0 1rem",
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 12,
            padding: 12,
            display: "inline-block",
          }}>
            <img
              src={qrDataUrl}
              alt="配对码二维码"
              style={{ width: 180, height: 180, display: "block" }}
            />
          </div>
        </div>
      )}

      <div style={{
        fontSize: "2.5rem",
        fontWeight: 800,
        letterSpacing: "0.3em",
        fontFamily: "ui-monospace, monospace",
        color: "var(--color-foreground)",
        margin: "1rem 0",
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

// ─── QR Scanner ──────────────────────────────────────────

function QrScanner({ onScan, onClose }: { onScan: (code: string) => void; onClose: () => void }) {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrRef = useRef<any>(null);
  const [error, setError] = useState("");

  const stopScanner = useCallback(async () => {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop();
      } catch { /* ignore */ }
      try {
        html5QrRef.current.clear();
      } catch { /* ignore */ }
      html5QrRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled || !scannerRef.current) return;

        const scanner = new Html5Qrcode("qr-scanner-viewport");
        html5QrRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          (decodedText) => {
            // Parse houtiku://clone?code=XXXXXXXX or just an 8-char code
            let code = "";
            try {
              const url = new URL(decodedText);
              code = url.searchParams.get("code") ?? "";
            } catch {
              // Maybe it's just the raw code
              code = decodedText.replace(/\s/g, "").toUpperCase();
            }

            if (code && /^[A-Z0-9]{8}$/.test(code)) {
              stopScanner();
              onScan(code);
            }
          },
          () => { /* ignore scan failure frames */ }
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message.includes("NotAllowed")
                ? "摄像头权限被拒绝，请在浏览器设置中允许摄像头访问"
                : err.message
              : "无法启动摄像头"
          );
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [onScan, stopScanner]);

  return (
    <div className="qr-scanner-container">
      <div className="qr-scanner-header">
        <button
          onClick={() => { stopScanner(); onClose(); }}
          className="msg-detail-action-btn"
          style={{ padding: "0.25rem" }}
        >
          <X style={{ width: 20, height: 20 }} />
        </button>
        <h2>扫描配对码</h2>
      </div>

      <div className="qr-scanner-viewport">
        {error ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <Camera style={{ width: 48, height: 48, margin: "0 auto 1rem", color: "var(--color-destructive)" }} />
            <p style={{ color: "var(--color-destructive)", marginBottom: "1rem" }}>{error}</p>
            <button
              onClick={() => { stopScanner(); onClose(); }}
              className="setup-btn setup-btn--primary"
            >
              返回手动输入
            </button>
          </div>
        ) : (
          <div id="qr-scanner-viewport" style={{ width: "100%", height: "100%" }} ref={scannerRef} />
        )}
      </div>

      {!error && (
        <div className="qr-scanner-hint">
          将旧设备上的配对二维码放入取景框中
        </div>
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
  const [scanning, setScanning] = useState(false);

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

  const handleScanResult = (scannedCode: string) => {
    setScanning(false);
    setCode(scannedCode);
    claimBundle(scannedCode);
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

  if (scanning) {
    return <QrScanner onScan={handleScanResult} onClose={() => setScanning(false)} />;
  }

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
          <Loader2 style={{ width: 32, height: 32, margin: "1rem auto", animation: "splash-spin 1s linear infinite", color: "var(--color-primary)" }} />
        )}
      </div>
    );
  }

  // step === "code"
  return (
    <div style={{ textAlign: "center" }}>
      <Download style={{ width: 48, height: 48, margin: "0 auto 1rem", color: "var(--color-primary)" }} />
      <h2 className="setup-step-title">导入账号</h2>
      <p className="setup-step-desc" style={{ marginBottom: "1.5rem" }}>
        扫描旧设备上的二维码，或手动输入 8 位配对码
      </p>

      {/* Scan QR button */}
      <button
        onClick={() => setScanning(true)}
        className="setup-btn setup-btn--primary"
        style={{
          marginBottom: "1.5rem",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <ScanLine style={{ width: 20, height: 20 }} />
        扫一扫
      </button>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        margin: "0 0 1.5rem",
        color: "var(--color-muted-foreground)",
        fontSize: "0.8125rem",
      }}>
        <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
        或手动输入
        <div style={{ flex: 1, height: 1, background: "var(--color-border)" }} />
      </div>

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


