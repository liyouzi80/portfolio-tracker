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
      rightPriceScale: { borderColor: "rgba(63,63,70,0.3)", visible: false },
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

    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [height, children]);

  return <div ref={containerRef} className={className} />;
}
