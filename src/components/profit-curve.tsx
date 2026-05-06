"use client";

import { ChartContainer } from "./chart-container";
import { AreaSeries, LineSeries } from "lightweight-charts";

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
  }));

  const hasPositive = chartData.some((d) => d.value > 0);
  const hasNegative = chartData.some((d) => d.value < 0);

  return (
    <ChartContainer height={260}>
      {(chart) => {
        chart.applyOptions({
          localization: { priceFormatter: (p: number) => fmtLabel(p) },
        });

        // Zero reference line
        const zeroLine = chart.addSeries(LineSeries, {
          color: "rgba(113,113,122,0.25)",
          lineWidth: 1,
          priceFormat: { type: "custom", formatter: (p: number) => fmtLabel(p) },
        });
        const firstDate = chartData[0].time;
        const lastDate = chartData[chartData.length - 1].time;
        zeroLine.setData([
          { time: firstDate, value: 0 },
          { time: lastDate, value: 0 },
        ]);

        // Area series: green gradient when profitable, red when not
        const area = chart.addSeries(AreaSeries, {
          lineColor: hasPositive ? "#34d399" : "#f87171",
          topColor: hasPositive ? "rgba(52,211,153,0.25)" : "rgba(248,113,113,0.25)",
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
