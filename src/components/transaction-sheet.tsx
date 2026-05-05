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
}

export function TransactionSheet({ open, onOpenChange }: Props) {
  const [form, setForm] = useState({
    symbol: "",
    market: "US",
    type: "buy",
    quantity: "",
    price: "",
    fee: "0",
    date: new Date().toISOString().slice(0, 10),
  });

  const handleSubmit = () => {
    // TODO: API call
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">New Transaction</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label className="text-zinc-400">Symbol</Label>
            <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="bg-zinc-900 border-zinc-700" placeholder="AAPL" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Market</Label>
              <Select value={form.market} onValueChange={(v) => v && setForm({ ...form, market: v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">US</SelectItem>
                  <SelectItem value="HK">HK</SelectItem>
                  <SelectItem value="CN">CN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Type</Label>
              <Select value={form.type} onValueChange={(v) => v && setForm({ ...form, type: v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                  <SelectItem value="dividend">Dividend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Quantity</Label>
              <Input value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="bg-zinc-900 border-zinc-700" type="number" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Price</Label>
              <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="bg-zinc-900 border-zinc-700" type="number" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-zinc-400">Fee</Label>
              <Input value={form.fee} onChange={(e) => setForm({ ...form, fee: e.target.value })} className="bg-zinc-900 border-zinc-700" type="number" />
            </div>
            <div className="space-y-2">
              <Label className="text-zinc-400">Date</Label>
              <Input value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="bg-zinc-900 border-zinc-700" type="date" />
            </div>
          </div>

          <Button onClick={handleSubmit} className="w-full mt-4">Save Transaction</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
