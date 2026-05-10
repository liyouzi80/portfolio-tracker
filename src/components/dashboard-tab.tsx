"use client";

import { useState, useEffect, useCallback } from "react";
import { HoldingsTable } from "./holdings-table";
import { NetValueChart } from "./net-value-chart";
import { AllocationPie } from "./allocation-pie";
import { ProfitCurve } from "./profit-curve";
import { DashboardSkeleton } from "./loading-skeleton";
import { EmptyState } from "./empty-state";
import { Plus, TrendingUp, TrendingDown, Wallet, PiggyBank, Layers } from "lucide-react";

interface Holding {
  assetId: string; symbol: string; name: string; market: string; currency: string;
  quantity: number; totalCost: number; totalFee: number; avgCost: number;
  currentPrice?: number; prevClose?: number; pnl?: number; pnlPct?: number;
  todayPnl?: number; pnlInBase?: number; todayPnlInBase?: number; marketValueInBase?: number;
  priceUpdatedAt?: number;
}
interface ChartPoint { date: string; value: number; }
interface AccountSummary {
  id: string; name: string; currency: string; leverage?: number; totalCost: number;
  totalMarketValue?: number; totalPnl?: number; realizedPnl?: number; tradingPnl?: number; dividendIncome?: number; unrealizedPnl?: number; holdings: Holding[];
}
interface PortfolioData {
  baseCurrency: string; totalValue: number; totalMarketValue?: number; totalPnl?: number;
  todayPnl?: number; realizedPnl?: number; tradingPnl?: number; dividendIncome?: number; unrealizedPnl?: number;
  accounts: AccountSummary[]; holdings: Holding[];
  costSeries?: ChartPoint[]; valueSeries?: ChartPoint[]; pnlSeries?: ChartPoint[];
  chartData?: ChartPoint[]; rates: Record<string, number>;
}

const currencySymbols: Record<string, string> = { CNY: "¥", USD: "$", HKD: "HK$", JPY: "¥" };
const marketLabels: Record<string, string> = { US: "美股", HK: "港股", CN: "A股", JP: "日股", KR: "韩股", GB: "英股", DE: "德股", CH: "瑞士", CA: "加股", AU: "澳股", TW: "台股", IN: "印度" };
const marketColors: Record<string, string> = { US: "#3b82f6", HK: "#ef4444", CN: "#f59e0b", JP: "#ec4899", KR: "#8b5cf6", GB: "#06b6d4", DE: "#10b981", CH: "#f97316", CA: "#14b8a6", AU: "#6366f1", TW: "#84cc16", IN: "#d946ef" };

const BASE_CURRENCY = "USD";

