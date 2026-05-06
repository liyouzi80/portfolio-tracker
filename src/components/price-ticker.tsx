"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TickerItem {
  symbol: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
}

const POLL_INTERVAL_MS = 60_000; // refresh every 60s

export function PriceTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const r = await fetch(`/api/portfolio?baseCurrency=USD`);
        if (!r.ok) return;
        const d = await r.json() as {
          holdings?: Array<{ symbol: string; currentPrice?: number; prevClose?: number }>;
        };
        if (cancelled) return;

        // Dedup by symbol
        const seen = new Set<string>();
        const list: TickerItem[] = [];
        for (const h of (d.holdings ?? [])) {
          if (seen.has(h.symbol)) continue;
          seen.add(h.symbol);
          const price = h.currentPrice ?? null;
          const prev = h.prevClose;
          const change = (price !== null && prev && prev > 0) ? price - prev : null;
          const changePct = change !== null && prev ? (change / prev) * 100 : null;
          list.push({ symbol: h.symbol, price, change, changePct });
        }
        // Fallback to SPY when there are no holdings yet
        if (list.length === 0) {
          try {
            const res = await fetch(`/api/price?symbol=SPY&market=US`);
            const data = await res.json() as { price?: number | null; prevClose?: number | null };
            const price = data.price ?? null;
            const prev = data.prevClose ?? null;
            const change = (price !== null && prev && prev > 0) ? price - prev : null;
            list.push({
              symbol: "SPY",
              price,
              change,
              changePct: change !== null && prev ? (change / prev) * 100 : null,
            });
          } catch { /* ignore */ }
        }
        setItems(list);
      } catch { /* ignore */ }
    };

    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (items.length === 0) {
    return (
      <div className="border-b border-zinc-800 bg-zinc-900/80 h-9" />
    );
  }

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/80 overflow-hidden">
      <div className="marquee-container flex whitespace-nowrap animate-[marquee_30s_linear_infinite] hover:[animation-play-state:paused]">
        {[...items, ...items].map((item, i) => (
          <div key={`${item.symbol}-${i}`} className="inline-flex items-center gap-2 px-4 py-2 text-sm">
            <span className="font-mono font-medium">{item.symbol}</span>
            <span className="text-zinc-300">
              {item.price !== null ? item.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "--"}
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
