"use client";

import { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays, startOfYear } from "date-fns";
import { Button } from "@/components/ui/button";

type Period = "1m" | "3m" | "6m" | "ytd" | "all";

const periods: { key: Period; label: string }[] = [
  { key: "1m", label: "本月" },
  { key: "3m", label: "三个月" },
  { key: "6m", label: "半年" },
  { key: "ytd", label: "YTD" },
  { key: "all", label: "全部" },
];

// Simple seeded PRNG (mulberry32) — deterministic output for same seed
function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateData(days: number, baseValue: number, seedOffset: number) {
  if (baseValue <= 0) return [];
  const rng = seededRandom(Math.round(baseValue) + seedOffset + days * 31);
  let cum = 0;
  return Array.from({ length: days }, (_, i) => {
    const date = subDays(new Date(), days - i - 1);
    const pct = (rng() - 0.45) * 3;
    const value = Math.round(pct * baseValue / 100);
    cum += value;
    return { date: format(date, "MM/dd"), value, cum };
  });
}

const ytdStart = Math.max(1, Math.floor((new Date().getTime() - startOfYear(new Date()).getTime()) / 86400000));
const periodDays: Record<Period, number> = {
  "1m": 30,
  "3m": 90,
  "6m": 180,
  ytd: ytdStart,
  all: 365,
};
const periodSeeds: Record<Period, number> = {
  "1m": 1,
  "3m": 2,
  "6m": 3,
  ytd: 4,
  all: 5,
};

export function ProfitCurve({ baseValue }: { baseValue: number }) {
  const [period, setPeriod] = useState<Period>("3m");

  const data = useMemo(
    () => generateData(periodDays[period], baseValue, periodSeeds[period]),
    [period, baseValue],
  );

  if (data.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-12">暂无盈亏数据</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        {periods.map((p) => (
          <Button
            key={p.key}
            variant={period === p.key ? "secondary" : "ghost"}
            size="sm"
            className={`h-7 px-3 text-xs ${period === p.key ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
            onClick={() => setPeriod(p.key)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "13px" }}
            formatter={(v) => [`¥${Number(v).toLocaleString()}`, "盈亏"]}
          />
          <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} fill="url(#profitGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
