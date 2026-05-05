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

export function AccountSheet({ open, onOpenChange }: Props) {
  const [form, setForm] = useState({ name: "", currency: "CNY", leverage: "1" });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">添加账户</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label className="text-zinc-400">账户名称</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-900 border-zinc-700" placeholder="例如：盈透证券" />
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400">基准币种</Label>
            <Select value={form.currency} onValueChange={(v) => v && setForm({ ...form, currency: v })}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CNY">CNY (¥)</SelectItem>
                <SelectItem value="HKD">HKD (HK$)</SelectItem>
                <SelectItem value="USD">USD ($)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-zinc-400">杠杆率</Label>
            <Input value={form.leverage} onChange={(e) => setForm({ ...form, leverage: e.target.value })} className="bg-zinc-900 border-zinc-700" type="number" min="1" />
          </div>
          <Button className="w-full mt-4" onClick={() => onOpenChange(false)}>保存账户</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
