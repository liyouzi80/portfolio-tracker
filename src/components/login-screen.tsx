"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fingerprint, KeyRound, Loader2 } from "lucide-react";

type Mode = "passkey" | "password" | "setup";

const PRF_SALT = "portfolio-tracker-prf-salt-v1";

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return bufToB64(hash);
}

async function getPasskeyPRF(): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      userVerification: "required",
      timeout: 60000,
      extensions: {
        prf: { eval: { first: new TextEncoder().encode(PRF_SALT) } },
      },
    },
  });
  const ext = (assertion as any)?.getClientExtensionResults?.() as any;
  const prfOutput = ext?.prf?.results?.first;
  if (!prfOutput) throw new Error("PRF not available");
  return sha256(bufToB64(prfOutput));
}

export function LoginScreen({ onUnlock }: { onUnlock: () => void }) {
  const [bgUrl, setBgUrl] = useState("");
  const [bgLoaded, setBgLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("password");
  const [needsSetup, setNeedsSetup] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load Bing wallpaper
  useEffect(() => {
    let cancelled = false;
    fetch("/api/bg")
      .then((r) => r.json() as Promise<{ url: string }>)
      .then((d) => {
        if (cancelled || !d.url) return;
        const img = new Image();
        img.onload = () => { if (!cancelled) { setBgUrl(d.url); setBgLoaded(true); } };
        img.src = d.url;
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Check auth status
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ authenticated: boolean; needsSetup: boolean; hasPasskey?: boolean }>;
      })
      .then((d) => {
        if (d.authenticated) { onUnlock(); return; }
        setNeedsSetup(d.needsSetup);
        const pk = !!d.hasPasskey && !!window.PublicKeyCredential;
        setHasPasskey(pk);
        if (pk) setMode("passkey");
      })
      .catch(() => {
        setError("服务器错误，请刷新重试");
      });
  }, [onUnlock]);

  const doSetup = useCallback(async () => {
    if (password !== confirm || password.length < 4) {
      setError("密码至少4位且两次输入一致"); return;
    }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup-password", password }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (d.success) onUnlock();
      else setError(d.error || "设置失败");
    } catch { setError("网络错误"); }
    setLoading(false);
  }, [password, confirm, onUnlock]);

  const doPasswordLogin = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login-password", password }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (d.success) onUnlock();
      else setError(d.error || "密码错误");
    } catch { setError("网络错误"); }
    setLoading(false);
  }, [password, onUnlock]);

  const doPasskeyLogin = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const prfHash = await getPasskeyPRF();
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "passkey-login", prfHash }),
      });
      const d = await res.json() as { success?: boolean; error?: string };
      if (d.success) onUnlock();
      else setError(d.error || "Passkey 验证失败");
    } catch (e: any) {
      setError(e.message || "Passkey 不可用");
    }
    setLoading(false);
  }, [onUnlock]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Bing Background */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
        style={{ backgroundImage: bgUrl ? `url(${bgUrl})` : 'none', opacity: bgLoaded ? 1 : 0 }}
      />
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />

      {/* Login Card */}
      <div className="relative w-full max-w-[380px] mx-4">
        <div className="rounded-[32px] p-10 bg-black/30 backdrop-blur-[40px] saturate-[180%] border border-white/[0.08] shadow-[0_32px_80px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)]">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <svg className="h-12 w-12" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="url(#login-logo)" />
              <path d="M10 22V12l6 8 6-8v10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <defs>
                <linearGradient id="login-logo" x1="0" y1="0" x2="32" y2="32">
                  <stop stopColor="#34d399" /><stop offset="1" stopColor="#2dd4bf" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <h2 className="text-xl font-semibold text-center text-white mb-1 tracking-tight">
            {needsSetup ? "初始设置" : "Portfolio"}
          </h2>
          <p className="text-sm text-center text-zinc-400 mb-6">
            {needsSetup ? "设置主密码以保护数据" : "解锁以查看持仓"}
          </p>

          {/* Mode Tabs — only shown when passkey is already registered */}
          {!needsSetup && hasPasskey && (
            <div className="flex rounded-xl bg-white/[0.06] p-1 mb-6 border border-white/[0.06]">
              <button
                className={`flex-1 py-2 text-sm rounded-lg transition-colors ${mode === "passkey" ? "bg-white/10 text-white font-semibold shadow-sm" : "text-zinc-400"}`}
                onClick={() => setMode("passkey")}
                role="tab"
                aria-selected={mode === "passkey"}
              >
                <Fingerprint className="h-4 w-4 inline mr-1.5" />
                Passkey
              </button>
              <button
                className={`flex-1 py-2 text-sm rounded-lg transition-colors ${mode === "password" ? "bg-white/10 text-white font-semibold shadow-sm" : "text-zinc-400"}`}
                onClick={() => setMode("password")}
                role="tab"
                aria-selected={mode === "password"}
              >
                <KeyRound className="h-4 w-4 inline mr-1.5" />
                密码
              </button>
            </div>
          )}

          {/* Passkey unlock */}
          {mode === "passkey" && !needsSetup && hasPasskey && (
            <div className="space-y-4">
              <Button
                className="w-full h-12 text-base bg-white/[0.08] hover:bg-white/[0.12] border border-white/[0.1] text-white"
                onClick={doPasskeyLogin}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5 mr-2" />}
                {loading ? "验证中..." : "使用 Passkey 解锁"}
              </Button>
              <p className="text-xs text-center text-zinc-500">
                支持 Touch ID / Face ID / Windows Hello
              </p>
            </div>
          )}

          {/* Password / Setup */}
          {(mode === "password" || needsSetup) && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-zinc-400 text-xs">{needsSetup ? "设置主密码" : "主密码"}</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white/[0.06] border-white/[0.08] h-11 text-white placeholder:text-zinc-600"
                  placeholder="输入密码"
                  onKeyDown={(e) => e.key === "Enter" && (needsSetup ? doSetup() : doPasswordLogin())}
                />
              </div>
              {needsSetup && (
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-xs">确认密码</Label>
                  <Input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="bg-white/[0.06] border-white/[0.08] h-11 text-white placeholder:text-zinc-600"
                    placeholder="再次输入"
                    onKeyDown={(e) => e.key === "Enter" && doSetup()}
                  />
                </div>
              )}
              <Button
                className="w-full h-11"
                onClick={needsSetup ? doSetup : doPasswordLogin}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {needsSetup ? "创建并进入" : "解锁"}
              </Button>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm text-center mt-4">{error}</p>
          )}

          {/* Warning for setup */}
          {needsSetup && (
            <p className="text-xs text-center text-amber-400/80 mt-6 leading-relaxed">
              密码丢失将无法恢复数据，请妥善保管
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
