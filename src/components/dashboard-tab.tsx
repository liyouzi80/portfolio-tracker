"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoldingsTable } from "./holdings-table";
import { NetValueChart } from "./net-value-chart";
import { AllocationPie } from "./allocation-pie";
import { ProfitCurve } from "./profit-curve";
import { Loader2 } from "lucide-react";

interface Holding {
  assetId: string;
  symbol: string;
  name: string;
  market: string;
  currency: string;
  quantity: number;
  totalCost: number;
  totalFee: number;
  avgCost: number;
  currentPrice?: number;
  pnl?: number;
  pnlPct?: number;
}

interface ChartPoint { date: string; value: number; }

interface AccountSummary {
  id: string;
  name: string;
  currency: string;
  totalCost: number;
  totalMarketValue?: number;
  totalPnl?: number;
  holdings: Holding[];
}

interface PortfolioData {
  baseCurrency: string;
  totalValue: number;
  totalMarketValue?: number;
  totalPnl?: number;
  accounts: AccountSummary[];
  holdings: Holding[];
  chartData?: ChartPoint[];
  rates: Record<string, number>;
}

const currencySymbols: Record<string, string> = { CNY: "¥", USD: "$", HKD: "HK$" };
const marketLabels: Record<string, string> = { US: "美股", HK: "港股", CN: "A股" };
const marketColors: Record<string, string> = { US: "#6366f1", HK: "#8b5cf6", CN: "#06b6d4" };

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

export function DashboardTab({ visible }: { visible: boolean }) {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const r = await fetch("/api/portfolio?baseCurrency=USD");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as PortfolioData;
      if (!d.holdings) throw new Error("Invalid response");
      setData(d);
      setError(null);
    } catch { if (!data) setError("加载失败"); }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Re-fetch when tab becomes visible (without remount)
  useEffect(() => {
    if (visible && !loading) loadData();
  }, [visible]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return <p className="text-zinc-500 text-sm text-center py-20">{error || "暂无数据"}</p>;
  }

  const cs = currencySymbols[data.baseCurrency] ?? data.baseCurrency;
  const totalValue = data.totalValue;
  const totalPnl = data.totalPnl ?? 0;
  const totalMarketValue = data.totalMarketValue ?? totalValue;
  const holdingsCount = data.holdings.length;
  const markets = new Set(data.holdings.map((h) => h.market));
  const marketCount = markets.size;

  // Calculate today's P&L approximation from holdings with current prices
  const holdingsWithPnl = data.holdings.filter(h => h.pnl !== undefined);
  const todayPnl = holdingsWithPnl.reduce((sum, h) => sum + (h.pnl ?? 0), 0);
  const pnlSign = totalPnl >= 0 ? "+" : "";

  // Build allocation data from holdings grouped by market
  const allocationMap = new Map<string, number>();
  for (const h of data.holdings) {
    const marketTotal = allocationMap.get(h.market) ?? 0;
    allocationMap.set(h.market, marketTotal + h.totalCost);
  }
  const allocationData = Array.from(allocationMap.entries()).map(([market, value]) => ({
    name: marketLabels[market] ?? market,
    value,
    color: marketColors[market] ?? "#71717a",
  }));

  return (
    <div className="space-y-5">
      {/* Row 1: Overall metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
        <MetricCard label="总资产" value={`${cs}${totalMarketValue.toLocaleString()}`} sub={`成本 ${cs}${totalValue.toLocaleString()}`} delay={1} />
        <MetricCard label="今日盈亏" value={todayPnl !== 0 ? `${pnlSign}${cs}${Math.abs(todayPnl).toLocaleString()}` : "--"} sub={todayPnl !== 0 ? "基于最新价格" : "价格数据更新中"} delay={2} />
        <MetricCard label="持仓盈亏" value={totalPnl !== 0 ? `${pnlSign}${cs}${Math.abs(totalPnl).toLocaleString()}` : "--"} sub={totalPnl !== 0 ? "浮动盈亏" : "添加价格数据后计算"} accent delay={3} />
        <MetricCard label="持仓数量" value={holdingsCount.toString()} sub={`${marketCount} 个市场`} delay={4} />
        <MetricCard label="今日估值" value={`${cs}${totalMarketValue.toLocaleString()}`} sub="基于最新行情" delay={5} />
      </div>

      {/* Row 1.5: Per-account totals */}
      {data.accounts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
          {data.accounts.map((a) => (
            <Card key={a.id} className="t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <CardContent className="py-3">
                <p className="text-xs text-zinc-500">{a.name}</p>
                <p className="text-lg font-mono font-bold">
                  {currencySymbols[a.currency] ?? a.currency + " "}{a.totalCost.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-600">{a.holdings.length} 个标的</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Row 2: Profit curve (full width) */}
      <Card className="stagger-6 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-medium tracking-wide">盈亏走势</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfitCurve data={data.chartData ?? []} />
        </CardContent>
      </Card>

      {/* Row 3: Net value + Allocation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-2 stagger-7 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium tracking-wide">净值曲线</CardTitle>
          </CardHeader>
          <CardContent>
            <NetValueChart data={data.chartData ?? []} />
          </CardContent>
        </Card>

        <Card className="stagger-7 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium tracking-wide">资产配置</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationPie data={allocationData} />
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Holdings table */}
      <Card className="stagger-8 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium tracking-wide">持仓明细</CardTitle>
        </CardHeader>
        <CardContent>
          <HoldingsTable data={data.holdings} />
        </CardContent>
      </Card>
    </div>
  );
}
