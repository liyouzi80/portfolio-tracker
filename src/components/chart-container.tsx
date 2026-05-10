"use client";

import { useEffect, useRef } from "react";
import { createChart, DeepPartial, ChartOptions, IChartApi } from "lightweight-charts";

export function ChartContainer({
  children,
  height = 260,
  className = "",
}: {
  children: (chart: IChartApi) => void;
  height?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const opts: DeepPartial<ChartOptions> = {
      layout: {
        background: { color: "transparent" },
        textColor: "#71717a",
        fontSize: 11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        vertLine: { color: "rgba(63,63,70,0.4)", width: 1, style: 2 },
        horzLine: { color: "rgba(63,63,70,0.4)", width: 1, style: 2 },
      },
      rightPriceScale: { borderColor: "rgba(63,63,70,0.3)", visible: true, entireTextOnly: true },
      timeScale: {
        borderColor: "rgba(63,63,70,0.3)",
        timeVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    };

    const chart = createChart(containerRef.current, {
      ...opts,
      width: containerRef.current.clientWidth,
      height,
    });
    chartRef.current = chart;

    children(chart);

    // Tooltip element
    const tooltip = document.createElement("div");
    tooltip.className = "absolute z-50 pointer-events-none rounded px-2 py-1 text-xs font-mono bg-zinc-800/90 text-zinc-100 border border-zinc-700 shadow-lg whitespace-nowrap";
    tooltip.style.display = "none";
    containerRef.current.style.position = "relative";
    containerRef.current.appendChild(tooltip);

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
        tooltip.style.display = "none";
        return;
      }

      const values: string[] = [];
      param.seriesData.forEach((data, series) => {
        const val = (data as any).value ?? (data as any).close;
        if (val !== undefined) {
          const fmt = series.options().priceFormat?.type === "custom"
            ? (series.options().priceFormat as any).formatter(val)
            : val.toFixed(2);
          values.push(fmt);
        }
      });

      if (values.length === 0) {
        tooltip.style.display = "none";
        return;
      }

      const dateStr = typeof param.time === "string"
        ? param.time
        : new Date((param.time as number) * 1000).toLocaleDateString();

      tooltip.innerHTML = `<div>${dateStr}</div><div>${values.join(" / ")}</div>`;
      tooltip.style.display = "block";

      const x = param.point.x;
      const y = param.point.y;
      const containerWidth = containerRef.current?.clientWidth ?? 0;
      const tooltipWidth = tooltip.offsetWidth;
      const left = x + tooltipWidth + 20 > containerWidth ? x - tooltipWidth - 10 : x + 10;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(0, y - 30)}px`;
    });

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      tooltip.remove();
      chart.remove();
      chartRef.current = null;
    };
  }, [height, children]);

  return <div ref={containerRef} className={className} />;
}
