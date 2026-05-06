"use client";

import { ChartContainer } from "./chart-container";
import { AreaSeries, LineSeries } from "lightweight-charts";

interface DataPoint {
  date: string;
  value: number;
}

export function NetValueChart({ data, currency = "$" }: { data: DataPoint[]; currency?: string }) {
  if (data.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-12">暂无净值数据，添加交易记录后开始追踪</p>;
  }

  const fmtAxis = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return `${currency}${(v / 1_000_000).toFixed(1)}m`;
    if (abs >= 10_000) return `${currency}${(v / 1000).toFixed(0)}k`;
    return `${currency}${v.toFixed(0)}`;
  };

  const fmtLabel = (v: number) => `${currency}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const chartData = data.map((d) => ({
    time: d.date,
    value: d.value,
  }));

  return (
    <ChartContainer>
      {(chart) => {
        chart.applyOptions({
          localization: { priceFormatter: (p: number) => fmtLabel(p) },
        });

        const area = chart.addSeries(AreaSeries, {
          lineColor: "#34d399",
          topColor: "rgba(52,211,153,0.3)",
          bottomColor: "rgba(52,211,153,0)",
          lineWidth: 2,
          priceFormat: { type: "custom", formatter: (p: number) => fmtLabel(p) },
        });
        area.setData(chartData);
        chart.timeScale().fitContent();
      }}
    </ChartContainer>
  );
}
