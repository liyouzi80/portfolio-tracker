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

export function AlertSheet({ open, onOpenChange }: Props) {
  const [form, setForm] = useState({ symbol: "", condition: "price_below", threshold: "" });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">New Price Alert</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label className="text-zinc-400">Symbol</Label>
            <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="bg-zinc-900 border-zinc-700" placeholder="AAPL" />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400">Condition</Label>
            <Select value={form.condition} onValueChange={(v) => v && setForm({ ...form, condition: v })}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="price_above">Price Above</SelectItem>
                <SelectItem value="price_below">Price Below</SelectItem>
                <SelectItem value="change_pct">Change %</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400">Threshold</Label>
            <Input value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} className="bg-zinc-900 border-zinc-700" type="number" />
          </div>
          <Button className="w-full mt-4" onClick={() => onOpenChange(false)}>Create Alert</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
