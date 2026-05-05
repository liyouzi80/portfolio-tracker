"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format, subDays } from "date-fns";

const days = 60;
const seed = Array.from({ length: days }, (_, i) => {
  const date = subDays(new Date(), days - i - 1);
  const pct = (Math.random() - 0.45) * 3;
  const value = Math.round(pct * 285000 / 100);
  return { date: format(date, "MM/dd"), value, pct: +pct.toFixed(2) };
});

export function ProfitCurve() {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={seed}>
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} interval={9} />
        <YAxis tick={{ fontSize: 10, fill: "#71717a" }} tickLine={false} axisLine={false} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
        <Tooltip
          contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "13px" }}
          formatter={(v) => [`¥${Number(v).toLocaleString()}`, "盈亏"]}
        />
        <Bar dataKey="value" radius={[2, 2, 0, 0]}>
          {seed.map((d, i) => (
            <Cell key={i} fill={d.value >= 0 ? "#34d399" : "#f87171"} opacity={0.8} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
