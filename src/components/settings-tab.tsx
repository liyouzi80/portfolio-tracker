"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountSheet } from "./account-sheet";
import { AlertSheet } from "./alert-sheet";
import { Plus, Pencil, Trash2, Zap, Check, Fingerprint, Loader2 } from "lucide-react";
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
  const [dataSource, setDataSource] = useState("yahoo");
  const [lbKey, setLbKey] = useState("");
  const [lbSecret, setLbSecret] = useState("");
  const [lbAccessToken, setLbAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.ok ? r.json() as Promise<{ dataSource: string; lbKey: string; lbSecret: string; lbAccessToken: string }> : null)
      .then((d) => {
        if (!d) return;
        setDataSource(d.dataSource || "yahoo");
        setLbKey(d.lbKey || "");
        setLbSecret(d.lbSecret || "");
        setLbAccessToken(d.lbAccessToken || "");
      })
      .catch(() => {});
  }, []);
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const passkeyAvailable = typeof window !== "undefined" && !!window.PublicKeyCredential;

  const handleAddAccount = (acc: { name: string; currency: string; leverage: number }) => {
    setAccounts([...accounts, { id: Date.now().toString(36), ...acc }]);
    toast.success("账户已添加");
  };

  const handleDeleteAccount = (id: string) => {
    setAccounts(accounts.filter((a) => a.id !== id));
    toast.success("账户已删除");
  };

  const handleAddAlert = (a: { symbol: string; condition: string; threshold: number }) => {
    setAlerts([...alerts, { id: Date.now().toString(36), ...a, enabled: true }]);
    toast.success("提醒已创建");
  };

  const handleDeleteAlert = (id: string) => {
    setAlerts(alerts.filter((a) => a.id !== id));
    toast.success("提醒已删除");
  };

  const handleToggleAlert = (id: string) => {
    setAlerts(alerts.map((a) => a.id === id ? { ...a, enabled: !a.enabled } : a));
    toast.success("提醒状态已更新");
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
      if (data.success) toast.success("Passkey 注册成功，下次可免密登录");
      else toast.error(data.error || "注册失败");
    } catch (e: any) {
      toast.error(e.message || "Passkey 注册失败");
    }
    setRegisteringPasskey(false);
  };

  const handleSaveDataSource = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSource, lbKey, lbSecret, lbAccessToken }),
      });
      if (res.ok) toast.success("数据源配置已保存");
      else toast.error("保存失败");
    } catch {
      toast.error("网络错误");
    }
    setSaving(false);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      if (dataSource === "longbridge" && lbKey && lbSecret && lbAccessToken) {
        const res = await fetch("/api/test-connection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appKey: lbKey, appSecret: lbSecret, accessToken: lbAccessToken }),
        });
        const data = await res.json() as { success: boolean; price?: number; symbol?: string; error?: string };
        if (data.success && data.price) toast.success(`测试成功: ${data.symbol} = $${data.price}`);
        else toast.error(data.error || "测试失败");
      } else {
        const res = await fetch("/api/price?symbol=AAPL&market=US");
        const data = await res.json() as { price?: number | null; source?: string };
        if (data.price) toast.success(`测试成功: AAPL = $${data.price} (${data.source})`);
        else toast.error("测试失败: 无法获取价格");
      }
    } catch {
      toast.error("测试失败: 网络错误");
    }
    setTesting(false);
  };

  return (
    <div className="space-y-6">
      {/* Accounts */}
      <Card className="t-tab-content t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">账户管理</CardTitle>
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setAccountOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />添加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-zinc-500 text-sm text-center py-8">暂无账户，点击"添加"创建</p>
          ) : (
            <Table>
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
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-zinc-300">
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
            </Table>
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
            <Table>
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
            </Table>
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
            {passkeyAvailable ? (
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
            ) : (
              <span className="text-xs text-zinc-600">此设备不支持</span>
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

          {dataSource === "longbridge" && (
            <div className="space-y-3 pt-2 border-t border-zinc-800">
              <Label className="text-zinc-400 text-xs">长桥 API 参数</Label>
              <Input className="bg-zinc-900 border-zinc-700 h-9 text-sm" placeholder="App Key" type="password" value={lbKey} onChange={(e) => setLbKey(e.target.value)} />
              <Input className="bg-zinc-900 border-zinc-700 h-9 text-sm" placeholder="App Secret" type="password" value={lbSecret} onChange={(e) => setLbSecret(e.target.value)} />
              <Input className="bg-zinc-900 border-zinc-700 h-9 text-sm" placeholder="Access Token" type="password" value={lbAccessToken} onChange={(e) => setLbAccessToken(e.target.value)} />
              <p className="text-xs text-zinc-600">从长桥开放平台获取: open.longportapp.com</p>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-zinc-800">
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={handleTestConnection} disabled={testing}>
              <Zap className="h-3.5 w-3.5 mr-1" />
              {testing ? "测试中..." : "测试连接"}
            </Button>
            <Button size="sm" onClick={handleSaveDataSource} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
              {saving ? "保存中..." : "保存配置"}
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            {dataSource === "yahoo" ? "Yahoo Finance 免费无需 API Key，但稳定性一般。" : "长桥需要 API Key，未配置时自动使用 Yahoo Finance 备用。"}
          </p>
        </CardContent>
      </Card>

      <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} onSave={handleAddAccount} />
      <AlertSheet open={alertOpen} onOpenChange={setAlertOpen} onSave={handleAddAlert} />
    </div>
  );
}
