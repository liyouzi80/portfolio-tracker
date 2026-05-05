"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TransactionSheet } from "./transaction-sheet";
import { ImportSheet } from "./import-sheet";
import { Plus, Upload, Search } from "lucide-react";

const mockTxns = [
  { id: "1", symbol: "AAPL", type: "buy", quantity: 50, price: 175, fee: 0, date: "2026-04-15", market: "US", currency: "USD" },
  { id: "2", symbol: "0700", type: "buy", quantity: 200, price: 370, fee: 50, date: "2026-04-10", market: "HK", currency: "HKD" },
  { id: "3", symbol: "600519", type: "buy", quantity: 100, price: 1780, fee: 20, date: "2026-03-28", market: "CN", currency: "CNY" },
  { id: "4", symbol: "AAPL", type: "sell", quantity: 10, price: 185, fee: 0, date: "2026-03-20", market: "US", currency: "USD" },
];

const typeColors: Record<string, string> = {
  buy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  sell: "bg-red-500/10 text-red-400 border-red-500/20",
  dividend: "bg-blue-500/10 text-blue-400 border-blue-500/20",
};

export function TransactionsTab() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = mockTxns.filter((t) => {
    if (search && !t.symbol.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    return true;
  });

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Transactions</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              placeholder="Search symbol..."
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
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="buy">Buy</SelectItem>
              <SelectItem value="sell">Sell</SelectItem>
              <SelectItem value="dividend">Dividend</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="text-zinc-500">Date</TableHead>
              <TableHead className="text-zinc-500">Symbol</TableHead>
              <TableHead className="text-zinc-500">Type</TableHead>
              <TableHead className="text-zinc-500 text-right">Qty</TableHead>
              <TableHead className="text-zinc-500 text-right">Price</TableHead>
              <TableHead className="text-zinc-500 text-right">Fee</TableHead>
              <TableHead className="text-zinc-500 text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id} className="border-zinc-800">
                <TableCell className="text-zinc-300">{t.date}</TableCell>
                <TableCell className="font-mono font-medium">{t.symbol}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={typeColors[t.type] ?? "border-zinc-700"}>
                    {t.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono">{t.quantity}</TableCell>
                <TableCell className="text-right font-mono">{t.currency} {t.price.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono text-zinc-500">{t.currency} {t.fee.toFixed(2)}</TableCell>
                <TableCell className="text-right font-mono">
                  {t.currency} {(t.quantity * t.price + t.fee).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow className="border-zinc-800">
                <TableCell colSpan={7} className="text-center text-zinc-500 py-8">
                  No transactions found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <TransactionSheet open={sheetOpen} onOpenChange={setSheetOpen} />
      <ImportSheet open={importOpen} onOpenChange={setImportOpen} />
    </Card>
  );
}
