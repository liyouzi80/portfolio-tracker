"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TickerItem {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
}

interface Quote {
  symbol: string;
  market: string;
  name: string;
  price: number | null;
  prevClose?: number;
}

const POLL_INTERVAL_MS = 60_000;

export function PriceTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    let symbolsList: Array<{ symbol: string; market: string; name: string }> = [];
    let cycleCount = 0;

    const loadSymbols = async () => {
      try {
        const r = await fetch(`/api/portfolio?baseCurrency=USD`);
        if (!r.ok) return;
        const d = await r.json() as {
          holdings?: Array<{ symbol: string; market: string; name: string }>;
        };
        const seen = new Set<string>();
        symbolsList = [];
        for (const h of (d.holdings ?? [])) {
          const k = `${h.symbol}:${h.market}`;
          if (seen.has(k)) continue;
          seen.add(k);
          symbolsList.push({ symbol: h.symbol, market: h.market, name: h.name || h.symbol });
        }
      } catch { /* ignore */ }
    };

    const loadQuotes = async () => {
      if (cancelled) return;
      if (symbolsList.length === 0) {
        try {
          const res = await fetch(`/api/quotes?symbols=SPY:US`);
          const data = await res.json() as Quote[];
          if (cancelled) return;
          if (data.length > 0 && data[0].price) {
            const q = data[0];
            const change = q.price && q.prevClose ? q.price - q.prevClose : null;
            setItems([{ symbol: q.symbol, name: q.name, price: q.price, change, changePct: change && q.prevClose ? (change / q.prevClose) * 100 : null }]);
          }
        } catch { /* ignore */ }
        return;
      }
      const param = symbolsList.map(s => `${s.symbol}:${s.market}`).join(",");
      try {
        const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(param)}`);
        const data = await res.json() as Quote[];
        if (cancelled) return;
        const list: TickerItem[] = data.map(q => {
          const ref = symbolsList.find(s => s.symbol === q.symbol && s.market === q.market);
          const change = q.price !== null && q.prevClose ? q.price - q.prevClose : null;
          const changePct = change !== null && q.prevClose ? (change / q.prevClose) * 100 : null;
          return { symbol: q.symbol, name: ref?.name || q.name, price: q.price, change, changePct };
        });
        setItems(list);
      } catch { /* ignore */ }
    };

    loadSymbols().then(loadQuotes);
    const id = setInterval(async () => {
      cycleCount++;
      if (cycleCount >= 5) {
        cycleCount = 0;
        await loadSymbols();
      }
      await loadQuotes();
    }, POLL_INTERVAL_MS);
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
            <span className="text-zinc-400 text-xs">{item.name}</span>
            <span className="text-zinc-300">
              {item.price !== null ? item.price.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "--"}
            </span>
            {item.change !== null && item.change !== 0 ? (
              <span className={`flex items-center gap-0.5 text-xs ${item.change > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {item.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {item.change > 0 ? '+' : ''}{item.change.toFixed(2)}
                <span className="text-zinc-500">({item.changePct !== null ? (item.changePct > 0 ? '+' : '') + item.changePct.toFixed(2) + '%' : ''})</span>
              </span>
            ) : (
              <Minus className="h-3 w-3 text-zinc-500" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
