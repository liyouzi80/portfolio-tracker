"use client";

import { useState, useEffect } from "react";
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
}

interface AccountSummary {
  id: string;
  name: string;
  currency: string;
  totalCost: number;
  holdings: Holding[];
}

interface PortfolioData {
  baseCurrency: string;
  totalValue: number;
  accounts: AccountSummary[];
  holdings: Holding[];
  rates: Record<string, number>;
}

const currencySymbols: Record<string, string> = { CNY: "¥", USD: "$", HKD: "HK$" };
const marketLabels: Record<string, string> = { US: "美股", HK: "港股", CN: "A股" };
const marketColors: Record<string, string> = { US: "#3b82f6", HK: "#f59e0b", CN: "#ef4444" };

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
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/portfolio?baseCurrency=CNY")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PortfolioData>;
      })
      .then((d) => {
        if (!d.holdings) throw new Error("Invalid response");
        setData(d);
        setLoading(false);
      })
      .catch(() => { setError("加载失败"); setLoading(false); });
  }, []);

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

  const totalValue = data.totalValue;
  const holdingsCount = data.holdings.length;
  const markets = new Set(data.holdings.map((h) => h.market));
  const marketCount = markets.size;

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
        <MetricCard label="总资产" value={`¥${totalValue.toLocaleString()}`} sub="成本计价 (CNY)" delay={1} />
        <MetricCard label="今日盈亏" value="--" sub="需接入实时价格" delay={2} />
        <MetricCard label="YTD 收益" value="--" sub="需接入实时价格" delay={3} />
        <MetricCard label="累计盈亏" value="--" sub="需接入实时价格" accent delay={4} />
        <MetricCard label="持仓数量" value={holdingsCount.toString()} sub={`${marketCount} 个市场`} delay={5} />
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
          <ProfitCurve data={[]} />
        </CardContent>
      </Card>

      {/* Row 3: Net value + Allocation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="md:col-span-2 stagger-7 t-card border-white/[0.06] bg-white/[0.02] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium tracking-wide">净值曲线</CardTitle>
          </CardHeader>
          <CardContent>
            <NetValueChart data={[]} />
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
