"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DataPoint {
  date: string;
  value: number;
}

export function NetValueChart({ data, currency = "$" }: { data: DataPoint[]; currency?: string }) {
  if (data.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-12">暂无净值数据，添加交易记录后开始追踪</p>;
  }

  const fmtAxis = (v: number) => {
    if (Math.abs(v) >= 1_000_000) return `${currency}${(v / 1_000_000).toFixed(1)}m`;
    if (Math.abs(v) >= 10_000) return `${currency}${(v / 1000).toFixed(0)}k`;
    return `${currency}${v.toFixed(0)}`;
  };
  const fmtTooltip = (v: number) => `${currency}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="netValueGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: "#71717a" }} tickLine={false} axisLine={false} tickFormatter={fmtAxis} />
        <Tooltip
          contentStyle={{ background: "rgba(24,24,27,0.95)", border: "1px solid rgba(63,63,70,0.5)", borderRadius: "8px", fontSize: "13px", color: "#fff" }}
          formatter={(v) => [fmtTooltip(Number(v)), "净值"]}
        />
        <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} fill="url(#netValueGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
