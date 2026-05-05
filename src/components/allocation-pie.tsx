"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Label } from "recharts";

interface AllocationItem { name: string; value: number; color: string }

export function AllocationPie({ data, currency }: { data: AllocationItem[]; currency?: string }) {
  const cs = currency || "¥";
  if (data.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-8">暂无持仓数据</p>;
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={50} stroke="none"
            label={({ name, value }) => `${name} ${total > 0 ? ((value / total) * 100).toFixed(0) : 0}%`}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
            <Label value={`${data.length} 个市场`} position="center" fill="#a1a1aa" fontSize={12} />
          </Pie>
          <Tooltip
            contentStyle={{ background: "rgba(24,24,27,0.95)", border: "1px solid rgba(63,63,70,0.5)", borderRadius: "8px", fontSize: "13px", color: "#fff" }}
            formatter={(v, name) => [`${cs}${Number(v).toLocaleString()}`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name} ({total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%)
          </div>
        ))}
      </div>
    </div>
  );
}
