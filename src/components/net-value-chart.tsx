"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format, subDays } from "date-fns";

const days = 90;
const seed = Array.from({ length: days }, (_, i) => {
  const date = subDays(new Date(), days - i - 1);
  const base = 250000 + i * 200 + Math.sin(i / 8) * 15000 + Math.random() * 5000;
  return { date: format(date, "MM/dd"), value: Math.round(base) };
});

export function NetValueChart() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={seed}>
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
          formatter={(v) => [`¥${Number(v).toLocaleString()}`, "Net Value"]}
        />
        <Area type="monotone" dataKey="value" stroke="#34d399" strokeWidth={2} fill="url(#netValueGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
