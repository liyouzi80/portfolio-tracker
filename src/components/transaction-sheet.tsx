"use client";

import { useState, useCallback, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpRight, ArrowDownRight, Wallet, Calendar, Search, Loader2 } from "lucide-react";

interface Account {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onSave: (txn: { accountId: string; symbol: string; market: string; type: string; quantity: number; price: number; fee: number; date: string }) => void;
}

const typeOptions = [
  { value: "buy", label: "买入", icon: ArrowUpRight, color: "text-emerald-400" },
  { value: "sell", label: "卖出", icon: ArrowDownRight, color: "text-red-400" },
  { value: "dividend", label: "股息", icon: Wallet, color: "text-blue-400" },
];

const marketOptions = [
  { value: "US", label: "美股", hint: "USD" },
  { value: "HK", label: "港股", hint: "HKD" },
  { value: "CN", label: "A股", hint: "CNY" },
];

export function TransactionSheet({ open, onOpenChange, accounts, onSave }: Props) {
  const [form, setForm] = useState({
    accountId: "",
    symbol: "",
    market: "US" as string,
    type: "buy" as string,
    quantity: "",
    price: "",
    fee: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [symbolName, setSymbolName] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const resetForm = () => {
    setForm({
      accountId: "",
      symbol: "",
      market: "US",
      type: "buy",
      quantity: "",
      price: "",
      fee: "",
      date: new Date().toISOString().slice(0, 10),
    });
    setSymbolName("");
  };

  const lookupSymbol = useCallback(async (symbol: string, market: string) => {
    if (!symbol || symbol.length < 1) { setSymbolName(""); return; }
    setLookingUp(true);
    try {
      const res = await fetch(`/api/price?symbol=${symbol.toUpperCase()}&market=${market}`);
      const data = await res.json() as { name?: string; price?: number | null };
      setSymbolName(data.name ?? "");
    } catch { setSymbolName(""); }
    setLookingUp(false);
  }, []);

  const handleSymbolChange = (value: string) => {
    setForm({ ...form, symbol: value });
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = setTimeout(() => lookupSymbol(value, form.market), 400);
  };

  const handleMarketChange = (market: string) => {
    setForm({ ...form, market });
    if (form.symbol) lookupSymbol(form.symbol, market);
  };

  const selectedAccount = accounts.find(a => a.id === form.accountId);

  const handleSubmit = () => {
    if (!form.accountId || !form.symbol || !form.quantity || !form.price) return;
    onSave({
      accountId: form.accountId,
      symbol: form.symbol.toUpperCase(),
      market: form.market,
      type: form.type,
      quantity: parseFloat(form.quantity),
      price: parseFloat(form.price),
      fee: parseFloat(form.fee || "0"),
      date: form.date,
    });
    resetForm();
    onOpenChange(false);
  };

  const isValid = form.accountId && form.symbol && form.quantity && form.price;
  const estimatedTotal = form.quantity && form.price
    ? (parseFloat(form.quantity) * parseFloat(form.price) + parseFloat(form.fee || "0")).toFixed(2)
    : "";

  const selectedMarket = marketOptions.find(m => m.value === form.market);
  const selectedType = typeOptions.find(t => t.value === form.type);
  const TypeIcon = selectedType?.icon ?? ArrowUpRight;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 w-full sm:max-w-md p-0">
        <div className="overflow-y-auto h-full px-6 py-6">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-lg font-semibold text-zinc-100">新增交易</SheetTitle>
          </SheetHeader>

          <div className="space-y-5">
            {/* Account */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">账户</Label>
              <Select value={form.accountId} onValueChange={(v) => { if (v) setForm({ ...form, accountId: v }); }}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 h-11 text-sm">
                  <SelectValue placeholder="选择账户...">
                    {selectedAccount ? `${selectedAccount.name} (${selectedAccount.currency})` : "选择账户..."}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {accounts.length === 0 ? (
                    <div className="px-2 py-4 text-sm text-zinc-500 text-center">暂无账户，请先在设置中添加</div>
                  ) : (
                    accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Symbol + Market */}
            <div className="grid grid-cols-5 gap-3">
              <div className="col-span-3 space-y-2">
                <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">代码</Label>
                <div className="relative">
                  <Input
                    value={form.symbol}
                    onChange={(e) => handleSymbolChange(e.target.value)}
                    className="bg-zinc-900 border-zinc-700 h-11 text-sm font-mono uppercase placeholder:text-zinc-600 pr-8"
                    placeholder="AAPL"
                  />
                  {lookingUp && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 animate-spin" />
                  )}
                </div>
                {symbolName && (
                  <p className="text-xs text-emerald-400/80 truncate">{symbolName}</p>
                )}
              </div>
              <div className="col-span-2 space-y-2">
                <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">市场</Label>
                <div className="flex rounded-lg bg-zinc-900 border border-zinc-700 p-0.5 h-11">
                  {marketOptions.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => handleMarketChange(m.value)}
                      className={`flex-1 text-xs rounded-md transition-colors ${
                        form.market === m.value
                          ? "bg-zinc-700 text-white"
                          : "text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Type */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">类型</Label>
              <div className="flex gap-2">
                {typeOptions.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm({ ...form, type: t.value })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg border text-sm transition-colors ${
                        form.type === t.value
                          ? "bg-zinc-800 border-zinc-600 text-white"
                          : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${t.color}`} />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quantity + Price */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">数量</Label>
                <Input
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  className="bg-zinc-900 border-zinc-700 h-11 text-sm font-mono"
                  type="number"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  价格 ({selectedMarket?.hint})
                </Label>
                <Input
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="bg-zinc-900 border-zinc-700 h-11 text-sm font-mono"
                  type="number"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Fee + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">手续费</Label>
                <Input
                  value={form.fee}
                  onChange={(e) => setForm({ ...form, fee: e.target.value })}
                  className="bg-zinc-900 border-zinc-700 h-11 text-sm font-mono"
                  type="number"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">日期</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
                  <Input
                    value={form.date}
                    onChange={(e) => setForm({ ...form, date: e.target.value })}
                    className="bg-zinc-900 border-zinc-700 h-11 text-sm pl-9"
                    type="date"
                  />
                </div>
              </div>
            </div>

            {/* Estimated Total */}
            {estimatedTotal !== "" && (
              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <span className="text-sm text-zinc-400">预估总额</span>
                <span className="text-sm font-mono font-semibold">
                  <TypeIcon className={`h-3.5 w-3.5 inline mr-1 ${selectedType?.color}`} />
                  {selectedMarket?.hint} {estimatedTotal}
                </span>
              </div>
            )}

            {/* Submit */}
            <Button onClick={handleSubmit} disabled={!isValid} className="w-full h-11 text-sm font-medium">
              保存交易
            </Button>
            {!isValid && (
              <p className="text-xs text-amber-400/80 text-center">
                请填写: {[
                  !form.accountId && "账户",
                  !form.symbol && "代码",
                  !form.quantity && "数量",
                  !form.price && "价格",
                ].filter(Boolean).join("、")}
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
