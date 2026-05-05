"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

interface AllocationItem { name: string; value: number; color: string }

const marketColors: Record<string, string> = {
  US: "#3b82f6",
  HK: "#f59e0b",
  CN: "#ef4444",
};

const marketLabels: Record<string, string> = { US: "美股", HK: "港股", CN: "A股" };

export function AllocationPie({ data }: { data: AllocationItem[] }) {
  if (data.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-8">暂无持仓数据</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={50} stroke="none">
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: "8px", fontSize: "13px" }}
            formatter={(v) => [`¥${Number(v).toLocaleString()}`, ""]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-3 mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
}
