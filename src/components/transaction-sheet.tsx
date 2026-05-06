"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpRight, ArrowDownRight, Wallet, Calendar, Loader2, Check } from "lucide-react";

interface Account {
  id: string;
  name: string;
  currency: string;
}

interface EditTxnInput {
  id: string;
  accountId: string;
  symbol: string;
  market: string;
  type: string;
  quantity: number;
  price: number;
  fee: number;
  date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onSave: (txn: { accountId: string; symbol: string; market: string; type: string; quantity: number; price: number; fee: number; date: string; id?: string }) => void;
  editTxn?: EditTxnInput | null;
}

const typeOptions = [
  { value: "buy", label: "买入", icon: ArrowUpRight, color: "text-emerald-400" },
  { value: "sell", label: "卖出", icon: ArrowDownRight, color: "text-red-400" },
  { value: "dividend", label: "股息", icon: Wallet, color: "text-blue-400" },
];

const marketCurrency: Record<string, string> = {
  US: "USD", HK: "HKD", CN: "CNY", JP: "JPY", KR: "KRW",
  GB: "GBP", DE: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", IT: "EUR",
  CH: "CHF", CA: "CAD", AU: "AUD", TW: "TWD", IN: "INR",
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const defaultForm = {
  accountId: "",
  symbol: "",
  market: "US" as string,
  type: "buy" as string,
  quantity: "",
  price: "",
  fee: "",
  date: todayStr(),
};

export function TransactionSheet({ open, onOpenChange, accounts, onSave, editTxn }: Props) {
  const [form, setForm] = useState(defaultForm);
  const [symbolName, setSymbolName] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const lookupTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Populate form when editing
  useEffect(() => {
    if (open && editTxn) {
      setForm({
        accountId: editTxn.accountId || "",
        symbol: editTxn.symbol,
        market: editTxn.market,
        type: editTxn.type,
        quantity: String(editTxn.quantity),
        price: String(editTxn.price),
        fee: String(editTxn.fee || ""),
        date: editTxn.date,
      });
      setSymbolName(editTxn.symbol);
    } else if (open && !editTxn) {
      // For new transactions, keep account/date stickiness across "save and continue"
      setForm((f) => ({ ...defaultForm, accountId: f.accountId, date: f.date || todayStr() }));
      setSymbolName("");
    }
  }, [open, editTxn]);

  interface SearchResult { symbol: string; fullSymbol: string; name: string; exchange: string; market: string; currency: string; marketLabel: string; price?: number | null }

  const resetFormForContinue = () => {
    setForm({ ...defaultForm, accountId: form.accountId, date: form.date });
    setSymbolName("");
    setSearchResults([]);
    setShowSearch(false);
  };

  const handleClose = () => {
    setAddedCount(0);
    onOpenChange(false);
    // Defer form reset until close animation completes (~200ms)
    setTimeout(() => {
      setForm(defaultForm);
      setSymbolName("");
    }, 200);
  };

  const searchSymbols = useCallback(async (query: string) => {
    if (!query || query.length < 1) { setSearchResults([]); setShowSearch(false); return; }
    setLookingUp(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json() as SearchResult[];
      setSearchResults(data);
      setShowSearch(data.length > 0);
    } catch { setSearchResults([]); setShowSearch(false); }
    setLookingUp(false);
  }, []);

  const selectSearchResult = (item: SearchResult) => {
    setForm((f) => ({
      ...f,
      symbol: item.symbol,
      market: item.market,
      ...(item.price && item.price > 0 ? { price: item.price.toString() } : {}),
    }));
    setSymbolName(`${item.name} · ${item.marketLabel}`);
    setShowSearch(false);
    setSearchResults([]);
  };

  const detectMarket = (symbol: string): string => {
    const s = symbol.replace(/\.(HK|SS|SZ|T|KS|L|DE|PA|MC|AS|MI|SW|TO|AX)$/i, "");
    if (/^\d{6}$/.test(s)) return "CN";
    if (/^\d{4,5}$/.test(s)) return "HK";
    return "US";
  };

  const handleSymbolChange = (value: string) => {
    const clean = value.toUpperCase().replace(/\.(HK|SS|SZ|T|KS|L|DE|PA|MC|AS|MI|SW|TO|AX)$/i, "");
    const mkt = detectMarket(value);
    setForm({ ...form, symbol: clean, market: mkt });
    setSymbolName("");
    setSearchResults([]);
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (clean.length >= 1) {
      lookupTimer.current = setTimeout(() => searchSymbols(clean), 300);
    } else {
      setShowSearch(false);
    }
  };

  const handleSaveAndContinue = async () => {
    if (!form.accountId || !form.symbol || !form.quantity || !form.price || submitting) return;
    setSubmitting(true);
    await onSave({
      id: editTxn?.id,
      accountId: form.accountId,
      symbol: form.symbol.toUpperCase(),
      market: form.market,
      type: form.type,
      quantity: parseFloat(form.quantity),
      price: parseFloat(form.price),
      fee: parseFloat(form.fee || "0"),
      date: form.date,
    });
    setSubmitting(false);
    setAddedCount(c => c + 1);
    if (!editTxn) resetFormForContinue();
  };

  const qty = parseFloat(form.quantity);
  const prc = parseFloat(form.price);
  const fee = parseFloat(form.fee || "0");
  const isValid = !!(
    form.accountId &&
    form.symbol &&
    !isNaN(qty) && qty > 0 &&
    !isNaN(prc) && prc > 0 &&
    (isNaN(fee) || fee >= 0)
  );
  const estimatedTotal = form.quantity && form.price
    ? (qty * prc + (isNaN(fee) ? 0 : fee)).toFixed(2)
    : "";

  const selectedType = typeOptions.find(t => t.value === form.type);
  const TypeIcon = selectedType?.icon ?? ArrowUpRight;
  const priceLabel = marketCurrency[form.market] || "USD";
  const selectedAccount = accounts.find(a => a.id === form.accountId);
  const accountCurrency = selectedAccount?.currency;
  const showDualCurrency = accountCurrency && accountCurrency !== priceLabel;

  return (
    <Dialog open={open} onOpenChange={(v) => v ? onOpenChange(true) : handleClose()}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <div className="px-6 py-6">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
              {editTxn ? "编辑交易" : "新增交易"}
              {addedCount > 0 && !editTxn && (
                <span className="text-xs font-normal text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                  已添加 {addedCount} 笔
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* Account */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">账户</Label>
              <Select value={form.accountId} onValueChange={(v) => { if (v) setForm({ ...form, accountId: v }); }}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700 h-11 text-sm">
                  <SelectValue placeholder="选择账户...">
                    {accounts.find(a => a.id === form.accountId)
                      ? `${accounts.find(a => a.id === form.accountId)!.name} (${accounts.find(a => a.id === form.accountId)!.currency})`
                      : "选择账户..."}
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

            {/* Symbol search */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">代码或名称</Label>
              <div className="relative">
                <Input
                  value={form.symbol}
                  onChange={(e) => handleSymbolChange(e.target.value)}
                  className="bg-zinc-900 border-zinc-700 h-11 text-sm font-mono placeholder:text-zinc-600 pr-8"
                  placeholder="搜索全球股票代码或名称"
                />
                {lookingUp && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 animate-spin" />
                )}
              </div>
              {symbolName && !showSearch && !lookingUp && (
                <p className="text-xs text-emerald-400/80 truncate flex items-center gap-1">
                  <Check className="h-3 w-3 text-emerald-500" /> {symbolName}
                  <span className="text-zinc-500 ml-1">({form.market} · {marketCurrency[form.market] || "USD"})</span>
                </p>
              )}
              {showSearch && (
                <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      type="button"
                      className="w-full text-left px-3 py-2.5 hover:bg-zinc-800 border-b border-zinc-800 last:border-0 transition-colors"
                      onClick={() => selectSearchResult(r)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono font-semibold text-white text-sm shrink-0">{r.symbol}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 bg-white/10 text-zinc-400">{r.marketLabel || r.market}</span>
                          <span className="text-[10px] text-zinc-500">{r.currency}</span>
                        </div>
                        {r.price && <span className="text-xs text-zinc-400 font-mono shrink-0 ml-2">{r.price.toFixed(2)}</span>}
                      </div>
                      <p className="text-xs text-zinc-400 truncate mt-0.5">{r.name}{r.exchange ? ` · ${r.exchange}` : ""}</p>
                    </button>
                  ))}
                </div>
              )}
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
                  min="0"
                  step="any"
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  价格
                </Label>
                <Input
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  className="bg-zinc-900 border-zinc-700 h-11 text-sm font-mono"
                  type="number"
                  min="0"
                  step="any"
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
                  min="0"
                  step="any"
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

            {/* Estimated total */}
            {estimatedTotal !== "" && (
              <div className="flex items-center justify-between px-4 py-3 rounded-lg bg-zinc-900/50 border border-zinc-800">
                <span className="text-sm text-zinc-400">
                  预估总额
                  {showDualCurrency && <span className="text-xs text-zinc-500 ml-1">({accountCurrency} 账户)</span>}
                </span>
                <div className="text-right">
                  <span className="text-sm font-mono font-semibold">
                    <TypeIcon className={`h-3.5 w-3.5 inline mr-1 ${selectedType?.color}`} />
                    {priceLabel} {estimatedTotal}
                  </span>
                </div>
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-2 pt-2">
              {!editTxn && (
                <Button onClick={handleSaveAndContinue} disabled={!isValid || submitting} variant="outline" className="flex-1 h-11 text-sm border-zinc-700 text-zinc-300 hover:bg-zinc-800">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存并继续"}
                </Button>
              )}
              <Button onClick={async () => { await handleSaveAndContinue(); handleClose(); }} disabled={!isValid || submitting} className="flex-1 h-11 text-sm">
                {editTxn ? "保存修改" : "保存并关闭"}
              </Button>
            </div>
            {!isValid && (
              <p className="text-xs text-amber-400/80 text-center">
                请填写: {[
                  !form.accountId && "账户",
                  !form.symbol && "代码",
                  !form.quantity && "数量",
                  !form.price && "价格",
                  !isNaN(fee) && fee < 0 && "手续费不能为负",
                ].filter(Boolean).join("、")}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
