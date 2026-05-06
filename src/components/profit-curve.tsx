"use client";

import { ChartContainer } from "./chart-container";
import { HistogramSeries, LineSeries } from "lightweight-charts";

interface DataPoint {
  date: string;
  value: number;
}

export function ProfitCurve({ data, currency = "$" }: { data: DataPoint[]; currency?: string }) {
  if (data.length === 0) {
    return <p className="text-zinc-500 text-sm text-center py-12">暂无盈亏数据，添加交易记录后开始追踪</p>;
  }

  const fmtLabel = (v: number) => `${currency}${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const chartData = data.map((d) => ({
    time: d.date,
    value: d.value,
    // Color per bar: green above zero, red below
    color: d.value >= 0 ? "rgba(52,211,153,0.7)" : "rgba(248,113,113,0.7)",
  }));

  return (
    <ChartContainer height={260}>
      {(chart) => {
        chart.applyOptions({
          localization: { priceFormatter: (p: number) => fmtLabel(p) },
        });

        const hist = chart.addSeries(HistogramSeries, {
          priceFormat: { type: "custom", formatter: (p: number) => fmtLabel(p) },
        });
        hist.setData(chartData);

        // Add a zero line for reference
        const zeroLine = chart.addSeries(LineSeries, {
          color: "rgba(113,113,122,0.3)",
          lineWidth: 1,
          priceFormat: { type: "custom", formatter: (p: number) => fmtLabel(p) },
        });
        const firstDate = chartData[0].time;
        const lastDate = chartData[chartData.length - 1].time;
        zeroLine.setData([
          { time: firstDate, value: 0 },
          { time: lastDate, value: 0 },
        ]);

        chart.timeScale().fitContent();
      }}
    </ChartContainer>
  );
}
