"use client";

import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TickerItem {
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
}

export function PriceTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/portfolio?baseCurrency=CNY")
      .then(r => r.json() as Promise<{ holdings: Array<{ symbol: string; market: string }> }>)
      .then(d => {
        const symbols = d.holdings?.length
          ? [...new Map(d.holdings.map(h => [h.symbol, h])).values()]
          : [{ symbol: "SPY", market: "US" }];
        return Promise.all(symbols.map(async ({ symbol, market }) => {
          try {
            const res = await fetch(`/api/price?symbol=${symbol}&market=${market}`);
            const data = await res.json() as { price?: number | null; prevClose?: number | null };
            const price = data.price ?? null;
            const prevClose = data.prevClose ?? null;
            const change = (price !== null && prevClose && prevClose > 0) ? price - prevClose : null;
            const changePct = change !== null ? (change / prevClose!) * 100 : null;
            return { symbol, price, change, changePct };
          } catch {
            return { symbol: symbol, price: null, change: null, changePct: null };
          }
        }));
      })
      .then(setItems)
      .catch(() => {});
  }, []);

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/80 overflow-hidden">
      <div className="marquee-container flex whitespace-nowrap animate-[marquee_30s_linear_infinite] hover:[animation-play-state:paused]" ref={scrollRef}>
        {[...items, ...items].map((item, i) => (
          <div key={`${item.symbol}-${i}`} className="inline-flex items-center gap-2 px-4 py-2 text-sm">
            <span className="font-mono font-medium">{item.symbol}</span>
            <span className="text-zinc-300">
              {item.price !== null ? item.price.toLocaleString() : "--"}
            </span>
            {item.change !== null && item.change !== 0 ? (
              <span className={`flex items-center gap-0.5 text-xs ${item.change > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {item.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {item.change > 0 ? '+' : ''}{item.change.toFixed(2)}
                <span className="text-zinc-600">({item.changePct !== null ? (item.changePct > 0 ? '+' : '') + item.changePct.toFixed(2) + '%' : ''})</span>
              </span>
            ) : (
              <Minus className="h-3 w-3 text-zinc-600" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
