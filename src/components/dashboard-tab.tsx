"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoldingsTable } from "./holdings-table";
import { NetValueChart } from "./net-value-chart";
import { AllocationPie } from "./allocation-pie";
import { ProfitCurve } from "./profit-curve";

const mockPortfolio = {
  baseCurrency: "CNY",
  totalValue: 285000,
  holdings: [
    { assetId: "1", symbol: "AAPL", name: "Apple Inc.", market: "US", currency: "USD", quantity: 50, avgCost: 175, totalCost: 8750 },
    { assetId: "2", symbol: "0700", name: "腾讯控股", market: "HK", currency: "HKD", quantity: 500, avgCost: 380, totalCost: 190000 },
    { assetId: "3", symbol: "600519", name: "贵州茅台", market: "CN", currency: "CNY", quantity: 100, avgCost: 1780, totalCost: 178000 },
    { assetId: "4", symbol: "TSLA", name: "Tesla Inc.", market: "US", currency: "USD", quantity: 30, avgCost: 240, totalCost: 7200 },
  ],
};

function MetricCard({ label, value, sub, accent, delay }: { label: string; value: string; sub?: string; accent?: boolean; delay: number }) {
  return (
    <Card className={`stagger-${delay} t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-normal tracking-wide text-zinc-500 uppercase">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tracking-tight font-mono tabular-nums ${accent ? 'text-emerald-400' : ''}`}>
          {value}
        </div>
        {sub && <div className={`text-xs mt-1 font-mono ${accent ? 'text-emerald-500/70' : 'text-zinc-600'}`}>{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function DashboardTab() {
  const totalPL = useMemo(() => {
    const currentTotal = 312000;
    return { value: currentTotal - mockPortfolio.totalValue, pct: ((currentTotal - mockPortfolio.totalValue) / mockPortfolio.totalValue * 100).toFixed(2) };
  }, []);

  const ytdValue = useMemo(() => ({ value: 48500, pct: "20.51" }), []);

  return (
    <div className="space-y-5">
      {/* Row 1: Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="总资产" value="¥285,000" sub="≈ $39,490 USD" delay={1} />
        <MetricCard label="今日盈亏" value="+¥2,340" sub="+0.82%" accent delay={2} />
        <MetricCard label="YTD 收益" value={`+¥${ytdValue.value.toLocaleString()}`} sub={`+${ytdValue.pct}%`} accent delay={3} />
        <MetricCard label="累计盈亏" value={`+¥${totalPL.value.toLocaleString()}`} sub={`+${totalPL.pct}%`} accent delay={4} />
        <MetricCard label="持仓数量" value="4" sub="3 个市场" delay={5} />
      </div>

      {/* Row 2: Profit curve (full width) */}
      <Card className="stagger-6 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-medium tracking-wide">盈亏走势</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfitCurve />
        </CardContent>
      </Card>

      {/* Row 3: Net value + Allocation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="stagger-7 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium tracking-wide">净值曲线</CardTitle>
          </CardHeader>
          <CardContent>
            <NetValueChart />
          </CardContent>
        </Card>

        <Card className="stagger-7 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium tracking-wide">资产配置</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationPie />
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Holdings table */}
      <Card className="stagger-8 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium tracking-wide">持仓明细</CardTitle>
        </CardHeader>
        <CardContent>
          <HoldingsTable data={mockPortfolio.holdings} />
        </CardContent>
      </Card>
    </div>
  );
}
