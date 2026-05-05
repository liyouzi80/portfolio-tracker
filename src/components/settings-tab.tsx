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
import { AlertSheet } from "./alert-sheet";
import { Plus, Pencil, Trash2, Zap, Fingerprint, Loader2 } from "lucide-react";
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
interface Alert { id: string; symbol: string; condition: string; threshold: number; enabled: boolean }

export function SettingsTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [dataSource, setDataSource] = useState("yahoo");
  const [testing, setTesting] = useState(false);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [deletingPasskey, setDeletingPasskey] = useState(false);
  const passkeyAvailable = typeof window !== "undefined" && !!window.PublicKeyCredential;

  const loadData = useCallback(async () => {
    try {
      const [accRes, alertRes, authRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/alerts"),
        fetch("/api/auth"),
      ]);
      if (accRes.ok) {
        const accData = await accRes.json() as Array<{ id: string; name: string; currency: string; leverage: number }>;
        setAccounts(accData);
      }
      if (alertRes.ok) {
        const alertData = await alertRes.json() as Array<{ id: string; symbol: string; conditionType: string; threshold: number; enabled: number }>;
        setAlerts(alertData.map((a) => ({
          id: a.id,
          symbol: a.symbol,
          condition: a.conditionType,
          threshold: a.threshold,
          enabled: a.enabled === 1,
        })));
      }
      if (authRes.ok) {
        const authData = await authRes.json() as { hasPasskey?: boolean };
        setHasPasskey(authData.hasPasskey ?? false);
      }
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
      } catch { toast.error("网络错误"); }
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
      } catch { toast.error("网络错误"); }
    }
    setEditAccount(null);
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm("确认删除此账户？关联的交易记录将无法显示。")) return;
    const prev = accounts;
    setAccounts(accounts.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
      const data = await res.json() as { success?: boolean; error?: string };
      if (data.success) { toast.success("账户已删除"); }
      else { setAccounts(prev); toast.error(data.error || "删除失败"); }
    } catch { setAccounts(prev); toast.error("网络错误"); }
  };

  const handleAddAlert = async (a: { symbol: string; condition: string; threshold: number }) => {
    try {
      const market = /^\d/.test(a.symbol) ? "CN" : /\.HK$/i.test(a.symbol) ? "HK" : "US";
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: a.symbol, market, conditionType: a.condition, threshold: a.threshold }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (data.id) {
        setAlerts([...alerts, { id: data.id, ...a, enabled: true }]);
        toast.success("提醒已创建");
      } else {
        toast.error(data.error || "创建失败");
      }
    } catch { toast.error("网络错误"); }
  };

  const handleDeleteAlert = async (id: string) => {
    try {
      await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
      setAlerts(alerts.filter((a) => a.id !== id));
      toast.success("提醒已删除");
    } catch { toast.error("网络错误"); }
  };

  const handleToggleAlert = async (id: string) => {
    const alert = alerts.find((a) => a.id === id);
    if (!alert) return;
    const newEnabled = !alert.enabled;
    setAlerts(alerts.map((a) => a.id === id ? { ...a, enabled: newEnabled } : a));
    try {
      await fetch(`/api/alerts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled ? 1 : 0 }),
      });
    } catch {
      setAlerts(alerts.map((a) => a.id === id ? { ...a, enabled: !newEnabled } : a));
      toast.error("更新失败");
    }
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

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/test-connection", { method: "POST" });
      const data = await res.json() as { success: boolean; price?: number; symbol?: string; source?: string; note?: string; error?: string };
      if (data.success && data.price) {
        toast.success(`${data.symbol} = $${data.price} (${data.source === "yahoo" ? "Yahoo Finance" : "长桥"})`);
      } else {
        toast.error(data.error || "测试失败");
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
            <CardTitle className="text-sm font-medium">账户管理</CardTitle>
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
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-500">账户名称</TableHead>
                  <TableHead className="text-zinc-500">币种</TableHead>
                  <TableHead className="text-zinc-500">杠杆</TableHead>
                  <TableHead className="text-zinc-500 w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id} className="border-zinc-800">
                    <TableCell className="font-medium">{a.name}</TableCell>
                    <TableCell><Badge variant="outline" className="border-zinc-700">{a.currency}</Badge></TableCell>
                    <TableCell className="font-mono">{a.leverage}x</TableCell>
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

      {/* Alerts */}
      <Card className="t-tab-content t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">价格提醒</CardTitle>
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setAlertOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />添加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">暂无提醒，点击"添加"创建</p>
          ) : (
            <div className="overflow-x-auto"><Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-500">代码</TableHead>
                  <TableHead className="text-zinc-500">条件</TableHead>
                  <TableHead className="text-zinc-500">阈值</TableHead>
                  <TableHead className="text-zinc-500">状态</TableHead>
                  <TableHead className="text-zinc-500 w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((a) => (
                  <TableRow key={a.id} className="border-zinc-800">
                    <TableCell className="font-mono font-medium">{a.symbol}</TableCell>
                    <TableCell className="text-zinc-300">{a.condition === "price_below" ? "低于" : "高于"}</TableCell>
                    <TableCell className="font-mono">{a.threshold}</TableCell>
                    <TableCell>
                      <button onClick={() => handleToggleAlert(a.id)}>
                        <Badge variant="outline" className={a.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-pointer" : "bg-zinc-800 text-zinc-500 border-zinc-700 cursor-pointer"}>
                          {a.enabled ? "启用" : "暂停"}
                        </Badge>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-red-400" onClick={() => handleDeleteAlert(a.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
          <CardTitle className="text-sm font-medium">安全设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-300">Passkey 快速登录</p>
              <p className="text-xs text-zinc-500 mt-0.5">注册后可用 Touch ID / Face ID / Windows Hello 解锁</p>
            </div>
            {!passkeyAvailable ? (
              <span className="text-xs text-zinc-600">此设备不支持</span>
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
          <CardTitle className="text-sm font-medium">数据源配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-zinc-400">主数据源</Label>
            <Select value={dataSource} onValueChange={(v) => v && setDataSource(v)}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="longbridge">长桥 (Longbridge)</SelectItem>
                <SelectItem value="yahoo">Yahoo Finance</SelectItem>
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

      <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} onSave={handleSaveAccount} editAccount={editAccount} />
      <AlertSheet open={alertOpen} onOpenChange={setAlertOpen} onSave={handleAddAlert} />
      </>
      )}
    </div>
  );
}
