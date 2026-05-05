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
import { Plus, Trash2, Zap, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Account { id: string; name: string; currency: string; leverage: number }
interface Alert { id: string; symbol: string; condition: string; threshold: number; enabled: boolean }

export function SettingsTab() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [dataSource, setDataSource] = useState("longbridge");
  const [lbKey, setLbKey] = useState("");
  const [lbSecret, setLbSecret] = useState("");
  const [lbAccessToken, setLbAccessToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [accRes, alertRes] = await Promise.all([
        fetch("/api/accounts"),
        fetch("/api/alerts"),
      ]);
      if (!accRes.ok || !alertRes.ok) throw new Error("auth required");
      const accData = await accRes.json() as Account[];
      const alertData = await alertRes.json() as Array<{
        id: string; symbol: string; conditionType: string; threshold: number; enabled: number;
      }>;
      setAccounts(accData);
      setAlerts(alertData.map((a) => ({
        id: a.id,
        symbol: a.symbol ?? "?",
        condition: a.conditionType,
        threshold: a.threshold,
        enabled: a.enabled === 1,
      })));
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddAccount = async (acc: { name: string; currency: string; leverage: number }) => {
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(acc),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (data.id) {
        setAccounts([...accounts, { id: data.id, ...acc }]);
        toast.success("账户已添加");
      } else {
        toast.error(data.error || "添加失败");
      }
    } catch { toast.error("网络错误"); }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      const res = await fetch(`/api/accounts?id=${id}`, { method: "DELETE" });
      const data = await res.json() as { success?: boolean; error?: string };
      if (data.success) {
        setAccounts(accounts.filter((a) => a.id !== id));
        toast.success("账户已删除");
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch { toast.error("网络错误"); }
  };

  const handleAddAlert = async (a: { symbol: string; condition: string; threshold: number }) => {
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: a.symbol,
          market: a.symbol.match(/^\d/) ? "CN" : a.symbol.match(/^\d{4}\.HK$/i) ? "HK" : "US",
          conditionType: a.condition,
          threshold: a.threshold,
        }),
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
    // Optimistic update
    setAlerts(alerts.map((a) => a.id === id ? { ...a, enabled: newEnabled } : a));
    try {
      await fetch(`/api/alerts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled ? 1 : 0 }),
      });
    } catch {
      // Revert on error
      setAlerts(alerts.map((a) => a.id === id ? { ...a, enabled: !newEnabled } : a));
      toast.error("更新失败");
    }
  };

  const handleSaveDataSource = () => {
    toast.success("数据源配置已保存");
  };

  const handleTestConnection = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appKey: lbKey, appSecret: lbSecret, accessToken: lbAccessToken }),
      });
      const data = await res.json() as { success: boolean; price?: number; symbol?: string; error?: string };
      if (data.success && data.price) {
        toast.success(`测试成功: ${data.symbol} = $${data.price}`);
      } else {
        toast.error(data.error || "测试失败: 无法获取价格，请检查数据源配置");
      }
    } catch {
      toast.error("测试失败: 网络错误");
    }
    setTesting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

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
              <p className="text-xs text-zinc-600">从长桥开放平台获取 App Key、App Secret 和 Access Token</p>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-zinc-800">
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={handleTestConnection} disabled={testing}>
              <Zap className="h-3.5 w-3.5 mr-1" />
              {testing ? "测试中..." : "测试连接"}
            </Button>
            <Button size="sm" onClick={handleSaveDataSource}>
              <Check className="h-3.5 w-3.5 mr-1" />
              保存配置
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
