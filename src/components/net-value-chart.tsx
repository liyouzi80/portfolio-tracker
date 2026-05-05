"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface DataPoint {
  date: string;
  value: number;
}

export function NetValueChart({ data }: { data: DataPoint[] }) {
  if (data.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-12">暂无净值数据，添加交易记录后开始追踪</p>;
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