function fmtMoney(amount: number, symbol: string): string {
  const sign = amount < 0 ? "-" : amount > 0 ? "+" : "";
  return `${sign}${symbol}${Math.abs(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// ── KPI Card ──────────────────────────────────────────────
function MetricCard({
  label, value, sub, sentiment, delay, icon: Icon,
}: {
  label: string; value: string; sub?: string;
  sentiment?: "up" | "down" | "neutral";
  delay: number; icon?: React.ComponentType<{ className?: string }>;
}) {
  const accent = sentiment === "up" ? "before:bg-emerald-400" : sentiment === "down" ? "before:bg-red-400" : "before:bg-zinc-500";
  const valueColor = sentiment === "up" ? "text-emerald-300" : sentiment === "down" ? "text-red-300" : "text-zinc-100";
  const subColor = sentiment === "up" ? "text-emerald-500/60" : sentiment === "down" ? "text-red-500/60" : "text-zinc-500";
  const glow = sentiment === "up" ? "hover:shadow-emerald-500/5" : sentiment === "down" ? "hover:shadow-red-500/5" : "hover:shadow-white/5";

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.015] backdrop-blur-sm
        before:absolute before:top-0 before:left-0 before:right-0 before:h-px ${accent}
        hover:border-white/[0.1] hover:bg-white/[0.025] hover:shadow-xl ${glow}
        transition-all duration-500 cursor-default
        group`}
      style={{ animationDelay: `${delay * 60}ms` }}
    >
      <div className="px-4 py-3.5">
        <div className="flex items-center gap-2 mb-2">
          {Icon && <Icon className="h-3.5 w-3.5 text-zinc-500" />}
          <span className="text-[11px] font-medium tracking-[0.15em] uppercase text-zinc-500">{label}</span>
        </div>
        <div className={`text-2xl font-bold tracking-tight font-mono tabular-nums ${valueColor}`}>
          {value}
        </div>
        {sub && (
          <div className={`text-[11px] mt-1.5 font-mono tabular-nums ${subColor} transition-colors`}>
            {sub}
          </div>
        )}
      </div>
      {/* Subtle corner shimmer */}
      <div className="absolute -top-10 -right-10 w-20 h-20 bg-white/[0.01] rounded-full blur-xl group-hover:bg-white/[0.03] transition-colors duration-700" />
    </div>
  );
}
// ── Dashboard ──────────────────────────────────────────────
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
      setData(d); setError(null);
    } catch {
      setData((prev) => { if (!prev) setError("加载失败"); return prev; });
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (visible && !loading) loadData(); }, [visible, loading, loadData]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => loadData(), 60_000);
    return () => clearInterval(id);
  }, [visible, loadData]);

  if (loading) return <DashboardSkeleton />;

  if (error || !data) {
    return (
      <EmptyState
        title={error || "暂无数据"}
        description="添加账户和交易记录后，资产总览将显示在这里"
        action={onAddTransaction ? <button onClick={onAddTransaction} className="inline-flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 transition-colors"><Plus className="h-4 w-4" />新增交易</button> : undefined}
      />
    );
  }

  const cs = currencySymbols[data.baseCurrency] ?? data.baseCurrency;
  const totalCost = data.totalValue;
  const totalMarketValue = data.totalMarketValue ?? totalCost;
  const totalPnl = data.totalPnl ?? 0;
  const todayPnl = data.todayPnl ?? 0;
  const realizedPnl = data.realizedPnl ?? 0;
  const tradingPnl = data.tradingPnl ?? 0;
  const dividendIncome = data.dividendIncome ?? 0;
  const unrealizedPnl = data.unrealizedPnl ?? 0;
  const holdingsCount = data.holdings.length;
  const markets = new Set(data.holdings.map((h) => h.market));
  const marketCount = markets.size;
  const pnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const todayPnlPct = totalMarketValue > 0 ? (todayPnl / (totalMarketValue - todayPnl)) * 100 : 0;
  const isToday = (ts?: number) => {
    if (!ts) return false;
    return new Date(ts).toDateString() === new Date().toDateString();
  };
  const withPrev = data.holdings.filter(h => h.prevClose && isToday(h.priceUpdatedAt)).length;
  const totalHold = data.holdings.length;
  const hasPrices = withPrev > 0;
  const partialPrices = withPrev < totalHold;

  const allocationMap = new Map<string, number>();
  for (const h of data.holdings) {
    const mv = h.marketValueInBase ?? 0;
    allocationMap.set(h.market, (allocationMap.get(h.market) ?? 0) + mv);
  }
  const allocationData = Array.from(allocationMap.entries())
    .filter(([, v]) => v > 0)
    .map(([market, value]) => ({ name: marketLabels[market] ?? market, value: Math.round(value * 100) / 100, color: marketColors[market] ?? "#71717a" }));

  const valueSeries = data.valueSeries && data.valueSeries.length > 0 ? data.valueSeries : (data.costSeries ?? []);
  const pnlSeries = data.pnlSeries && data.pnlSeries.length > 0 ? data.pnlSeries : [];

  return (
    <div className="space-y-4">
      {/* ── KPI Row ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="总市值" icon={Wallet}
          value={`${cs}${totalMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sub={`成本 ${cs}${totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sentiment="neutral" delay={1} />
        <MetricCard label="今日盈亏" icon={todayPnl >= 0 ? TrendingUp : TrendingDown}
          value={hasPrices ? fmtMoney(todayPnl, cs) : "--"}
          sub={hasPrices ? `${todayPnlPct >= 0 ? "+" : ""}${todayPnlPct.toFixed(2)}%${partialPrices ? ` (${withPrev}/${totalHold})` : ""}` : "等待行情数据"}
          sentiment={todayPnl > 0 ? "up" : todayPnl < 0 ? "down" : "neutral"} delay={2} />
        <MetricCard label="累计盈亏" icon={PiggyBank}
          value={fmtMoney(totalPnl, cs)}
          sub={`${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`}
          sentiment={totalPnl > 0 ? "up" : totalPnl < 0 ? "down" : "neutral"} delay={3} />
        <MetricCard label="持仓标的" icon={Layers}
          value={holdingsCount.toString()}
          sub={`${marketCount} 个市场`}
          sentiment="neutral" delay={4} />
        <MetricCard label="已实现盈亏"
          value={realizedPnl !== 0 ? fmtMoney(realizedPnl, cs) : "--"}
          sub={`交易 ${fmtMoney(tradingPnl, cs)} · 股息 ${fmtMoney(dividendIncome, cs)}`}
          sentiment={realizedPnl > 0 ? "up" : realizedPnl < 0 ? "down" : "neutral"} delay={5} />
      </div>

      {/* ── Account Cards ───────────────────────────────── */}
      {data.accounts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.accounts.map((a, i) => {
            const pnl = a.totalPnl ?? 0;
            const pnlSentiment = pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-red-400" : "text-zinc-500";
            return (
              <div key={a.id}
                className="relative overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.01] px-4 py-3
                  hover:border-white/[0.08] hover:bg-white/[0.02] transition-all duration-300 group cursor-default"
                style={{ animationDelay: `${(i + 1) * 50}ms` }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-zinc-400">{a.name}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">{a.currency}</span>
                </div>
                <div className="text-lg font-mono font-bold text-zinc-100 tabular-nums">
                  {currencySymbols[a.currency] ?? a.currency + " "}{(a.totalMarketValue ?? a.totalCost).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className={`text-[11px] font-mono mt-1 ${pnlSentiment}`}>
                  {fmtMoney(pnl, currencySymbols[a.currency] ?? "")}
                </div>
                {a.totalCost > 0 && (
                  <div className={`text-[10px] font-mono mt-0.5 ${
                    a.leverage && ((a.totalMarketValue ?? a.totalCost) / a.totalCost) > a.leverage ? "text-red-400" : "text-zinc-500"
                  }`}>
                    市值倍率 {((a.totalMarketValue ?? a.totalCost) / a.totalCost).toFixed(2)}x
                    {a.leverage && a.leverage > 1 ? ` / 上限 ${a.leverage}x` : ""}
                  </div>
                )}
                <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-white/[0.005] rounded-full blur-md group-hover:bg-white/[0.02] transition-colors duration-500" />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Profit Curve ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border border-white/[0.05] bg-gradient-to-b from-white/[0.015] to-transparent">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        <div className="px-5 pt-5 pb-1 flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-zinc-200 tracking-wide">盈亏走势</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">累计浮动盈亏曲线</p>
          </div>
        </div>
        <div className="px-1 pb-3">
          <ProfitCurve data={pnlSeries} currency={cs} />
        </div>
      </div>

      {/* ── Net Value + Allocation ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 relative overflow-hidden rounded-xl border border-white/[0.05] bg-gradient-to-b from-white/[0.015] to-transparent">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
          <div className="px-5 pt-5 pb-1">
            <h3 className="text-[13px] font-semibold text-zinc-200 tracking-wide">净值曲线</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">组合净资产历史走势</p>
          </div>
          <div className="px-1 pb-3">
            <NetValueChart data={valueSeries} currency={cs} />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-white/[0.05] bg-gradient-to-b from-white/[0.015] to-transparent">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          <div className="px-5 pt-5 pb-1">
            <h3 className="text-[13px] font-semibold text-zinc-200 tracking-wide">资产配置</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">按市场分布</p>
          </div>
          <div className="pb-3">
            <AllocationPie data={allocationData} currency={cs} />
          </div>
        </div>
      </div>

      {/* ── Holdings Table ────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-xl border border-white/[0.05] bg-gradient-to-b from-white/[0.015] to-transparent">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-500/20 to-transparent" />
        <div className="px-5 pt-5 pb-1 flex items-center justify-between">
          <div>
            <h3 className="text-[13px] font-semibold text-zinc-200 tracking-wide">持仓明细</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">{holdingsCount} 个标的 · {marketCount} 个市场</p>
          </div>
          {onAddTransaction && (
            <button onClick={onAddTransaction}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400
                hover:text-amber-300 transition-colors px-2.5 py-1.5 rounded-lg
                border border-white/[0.04] hover:border-amber-500/20 hover:bg-amber-500/5">
              <Plus className="h-3.5 w-3.5" />新增交易
            </button>
          )}
        </div>
        <div className="px-2 pb-4">
          <HoldingsTable data={data.holdings} onSymbolClick={() => onAddTransaction?.()} />
        </div>
      </div>

      {/* ── Attribution (license requirement) ────────────── */}
      <p className="text-center text-[10px] text-zinc-600 pb-2">
        Charts powered by <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer" className="hover:text-zinc-500 transition-colors">TradingView</a>
      </p>
    </div>
  );
}
