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
  currentPrice?: number;
  pnl?: number;
  pnlPct?: number;
}

const marketLabels: Record<string, string> = { US: "美股", HK: "港股", CN: "A股" };

const marketColors: Record<string, string> = {
  US: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  HK: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  CN: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
};

export function HoldingsTable({ data }: { data: Holding[] }) {
  return (
    <div className="overflow-x-auto"><Table>
      <TableHeader>
        <TableRow className="border-zinc-800 ">
          <TableHead className="text-zinc-500">代码</TableHead>
          <TableHead className="text-zinc-500">名称</TableHead>
          <TableHead className="text-zinc-500">市场</TableHead>
          <TableHead className="text-zinc-500 text-right">数量</TableHead>
          <TableHead className="text-zinc-500 text-right">均价</TableHead>
          <TableHead className="text-zinc-500 text-right">成本</TableHead>
          <TableHead className="text-zinc-500 text-right">盈亏</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((h) => (
          <TableRow key={h.assetId} className="border-zinc-800">
            <TableCell className="font-mono font-medium">{h.symbol}</TableCell>
            <TableCell className="text-zinc-300">{h.name}</TableCell>
            <TableCell>
              <Badge variant="outline" className={marketColors[h.market] ?? "border-zinc-700"}>
                {marketLabels[h.market] ?? h.market}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-mono">{h.quantity}</TableCell>
            <TableCell className="text-right font-mono">
              {h.currency} {h.avgCost.toFixed(2)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {h.currency} {h.totalCost.toLocaleString()}
            </TableCell>
            <TableCell className={`text-right font-mono ${
              h.pnl === undefined ? 'text-zinc-500' : h.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {h.pnl !== undefined ? `${h.pnl >= 0 ? '+' : ''}${h.currency} ${Math.abs(h.pnl).toLocaleString()}` : "--"}
              {h.pnlPct !== undefined && <span className="text-xs ml-1">({h.pnlPct >= 0 ? '+' : ''}{h.pnlPct}%)</span>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table></div>
  );
}
