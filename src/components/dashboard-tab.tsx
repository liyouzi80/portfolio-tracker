"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoldingsTable } from "./holdings-table";
import { NetValueChart } from "./net-value-chart";
import { AllocationPie } from "./allocation-pie";
import { ProfitCurve } from "./profit-curve";
import { DashboardSkeleton } from "./loading-skeleton";
import { EmptyState } from "./empty-state";
import { Plus } from "lucide-react";

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
  prevClose?: number;
  pnl?: number;
  pnlPct?: number;
  todayPnl?: number;
  pnlInBase?: number;
  todayPnlInBase?: number;
  marketValueInBase?: number;
}

interface ChartPoint { date: string; value: number; }

interface AccountSummary {
  id: string;
  name: string;
  currency: string;
  totalCost: number;
  totalMarketValue?: number;
  totalPnl?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  holdings: Holding[];
}

interface PortfolioData {
  baseCurrency: string;
  totalValue: number;
  totalMarketValue?: number;
  totalPnl?: number;
  todayPnl?: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  accounts: AccountSummary[];
  holdings: Holding[];
  costSeries?: ChartPoint[];
  valueSeries?: ChartPoint[];
  pnlSeries?: ChartPoint[];
  chartData?: ChartPoint[];
  rates: Record<string, number>;
}

const currencySymbols: Record<string, string> = { CNY: "¥", USD: "$", HKD: "HK$", JPY: "¥" };
const marketLabels: Record<string, string> = { US: "美股", HK: "港股", CN: "A股", JP: "日股", KR: "韩股", GB: "英股", DE: "德股", CH: "瑞士", CA: "加股", AU: "澳股", TW: "台股", IN: "印度" };
const marketColors: Record<string, string> = { US: "#3b82f6", HK: "#ef4444", CN: "#f59e0b", JP: "#ec4899", KR: "#8b5cf6", GB: "#06b6d4", DE: "#10b981", CH: "#f97316", CA: "#14b8a6", AU: "#6366f1", TW: "#84cc16", IN: "#d946ef" };

const BASE_CURRENCY = "USD"; // single source of truth across the dashboard

