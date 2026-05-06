"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (a: { symbol: string; condition: string; threshold: number }) => void;
}

export function AlertSheet({ open, onOpenChange, onSave }: Props) {
  const [form, setForm] = useState({ symbol: "", condition: "price_below", threshold: "" });

  const handleSave = () => {
    if (!form.symbol.trim() || !form.threshold) return;
    onSave({ symbol: form.symbol.toUpperCase(), condition: form.condition, threshold: parseFloat(form.threshold) });
    setForm({ symbol: "", condition: "price_below", threshold: "" });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">添加价格提醒</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label className="text-zinc-400">股票代码</Label>
            <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="bg-zinc-900 border-zinc-700" placeholder="AAPL" />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400">条件</Label>
            <Select value={form.condition} onValueChange={(v) => v && setForm({ ...form, condition: v })}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 text-zinc-100"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="price_above">价格高于</SelectItem>
                <SelectItem value="price_below">价格低于</SelectItem>
                <SelectItem value="change_pct">涨跌幅超过</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400">阈值</Label>
            <Input value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} className="bg-zinc-900 border-zinc-700" type="number" />
          </div>
          <Button className="w-full mt-4" onClick={handleSave}>创建提醒</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
