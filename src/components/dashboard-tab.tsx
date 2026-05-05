"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoldingsTable } from "./holdings-table";
import { NetValueChart } from "./net-value-chart";
import { AllocationPie } from "./allocation-pie";

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

export function DashboardTab() {
  const totalPL = useMemo(() => {
    const currentTotal = 312000;
    return { value: currentTotal - mockPortfolio.totalValue, pct: ((currentTotal - mockPortfolio.totalValue) / mockPortfolio.totalValue * 100).toFixed(2) };
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-zinc-400">总资产</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">¥285,000</div>
            <div className="text-xs text-zinc-500 mt-1">≈ $39,490 USD</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-zinc-400">今日盈亏</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-emerald-400">+¥2,340</div>
            <div className="text-xs text-emerald-500/70 mt-1">+0.82%</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-zinc-400">累计盈亏</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-emerald-400">
              +¥{totalPL.value.toLocaleString()}
            </div>
            <div className="text-xs text-emerald-500/70 mt-1">+{totalPL.pct}%</div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-normal text-zinc-400">持仓数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">4</div>
            <div className="text-xs text-zinc-500 mt-1">3 个市场</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-2 bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium">净值曲线</CardTitle>
          </CardHeader>
          <CardContent>
            <NetValueChart />
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-medium">资产配置</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationPie />
          </CardContent>
        </Card>
      </div>

      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm font-medium">持仓明细</CardTitle>
        </CardHeader>
        <CardContent>
          <HoldingsTable data={mockPortfolio.holdings} />
        </CardContent>
      </Card>
    </div>
  );
}