function fmtMoney(amount: number, symbol: string): string {
  const sign = amount < 0 ? "-" : amount > 0 ? "+" : "";
  return `${sign}${symbol}${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function MetricCard({ label, value, sub, color, delay }: { label: string; value: string; sub?: string; color?: "green" | "red" | "neutral"; delay: number }) {
  const colorClass = color === "green" ? "text-emerald-400" : color === "red" ? "text-red-400" : "";
  const subClass = color === "green" ? "text-emerald-500/70" : color === "red" ? "text-red-500/70" : "text-zinc-600";
  return (
    <Card className={`stagger-${delay} t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-normal tracking-wide text-zinc-500 uppercase">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tracking-tight font-mono tabular-nums ${colorClass}`}>
          {value}
        </div>
        {sub && <div className={`text-xs mt-1 font-mono ${subClass}`}>{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function DashboardTab({ visible, onAddTransaction }: { visible: boolean; onAddTransaction?: () => void }) {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const r = await fetch(`/api/portfolio?baseCurrency=${BASE_CURRENCY}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json() as PortfolioData;
      if (!d.holdings) throw new Error("Invalid response");
      setData(d);
      setError(null);
    } catch {
      setData((prev) => {
        if (!prev) setError("加载失败");
        return prev;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Re-fetch when tab becomes visible
  useEffect(() => {
    if (visible && !loading) loadData();
  }, [visible, loading, loadData]);

  if (loading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <EmptyState
        title={error || "暂无数据"}
        description="添加账户和交易记录后，资产总览将显示在这里"
        action={onAddTransaction ? <button onClick={onAddTransaction} className="inline-flex items-center gap-1 text-sm text-emerald-400 hover:text-emerald-300"><Plus className="h-4 w-4" />新增交易</button> : undefined}
      />
    );
  }

  const cs = currencySymbols[data.baseCurrency] ?? data.baseCurrency;

  // All numbers below are already in baseCurrency (computed server-side).
  const totalCost = data.totalValue;                    // cumulative net invested
  const totalMarketValue = data.totalMarketValue ?? totalCost;
  const totalPnl = data.totalPnl ?? 0;                  // realized + unrealized
  const todayPnl = data.todayPnl ?? 0;                  // (price - prevClose) * qty
  const realizedPnl = data.realizedPnl ?? 0;
  const unrealizedPnl = data.unrealizedPnl ?? 0;

  const holdingsCount = data.holdings.length;
  const markets = new Set(data.holdings.map((h) => h.market));
  const marketCount = markets.size;

  const pnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const todayPnlPct = totalMarketValue > 0
    ? (todayPnl / (totalMarketValue - todayPnl)) * 100
    : 0;

  // Allocation by market — convert each holding's market value to baseCurrency
  const allocationMap = new Map<string, number>();
  for (const h of data.holdings) {
    const mv = h.marketValueInBase ?? 0;
    allocationMap.set(h.market, (allocationMap.get(h.market) ?? 0) + mv);
  }
  const allocationData = Array.from(allocationMap.entries())
    .filter(([, v]) => v > 0)
    .map(([market, value]) => ({
      name: marketLabels[market] ?? market,
      value: Math.round(value * 100) / 100,
      color: marketColors[market] ?? "#71717a",
    }));

  // Chart data: prefer real series, fall back to costSeries placeholder
  const valueSeries = data.valueSeries && data.valueSeries.length > 0
    ? data.valueSeries
    : (data.costSeries ?? []);
  const pnlSeries = data.pnlSeries && data.pnlSeries.length > 0
    ? data.pnlSeries
    : []; // empty triggers ProfitCurve's empty state

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 md:gap-3">
        <MetricCard
          label="总市值"
          value={`${cs}${totalMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sub={`成本 ${cs}${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          color="neutral"
          delay={1}
        />
        <MetricCard
          label="今日盈亏"
          value={data.todayPnl !== undefined && data.holdings.some(h => h.prevClose) ? fmtMoney(todayPnl, cs) : "--"}
          sub={data.holdings.some(h => h.prevClose) ? `${todayPnlPct >= 0 ? "+" : ""}${todayPnlPct.toFixed(2)}%` : "等待行情数据"}
          color={todayPnl > 0 ? "green" : todayPnl < 0 ? "red" : "neutral"}
          delay={2}
        />
        <MetricCard
          label="累计盈亏"
          value={fmtMoney(totalPnl, cs)}
          sub={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`}
          color={totalPnl > 0 ? "green" : totalPnl < 0 ? "red" : "neutral"}
          delay={3}
        />
        <MetricCard
          label="持仓"
          value={holdingsCount.toString()}
          sub={`${marketCount} 个市场`}
          delay={4}
        />
        <MetricCard
          label="已实现盈亏"
          value={realizedPnl !== 0 ? fmtMoney(realizedPnl, cs) : "--"}
          sub={`浮动 ${fmtMoney(unrealizedPnl, cs)}`}
          color={realizedPnl > 0 ? "green" : realizedPnl < 0 ? "red" : "neutral"}
          delay={5}
        />
      </div>

      {/* Per-account totals */}
      {data.accounts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 md:gap-3">
          {data.accounts.map((a) => (
            <Card key={a.id} className="t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <CardContent className="py-3">
                <p className="text-xs text-zinc-500">{a.name}</p>
                <p className="text-lg font-mono font-bold">
                  {currencySymbols[a.currency] ?? a.currency + " "}{(a.totalMarketValue ?? a.totalCost).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </p>
                <p className={`text-xs font-mono ${(a.totalPnl ?? 0) > 0 ? "text-emerald-400/80" : (a.totalPnl ?? 0) < 0 ? "text-red-400/80" : "text-zinc-600"}`}>
                  {a.totalPnl !== undefined ? fmtMoney(a.totalPnl, currencySymbols[a.currency] ?? "") : `${a.holdings.length} 个标的`}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Profit curve */}
      <Card className="stagger-6 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-medium tracking-wide">盈亏走势</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfitCurve data={pnlSeries} currency={cs} />
        </CardContent>
      </Card>

      {/* Net value + Allocation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-2 stagger-7 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium tracking-wide">净值曲线</CardTitle>
          </CardHeader>
          <CardContent>
            <NetValueChart data={valueSeries} currency={cs} />
          </CardContent>
        </Card>

        <Card className="stagger-7 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium tracking-wide">资产配置</CardTitle>
          </CardHeader>
          <CardContent>
            <AllocationPie data={allocationData} currency={cs} />
          </CardContent>
        </Card>
      </div>

      {/* Holdings */}
      <Card className="stagger-8 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium tracking-wide">持仓明细</CardTitle>
            {onAddTransaction && (
              <button onClick={onAddTransaction} className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                <Plus className="h-3.5 w-3.5" />新增交易
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <HoldingsTable data={data.holdings} onSymbolClick={() => onAddTransaction?.()} />
        </CardContent>
      </Card>
    </div>
  );
}
