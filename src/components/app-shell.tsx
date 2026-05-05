"use client";

import { useState, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardTab } from "./dashboard-tab";
import { TransactionsTab } from "./transactions-tab";
import { SettingsTab } from "./settings-tab";
import { Button } from "@/components/ui/button";
import { PriceTicker } from "./price-ticker";
import { LoginScreen } from "./login-screen";
import { Toaster } from "@/components/ui/sonner";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

export function AppShell() {
  const [tab, setTab] = useState("dashboard");
  const [unlocked, setUnlocked] = useState(false);

  const handleUnlock = useCallback(() => setUnlocked(true), []);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setUnlocked(false);
    toast.success("已退出登录");
  }, []);

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
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <header className="sticky top-0 z-50 glass">
          <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4">
            <div className="flex items-center gap-2 md:gap-3">
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
            </div>
            <div className="flex items-center gap-2">
              <TabsList className="bg-zinc-900 border border-zinc-800 text-xs md:text-sm">
                <TabsTrigger value="dashboard" className="data-[state=active]:bg-zinc-800">
                  总览
                </TabsTrigger>
                <TabsTrigger value="transactions" className="data-[state=active]:bg-zinc-800">
                  交易记录
                </TabsTrigger>
                <TabsTrigger value="settings" className="data-[state=active]:bg-zinc-800">
                  设置
                </TabsTrigger>
              </TabsList>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-300" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <PriceTicker />

        <main className="px-3 md:px-6 py-4 md:py-6 mx-auto w-full">
          <TabsContent value="dashboard" className="mt-0">
            <DashboardTab />
          </TabsContent>
          <TabsContent value="transactions" className="mt-0">
            <TransactionsTab />
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
