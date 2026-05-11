"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountSheet } from "./account-sheet";
import { Plus, Pencil, Trash2, Zap, Fingerprint, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

const PRF_SALT = "portfolio-tracker-prf-salt-v1";

function bufToB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function sha256(data: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return bufToB64(hash);
}

async function registerPasskey(): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Portfolio Tracker" },
      user: { id: userId, name: "portfolio-user", displayName: "Portfolio User" },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },
        { alg: -257, type: "public-key" },
      ],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      timeout: 60000,
      extensions: { prf: { eval: { first: new TextEncoder().encode(PRF_SALT) } } },
    },
  });
  const ext = (credential as any)?.getClientExtensionResults?.() as any;
  const prfOutput = ext?.prf?.results?.first;
  if (!prfOutput) throw new Error("此设备不支持 Passkey PRF，无法注册");
  return sha256(bufToB64(prfOutput));
}

interface Account { id: string; name: string; currency: string; leverage: number }

export function SettingsTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [dataSource, setDataSource] = useState("tencent");
  const [testing, setTesting] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cronRuns, setCronRuns] = useState<any[]>([]);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [deletingPasskey, setDeletingPasskey] = useState(false);
  const passkeyAvailable = typeof window !== "undefined" && !!window.PublicKeyCredential;

  const loadData = useCallback(async () => {
    try {
      const [accRes, authRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/auth"),
      ]);
      if (accRes.ok) {
        const accData = await accRes.json() as Array<{ id: string; name: string; currency: string; leverage: number }>;
        setAccounts(accData);
      }
      if (authRes.ok) {
        const authData = await authRes.json() as { hasPasskey?: boolean; dataSource?: string };
        setHasPasskey(authData.hasPasskey ?? false);
        if (authData.dataSource) setDataSource(authData.dataSource);
      }
      fetch("/api/cron-runs").then(r => r.json()).then((d) => setCronRuns(d as any[])).catch(() => {});
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaveAccount = async (acc: { name: string; currency: string; leverage: number; id?: string }) => {
    if (acc.id) {
      // Edit existing
      try {
        const res = await fetch(`/api/accounts/${acc.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: acc.name, currency: acc.currency, leverage: acc.leverage }),
        });
        const data = await res.json() as { success?: boolean; error?: string };
        if (data.success) {
          setAccounts(accounts.map(a => a.id === acc.id ? { ...a, name: acc.name, currency: acc.currency, leverage: acc.leverage } : a));
          toast.success("账户已更新");
        } else { toast.error(data.error || "更新失败"); }
      } catch { toast.error("操作失败，请重试"); }
    } else {
      // Create new
      try {
        const res = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(acc),
        });
        const data = await res.json() as { id?: string; error?: string };
        if (data.id) {
          setAccounts([...accounts, { id: data.id, name: acc.name, currency: acc.currency, leverage: acc.leverage }]);
          toast.success("账户已添加");
        } else { toast.error(data.error || "添加失败"); }
      } catch { toast.error("操作失败，请重试"); }
    }
    setEditAccount(null);
  };

  const handleDeleteAccount = async (id: string) => {
    let msg = "确认删除此账户？";
    try {
      const txnRes = await fetch(`/api/transactions?accountId=${id}`);
      if (txnRes.ok) {
        const txns = await txnRes.json() as unknown[];
        if (txns.length > 0) {
          msg = `该账户下有 ${txns.length} 条交易记录，删除账户将连带删除所有交易，确认继续？`;
        }
      }
    } catch { /* fallback */ }
    if (!confirm(msg)) return;
    const prev = accounts;
    setAccounts(accounts.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
      const data = await res.json() as { success?: boolean; error?: string };
      if (data.success) { toast.success("账户已删除"); }
      else { setAccounts(prev); toast.error(data.error || "删除失败"); }
    } catch { setAccounts(prev); toast.error("操作失败，请重试"); }
  };

  const handleRegisterPasskey = async () => {
    setRegisteringPasskey(true);
    try {
      const prfHash = await registerPasskey();
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "passkey-register", prfHash }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (data.success) { setHasPasskey(true); toast.success("Passkey 注册成功，下次可免密登录"); }
      else toast.error(data.error || "注册失败");
    } catch (e: any) {
      toast.error(e.message || "Passkey 注册失败");
    }
    setRegisteringPasskey(false);
  };

  const handleDeletePasskey = async () => {
    setDeletingPasskey(true);
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete-passkey" }),
      });
      setHasPasskey(false);
      toast.success("Passkey 已删除");
    } catch { toast.error("删除失败"); }
    setDeletingPasskey(false);
  };

  const handleSourceChange = async (v: string) => {
    setDataSource(v);
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-settings", dataSource: v }),
      });
      toast.success(`数据源已切换为 ${v === "tencent" ? "腾讯财经" : v === "longbridge" ? "长桥" : "Yahoo Finance"}`);
    } catch { /* ignore */ }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/test-connection", { method: "POST" });
      const data = await res.json() as { success: boolean; price?: number; symbol?: string; source?: string; note?: string; tencent?: { ok: boolean; price?: number } };
      if (data.success && data.price) {
        const sourceLabel = data.source === "tencent" ? "腾讯财经" : data.source === "longbridge" ? "长桥" : data.source === "yahoo" ? "Yahoo" : data.source;
        toast.success(`${data.symbol} = $${data.price} (${sourceLabel})`);
        if (data.note) toast.info(data.note, { duration: 5000 });
      } else {
        toast.error(data.note || "所有数据源均失败");
      }
    } catch {
      toast.error("测试失败: 网络错误");
    }
    setTesting(false);
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
        </div>
      ) : (
      <>
      {/* Accounts */}
      <Card className="t-tab-content t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-zinc-100">账户管理</CardTitle>
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => { setEditAccount(null); setAccountOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />添加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">暂无账户，点击"添加"创建</p>
          ) : (
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow className="border-zinc-800 ">
                  <TableHead className="text-zinc-500">账户名称</TableHead>
                  <TableHead className="text-zinc-500">币种</TableHead>
                  <TableHead className="text-zinc-500">杠杆</TableHead>
                  <TableHead className="text-zinc-500 w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id} className="border-zinc-800">
                    <TableCell className="font-medium text-zinc-100">{a.name}</TableCell>
                    <TableCell><Badge variant="outline" className="border-zinc-700 text-zinc-100">{a.currency}</Badge></TableCell>
                    <TableCell className="font-mono text-zinc-100">{a.leverage}x</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-zinc-300" onClick={() => { setEditAccount(a); setAccountOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-red-400" onClick={() => handleDeleteAccount(a.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          )}
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="t-tab-content t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-100">安全设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300">Passkey 快速登录</p>
              <p className="text-xs text-zinc-500 mt-0.5">注册后可用 Touch ID / Face ID / Windows Hello 解锁</p>
            </div>
            {!passkeyAvailable ? (
              <span className="text-xs text-zinc-500">此设备不支持</span>
            ) : hasPasskey ? (
              <Button
                size="sm"
                variant="outline"
                className="border-red-800 text-red-400 hover:bg-red-950/30"
                onClick={handleDeletePasskey}
                disabled={deletingPasskey}
              >
                {deletingPasskey ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                )}
                {deletingPasskey ? "删除中..." : "删除 Passkey"}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 text-zinc-300"
                onClick={handleRegisterPasskey}
                disabled={registeringPasskey}
              >
                {registeringPasskey ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Fingerprint className="h-3.5 w-3.5 mr-1" />
                )}
                {registeringPasskey ? "注册中..." : "注册 Passkey"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Source */}
      <Card className="t-tab-content t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-100">数据源配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-zinc-400">主数据源</Label>
            <Select value={dataSource} onValueChange={(v) => v && handleSourceChange(v)}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tencent">腾讯财经 (免费·默认)</SelectItem>
                <SelectItem value="finnhub">Finnhub (免费·美股)</SelectItem>
                <SelectItem value="longbridge">长桥 Longbridge</SelectItem>
                <SelectItem value="yahoo">Yahoo Finance (备用)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-2 border-t border-zinc-800">
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={handleTestConnection} disabled={testing}>
              <Zap className="h-3.5 w-3.5 mr-1" />
              {testing ? "测试中..." : "测试连接"}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            {dataSource === "longbridge"
              ? "长桥凭证通过 GitHub Secrets (LONGBRIDGE_APP_KEY / APP_SECRET / ACCESS_TOKEN) 注入，无需在此填写。"
              : "Yahoo Finance 免费无需 API Key，但稳定性一般。"}
          </p>
        </CardContent>
      </Card>

      {/* Data Export / Escape Hatch */}
      <Card className="t-tab-content t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-100">数据备份</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-500 leading-relaxed">
            一键导出所有交易记录、账户、持仓快照和汇率数据。建议定期下载备份，避免因密码丢失导致数据无法找回。
          </p>
          <a
            href="/api/export"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white transition-colors px-3 py-2 rounded-lg border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.04]"
            download
          >
            <Download className="h-3.5 w-3.5" />
            下载 CSV 备份
          </a>
        </CardContent>
      </Card>

      {/* Cron Runs History */}
      <Card className="t-tab-content t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-100">Cron 运行历史</CardTitle>
        </CardHeader>
        <CardContent>
          {cronRuns.length === 0 ? (
            <p className="text-zinc-500 text-sm">暂无运行记录</p>
          ) : (
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow className="border-zinc-800">
                  <TableHead className="text-zinc-500">任务</TableHead>
                  <TableHead className="text-zinc-500">时间</TableHead>
                  <TableHead className="text-zinc-500">状态</TableHead>
                  <TableHead className="text-zinc-500 text-right">成功/失败</TableHead>
                  <TableHead className="text-zinc-500 text-right">耗时</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cronRuns.map(r => (
                  <TableRow key={r.id} className="border-zinc-800">
                    <TableCell className="font-mono text-zinc-100">{r.triggerType}</TableCell>
                    <TableCell className="text-zinc-400 text-xs">
                      {new Date(r.startedAt).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={r.status === "success"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : "bg-red-500/10 text-red-400 border-red-500/20"
                      }>
                        {r.status === "success" ? "成功" : "失败"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-zinc-100">
                      {r.succeeded}/{(r.succeeded ?? 0) + (r.failed ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-zinc-400">
                      {((r.durationMs ?? 0) / 1000).toFixed(1)}s
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table></div>
          )}
        </CardContent>
      </Card>

      <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} onSave={handleSaveAccount} editAccount={editAccount} />
      </>
      )}
    </div>
  );
}
