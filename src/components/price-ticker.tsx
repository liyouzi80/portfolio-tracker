"use client";

import { useState, useRef } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface TickerItem {
  symbol: string;
  price: number | null;
  change: number | null;
}

const demoData: TickerItem[] = [
  { symbol: "AAPL", price: 195.83, change: 1.2 },
  { symbol: "0700", price: 385.40, change: -0.8 },
  { symbol: "600519", price: 1792.00, change: 2.1 },
  { symbol: "TSLA", price: 245.60, change: -1.5 },
  { symbol: "SPY", price: 530.20, change: 0.3 },
  { symbol: "BTC", price: 68500, change: 3.7 },
];

export function PriceTicker() {
  const [items] = useState<TickerItem[]>(demoData);
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/80 overflow-hidden">
      <div className="flex whitespace-nowrap animate-[marquee_30s_linear_infinite]" ref={scrollRef}>
        {[...items, ...items].map((item, i) => (
          <div key={`${item.symbol}-${i}`} className="inline-flex items-center gap-2 px-4 py-2 text-sm">
            <span className="font-mono font-medium">{item.symbol}</span>
            <span className="text-zinc-300">{item.price?.toLocaleString()}</span>
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
