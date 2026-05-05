"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Holding {
  assetId: string;
  symbol: string;
  name: string;
  market: string;
  currency: string;
  quantity: number;
  avgCost: number;
  totalCost: number;
}

const marketColors: Record<string, string> = {
  US: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  HK: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  CN: "bg-red-500/10 text-red-400 border-red-500/20",
};

export function HoldingsTable({ data }: { data: Holding[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-zinc-800 hover:bg-transparent">
          <TableHead className="text-zinc-500">Symbol</TableHead>
          <TableHead className="text-zinc-500">Name</TableHead>
          <TableHead className="text-zinc-500">Market</TableHead>
          <TableHead className="text-zinc-500 text-right">Qty</TableHead>
          <TableHead className="text-zinc-500 text-right">Avg Cost</TableHead>
          <TableHead className="text-zinc-500 text-right">Total Cost</TableHead>
          <TableHead className="text-zinc-500 text-right">P&L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((h) => (
          <TableRow key={h.assetId} className="border-zinc-800">
            <TableCell className="font-mono font-medium">{h.symbol}</TableCell>
            <TableCell className="text-zinc-300">{h.name}</TableCell>
            <TableCell>
              <Badge variant="outline" className={marketColors[h.market] ?? "border-zinc-700"}>
                {h.market}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-mono">{h.quantity}</TableCell>
            <TableCell className="text-right font-mono">
              {h.currency} {h.avgCost.toFixed(2)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {h.currency} {h.totalCost.toLocaleString()}
            </TableCell>
            <TableCell className="text-right font-mono text-emerald-400">--</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
