"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import { fmtMoney, fmtQuantity, fmtMoneySigned, fmtPercent } from "@/lib/format";

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

const marketLabels: Record<string, string> = { US: "美股", HK: "港股", CN: "A股", JP: "日股", KR: "韩股", GB: "英股", DE: "德股", CH: "瑞士", CA: "加股", AU: "澳股", TW: "台股", IN: "印度" };

const marketColors: Record<string, string> = {
  US: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  HK: "bg-red-500/10 text-red-400 border-red-500/20",
  CN: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  JP: "bg-pink-500/10 text-pink-400 border-pink-500/20",
  KR: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  GB: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  DE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  CH: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  CA: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  AU: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  TW: "bg-lime-500/10 text-lime-400 border-lime-500/20",
  IN: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20",
};

function tradingViewUrl(symbol: string, market: string): string {
  const exchange: Record<string, string> = {
    US: "NASDAQ",
    HK: "HKEX",
    CN: "SSE",
    JP: "TSE",
    KR: "KRX",
    GB: "LSE",
    DE: "XETR",
    CH: "SIX",
    CA: "TSX",
    AU: "ASX",
    TW: "TWSE",
    IN: "NSE",
  };
  const ex = exchange[market] || market;
  return `https://www.tradingview.com/symbols/${ex}-${symbol}/`;
}

export function HoldingsTable({ data, onSymbolClick }: { data: Holding[]; onSymbolClick?: (symbol: string) => void }) {
  return (
    <div className="overflow-auto max-h-[600px]"><Table>
      <TableHeader className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur-sm">
        <TableRow className="border-zinc-800 hover:bg-transparent">
          <TableHead className="text-zinc-500">代码</TableHead>
          <TableHead className="text-zinc-500">名称</TableHead>
          <TableHead className="text-zinc-500">市场</TableHead>
          <TableHead className="text-zinc-500 text-right">数量</TableHead>
          <TableHead className="text-zinc-500 text-right">均价</TableHead>
          <TableHead className="text-zinc-500 text-right">现价</TableHead>
          <TableHead className="text-zinc-500 text-right">成本</TableHead>
          <TableHead className="text-zinc-500 text-right">盈亏</TableHead>
          <TableHead className="text-zinc-500 w-8" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((h) => (
          <TableRow key={h.assetId} className="border-zinc-800">
            <TableCell className="font-mono font-medium">
              {onSymbolClick ? (
                <button onClick={() => onSymbolClick(h.symbol)} className="hover:text-emerald-400 transition-colors cursor-pointer">
                  {h.symbol}
                </button>
              ) : h.symbol}
            </TableCell>
            <TableCell className="text-zinc-300">{h.name || h.symbol}</TableCell>
            <TableCell>
              <Badge variant="outline" className={marketColors[h.market] ?? "border-zinc-700"}>
                {marketLabels[h.market] ?? h.market}
              </Badge>
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">{fmtQuantity(h.quantity)}</TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {h.currency} {fmtMoney(h.avgCost)}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {h.currentPrice !== undefined ? (
                <span className={h.currentPrice >= h.avgCost ? "text-emerald-400" : "text-red-400"}>
                  {h.currency} {fmtMoney(h.currentPrice)}
                </span>
              ) : (
                <span className="text-zinc-500">--</span>
              )}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {h.currency} {fmtMoney(h.totalCost)}
            </TableCell>
            <TableCell className={`text-right font-mono tabular-nums ${
              h.pnl === undefined ? 'text-zinc-500' : h.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {h.pnl !== undefined ? `${h.currency} ${fmtMoneySigned(h.pnl)}` : "--"}
              {h.pnlPct !== undefined && <span className="text-xs ml-1">({fmtPercent(h.pnlPct)})</span>}
            </TableCell>
            <TableCell>
              <a
                href={tradingViewUrl(h.symbol, h.market)}
                target="_blank"
                rel="noreferrer"
                className="text-zinc-600 hover:text-zinc-300 transition-colors"
                title="在 TradingView 查看"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table></div>
  );
}
