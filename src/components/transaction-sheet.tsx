"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

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

export function TransactionSheet({ open, onOpenChange, accounts, onSave }: Props) {
  const [form, setForm] = useState({
    accountId: "",
    symbol: "",
    market: "US" as string,
    type: "buy" as string,
    quantity: "",
    price: "",
    fee: "0",
    date: new Date().toISOString().slice(0, 10),
  });

  const resetForm = () => setForm({
    accountId: "",
    symbol: "",
    market: "US",
    type: "buy",
    quantity: "",
    price: "",
    fee: "0",
    date: new Date().toISOString().slice(0, 10),
  });

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
    toast.success("交易已保存");
  };

  const isValid = form.accountId && form.symbol && form.quantity && form.price;

  const missingFields = [
    !form.accountId && "账户",
    !form.symbol && "代码",
    !form.quantity && "数量",
    !form.price && "价格",
  ].filter(Boolean) as string[];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">新增交易</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label className="text-zinc-400">选择账户</Label>
            <Select value={form.accountId} onValueChange={(v) => v && setForm({ ...form, accountId: v })}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue placeholder="选择账户..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-zinc-400">股票代码</Label>
            <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="bg-zinc-900 border-zinc-700" placeholder="AAPL" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">市场</Label>
              <Select value={form.market} onValueChange={(v) => v && setForm({ ...form, market: v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">美股</SelectItem>
                  <SelectItem value="HK">港股</SelectItem>
                  <SelectItem value="CN">A股</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">类型</Label>
              <Select value={form.type} onValueChange={(v) => v && setForm({ ...form, type: v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">买入</SelectItem>
                  <SelectItem value="sell">卖出</SelectItem>
                  <SelectItem value="dividend">股息</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">数量</Label>
              <Input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="bg-zinc-900 border-zinc-700" type="number" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">价格</Label>
              <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="bg-zinc-900 border-zinc-700" type="number" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">手续费</Label>
              <Input value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} className="bg-zinc-900 border-zinc-700" type="number" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">日期</Label>
              <Input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="bg-zinc-900 border-zinc-700" type="date" />
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={!isValid} className="w-full mt-4">保存交易</Button>
          {!isValid && missingFields.length > 0 && (
            <p className="text-xs text-amber-400/80 text-center">
              请填写: {missingFields.join("、")}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
