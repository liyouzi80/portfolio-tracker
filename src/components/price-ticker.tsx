"use client";

import { useState, useEffect, useRef } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TickerItem {
  symbol: string;
  price: number | null;
  change: number | null;
}

export function PriceTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load prices for portfolio holdings
    fetch("/api/portfolio?baseCurrency=CNY")
      .then(r => r.json() as Promise<{ holdings: Array<{ symbol: string; market: string }> }>)
      .then(d => {
        const symbols = d.holdings?.length
          ? [...new Map(d.holdings.map(h => [h.symbol, h])).values()]
          : [{ symbol: "SPY", market: "US" }]; // fallback
        return Promise.all(symbols.map(async ({ symbol, market }) => {
          try {
            const res = await fetch(`/api/price?symbol=${symbol}&market=${market}`);
            const data = await res.json() as { price?: number | null };
            return { symbol, price: data.price ?? null, change: null };
          } catch {
            return { symbol, price: null, change: null };
          }
        }));
      })
      .then(setItems)
      .catch(() => {});
  }, []);

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/80 overflow-hidden">
      <div className="marquee-container flex whitespace-nowrap animate-[marquee_30s_linear_infinite]" ref={scrollRef}>
        {[...items, ...items].map((item, i) => (
          <div key={`${item.symbol}-${i}`} className="inline-flex items-center gap-2 px-4 py-2 text-sm">
            <span className="font-mono font-medium">{item.symbol}</span>
            <span className="text-zinc-300">
              {item.price !== null ? item.price.toLocaleString() : "--"}
            </span>
            {item.change !== null && (
              <span className={`flex items-center gap-0.5 text-xs ${item.change > 0 ? 'text-emerald-400' : item.change < 0 ? 'text-red-400' : 'text-zinc-500'}`}>
                {item.change > 0 ? <TrendingUp className="h-3 w-3" /> : item.change < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {item.change > 0 && '+'}{item.change}%
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
