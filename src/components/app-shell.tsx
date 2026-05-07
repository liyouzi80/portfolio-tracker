"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardTab } from "./dashboard-tab";
import { TransactionsTab } from "./transactions-tab";
import { SettingsTab } from "./settings-tab";
import { Button } from "@/components/ui/button";
import { PriceTicker } from "./price-ticker";
import { LoginScreen } from "./login-screen";
import { Toaster } from "@/components/ui/sonner";
import { LogOut, Sun, Moon, RefreshCw } from "lucide-react";
import { usePortfolioSummary } from "./use-portfolio-summary";
import type { PortfolioSummaryHolding } from "./use-portfolio-summary";
import { toast } from "sonner";

function MarketDataStatus({ holdings, onRefresh, refreshing }: { holdings: PortfolioSummaryHolding[]; onRefresh: () => void; refreshing: boolean }) {
  if (holdings.length === 0) return null;

  const total = holdings.length;
  const FRESH_MS = 35 * 60 * 1000;
  const isFresh = (h: PortfolioSummaryHolding) => typeof h.priceUpdatedAt === "number" && h.priceUpdatedAt > 0 && Date.now() - h.priceUpdatedAt < FRESH_MS;
  const fresh = holdings.filter(isFresh).length;

  const validTimestamps = holdings
    .map(h => h.priceUpdatedAt)
    .filter((t): t is number => typeof t === "number" && t > 0);
  const latestUpdate = validTimestamps.length > 0 ? Math.max(...validTimestamps) : null;

  const minutesAgo = latestUpdate !== null ? Math.floor((Date.now() - latestUpdate) / 60000) : null;
  const timeColor = minutesAgo === null
    ? "text-zinc-300"
    : minutesAgo > 240 ? "text-red-400"
    : minutesAgo > 60 ? "text-amber-400"
    : "text-zinc-300";

  const missingSymbols = holdings
    .filter(h => !isFresh(h))
    .map(h => h.symbol);
  const missingTitle = missingSymbols.length > 0
    ? `超过 35 分钟未更新：${missingSymbols.join("、")}`
    : undefined;

  return (
    <div className="hidden md:flex items-center gap-1.5 text-xs text-zinc-500">
      {latestUpdate !== null && (
        <>
          <span className="text-zinc-500">行情时间</span>
          <span
            className={`font-mono tabular-nums ${timeColor}`}
            title={minutesAgo !== null ? `${minutesAgo} 分钟前更新` : undefined}
          >
            {new Date(latestUpdate).toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}
          </span>
          <span className="text-zinc-500">·</span>
          <span className="text-zinc-500">更新持仓</span>
          <span
            className={`font-mono tabular-nums ${fresh < total ? "text-amber-400 cursor-help" : "text-zinc-300"}`}
            title={missingTitle}
          >
            {fresh}/{total}
          </span>
        </>
      )}
      {latestUpdate === null && <span>暂无行情</span>}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="inline-flex items-center justify-center h-6 w-6 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
        title="手动刷新行情"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}

export function AppShell() {
  const [tab, setTab] = useState("dashboard");
  const [openAddSheet, setOpenAddSheet] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const handleAddTransaction = useCallback(() => {
    setTab("transactions");
    setOpenAddSheet(true);
  }, []);
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("theme") !== "light";
  });

  const toggleTheme = useCallback(() => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  }, [isDark]);

  const handleUnlock = useCallback(() => setUnlocked(true), []);

  // Alert polling + browser notifications
  const [pendingAlerts, setPendingAlerts] = useState(0);
  const lastTriggeredIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!unlocked) return;
    // Request notification permission
    import("@/lib/notifications").then(({ ensureNotificationPermission }) => {
      ensureNotificationPermission();
    });

    const checkAlerts = async () => {
      try {
        const r = await fetch("/api/alerts");
        if (!r.ok) return;
        const data = await r.json() as Array<{ id: string; symbol: string; conditionType: string; threshold: number; triggeredAt: string | null }>;
        const triggered = data.filter(a => a.triggeredAt);
        setPendingAlerts(triggered.length);

        // Notify for newly triggered alerts (skip first load to avoid spam)
        const seeded = sessionStorage.getItem("alerts-seeded");
        if (seeded) {
          const newOnes = triggered.filter(a => !lastTriggeredIds.current.has(a.id));
          const { notifyAlert } = await import("@/lib/notifications");
          for (const a of newOnes) {
            notifyAlert(a.symbol, a.conditionType, a.threshold);
          }
        }
        lastTriggeredIds.current = new Set(triggered.map(a => a.id));
        sessionStorage.setItem("alerts-seeded", "1");
      } catch { /* ignore */ }
    };

    checkAlerts();
    const id = setInterval(checkAlerts, 60_000);
    return () => clearInterval(id);
  }, [unlocked]);

  const handleLogout = useCallback(() => {
    if (!confirm("确认退出登录？")) return;
    sessionStorage.removeItem("alerts-seeded");
    lastTriggeredIds.current = new Set();
    fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    }).then(() => {
      setUnlocked(false);
      toast.success("已退出登录");
    }).catch(() => toast.error("退出失败"));
  }, []);

  const { holdings, reload: reloadSummary } = usePortfolioSummary(unlocked);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/refresh", { method: "POST" });
      const data = await res.json() as { success?: boolean; updated?: number; retryAfter?: number; error?: string };
      if (data.success) {
        toast.success(`行情已刷新（${data.updated ?? 0} 个标的），数据同步到全球节点约需 30-60 秒`);
        setTimeout(() => reloadSummary(), 30_000);
        reloadSummary();
      } else if (data.retryAfter) {
        toast.error(`${data.error || "请稍候"}（${data.retryAfter}秒后可重试）`);
      } else {
        toast.error(data.error || "刷新失败");
      }
    } catch {
      toast.error("刷新失败: 网络错误");
    }
    setRefreshing(false);
  }, [reloadSummary]);

  if (!unlocked) {
    return (
      <>
        <LoginScreen onUnlock={handleUnlock} />
        <Toaster theme="dark" />
      </>
    );
  }

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <div className="min-h-screen w-full bg-zinc-950 text-zinc-100">
        <header className="sticky top-0 z-50 glass">
          <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4">
            <button onClick={() => setTab("dashboard")} className="flex items-center gap-2 md:gap-3 hover:opacity-80 transition-opacity cursor-pointer">
              <svg className="h-6 w-6 md:h-8 md:w-8" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="url(#logo-grad)" />
                <path d="M10 22V12l6 8 6-8v10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <defs>
                  <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32">
                    <stop stopColor="#34d399" />
                    <stop offset="1" stopColor="#2dd4bf" />
                  </linearGradient>
                </defs>
              </svg>
              <h1 className="text-lg font-semibold tracking-tight">Portfolio</h1>
            </button>

            {/* Market data status + refresh */}
            <MarketDataStatus holdings={holdings} onRefresh={handleRefresh} refreshing={refreshing} />

            <div className="flex items-center gap-2">
              <TabsList className="bg-zinc-900 border border-zinc-800 text-xs md:text-sm">
                <TabsTrigger value="dashboard" className="data-[state=active]:bg-zinc-800">
                  总览
                </TabsTrigger>
                <TabsTrigger value="transactions" className="data-[state=active]:bg-zinc-800">
                  交易记录
                </TabsTrigger>
                <TabsTrigger value="settings" className="data-[state=active]:bg-zinc-800 relative">
                  设置
                  {pendingAlerts > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-amber-500 text-black text-[10px] rounded-full h-4 min-w-4 px-1 font-mono font-bold leading-4 flex items-center justify-center">
                      {pendingAlerts > 9 ? "9+" : pendingAlerts}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-300" onClick={toggleTheme}>
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-300" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <PriceTicker />

        <main className="px-3 md:px-6 py-4 md:py-6 w-full">
          <TabsContent value="dashboard" className="mt-0">
            <DashboardTab visible={tab === "dashboard"} onAddTransaction={handleAddTransaction} />
          </TabsContent>
          <TabsContent value="transactions" className="mt-0">
            <TransactionsTab autoOpenSheet={openAddSheet} onSheetClosed={() => setOpenAddSheet(false)} />
          </TabsContent>
          <TabsContent value="settings" className="mt-0">
            <SettingsTab />
          </TabsContent>
        </main>

        <Toaster theme="dark" />
      </div>
    </Tabs>
  );
}
