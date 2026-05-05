"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TransactionSheet } from "./transaction-sheet";
import { ImportSheet } from "./import-sheet";
import { Plus, Upload, Search, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Txn { id: string; symbol: string; type: string; quantity: number; price: number; fee: number; date: string; market: string; currency: string; accountName: string }
interface Account { id: string; name: string; currency: string }

const typeLabels: Record<string, string> = { buy: "买入", sell: "卖出", dividend: "股息" };
const typeColors: Record<string, string> = {
  buy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  sell: "bg-red-500/10 text-red-400 border-red-500/20",
  dividend: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

export function TransactionsTab() {
  const [txns, setTxns] = useState<Txn[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadTxns = useCallback(async () => {
    try {
      const res = await fetch("/api/transactions");
      if (!res.ok) throw new Error("auth required");
      const data = await res.json() as Array<{
        transactions: { id: string; type: string; quantity: number; price: number; fee: number; date: string };
        assets: { symbol: string; market: string; currency: string } | null;
        accounts: { name: string } | null;
      }>;
      const mapped: Txn[] = data.map((row) => ({
        id: row.transactions.id,
        symbol: row.assets?.symbol ?? "?",
        type: row.transactions.type,
        quantity: row.transactions.quantity,
        price: row.transactions.price,
        fee: row.transactions.fee ?? 0,
        date: row.transactions.date,
        market: row.assets?.market ?? "US",
        currency: row.assets?.currency ?? "USD",
        accountName: row.accounts?.name ?? "?",
      }));
      setTxns(mapped);
    } catch {
      // silently ignore fetch errors
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTxns();
    fetch("/api/accounts").then(async (r) => {
      if (r.ok) setAccounts(await r.json() as Account[]);
    }).catch(() => {});
  }, [loadTxns]);

  const handleDelete = async (id: string) => {
    if (!confirm("确认删除这条交易记录？此操作不可撤销。")) return;
    setDeleting(id);
    const prevTxns = txns;
    setTxns((p) => p.filter((t) => t.id !== id));
    try {
      await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
      toast.success("交易记录已删除");
    } catch {
      setTxns(prevTxns);
      toast.error("删除失败");
    }
    setDeleting(null);
  };

  const marketCurrency: Record<string, string> = {
    US: "USD", HK: "HKD", CN: "CNY", JP: "JPY", KR: "KRW",
    GB: "GBP", DE: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", IT: "EUR",
    CH: "CHF", CA: "CAD", AU: "AUD", TW: "TWD", IN: "INR",
  };

  const handleSaveTxn = async (t: { accountId: string; symbol: string; market: string; type: string; quantity: number; price: number; fee: number; date: string }) => {
    try {
      const currency = marketCurrency[t.market] || "USD";
      // Ensure asset exists
      const assetRes = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: t.symbol.toUpperCase(), name: t.symbol.toUpperCase(), market: t.market, currency, assetType: "stock" }),
      });
      const assetData = await assetRes.json() as { id?: string };
      if (!assetData.id) throw new Error("Failed to create asset");

      // Create transaction
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: t.accountId, assetId: assetData.id, type: t.type, quantity: t.quantity, price: t.price, fee: t.fee, date: t.date }),
      });
      const data = await res.json() as { id?: string; error?: string };
      if (data.id) {
        loadTxns();
        toast.success("交易已保存");
      } else {
        toast.error(data.error || "保存失败");
      }
    } catch {
      toast.error("网络错误");
    }
  };

  const handleImportDone = () => {
    loadTxns();
  };

  const filtered = txns.filter((t) => {
    if (search && !t.symbol.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    return true;
  });

  return (
    <Card className="t-tab-content t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">交易记录</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />
              导入
            </Button>
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              新增
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="搜索代码..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-zinc-900 border-zinc-700 h-9 text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
            <SelectTrigger className="w-28 bg-zinc-900 border-zinc-700 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="buy">买入</SelectItem>
              <SelectItem value="sell">卖出</SelectItem>
              <SelectItem value="dividend">股息</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto"><Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500">日期</TableHead>
                <TableHead className="text-zinc-500">账户</TableHead>
                <TableHead className="text-zinc-500">代码</TableHead>
                <TableHead className="text-zinc-500">类型</TableHead>
                <TableHead className="text-zinc-500 text-right">数量</TableHead>
                <TableHead className="text-zinc-500 text-right">价格</TableHead>
                <TableHead className="text-zinc-500 text-right">手续费</TableHead>
                <TableHead className="text-zinc-500 text-right">总额</TableHead>
                <TableHead className="text-zinc-500 w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((t) => (
                <TableRow key={t.id} className="border-zinc-800">
                  <TableCell className="text-zinc-300">{t.date}</TableCell>
                  <TableCell className="text-zinc-400 text-sm">{t.accountName}</TableCell>
                  <TableCell className="font-mono font-medium">{t.symbol}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={typeColors[t.type] ?? "border-zinc-700"}>
                      {typeLabels[t.type] ?? t.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono">{t.quantity}</TableCell>
                  <TableCell className="text-right font-mono">{t.currency} {t.price.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono text-zinc-500">{t.currency} {t.fee.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {t.currency} {(t.quantity * t.price + t.fee).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-zinc-500 hover:text-red-400"
                      disabled={deleting === t.id}
                      onClick={() => handleDelete(t.id)}
                    >
                      {deleting === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && !loading && (
                <TableRow className="border-zinc-800">
                  <TableCell colSpan={9} className="text-center text-zinc-500 py-8">
                    暂无交易记录
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table></div>
        )}
      </CardContent>

      <TransactionSheet open={sheetOpen} onOpenChange={setSheetOpen} accounts={accounts} onSave={handleSaveTxn} />
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} accounts={accounts} onDone={handleImportDone} />
    </Card>
  );
}
