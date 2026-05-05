"use client";

import { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";

function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function generateNetValue(days: number, baseValue: number) {
  if (baseValue <= 0) return [];
  const rng = seededRandom(Math.round(baseValue) + days * 17);
  let current = baseValue;
  return Array.from({ length: days }, (_, i) => {
    const date = subDays(new Date(), days - i - 1);
    current = current + (rng() - 0.48) * current * 0.015;
    return { date: format(date, "MM/dd"), value: Math.round(current) };
  });
}

export function NetValueChart({ baseValue }: { baseValue: number }) {
  const data = useMemo(() => generateNetValue(90, baseValue), [baseValue]);

  if (data.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-12">暂无净值数据</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="netValueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} interval={14} />
        <YAxis tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} tickFormatter={(v) => `¥${(v / 10000).toFixed(1)}w`} />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "13px" }}
          formatter={(v) => [`¥${Number(v).toLocaleString()}`, "净值"]}
        />
        <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} fill="url(#netValueGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
