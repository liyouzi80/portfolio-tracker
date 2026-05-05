"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DataPoint {
  date: string;
  value: number;
}

export function ProfitCurve({ data }: { data: DataPoint[] }) {
  if (data.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-12">暂无盈亏数据，添加交易记录后开始追踪</p>;
  }

  return (
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
          contentStyle={{ background: "rgba(24,24,27,0.95)", border: "1px solid rgba(63,63,70,0.5)", borderRadius: "8px", fontSize: "13px", color: "#fff" }}
          formatter={(v) => [`¥${Number(v).toLocaleString()}`, "盈亏"]}
        />
        <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} fill="url(#profitGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
