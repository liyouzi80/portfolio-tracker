"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardTab } from "./dashboard-tab";
import { TransactionsTab } from "./transactions-tab";
import { SettingsTab } from "./settings-tab";
import { PriceTicker } from "./price-ticker";
import { Toaster } from "@/components/ui/sonner";

export function AppShell() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500" />
            <h1 className="text-lg font-semibold tracking-tight">Portfolio</h1>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="bg-zinc-900 border border-zinc-800">
              <TabsTrigger value="dashboard" className="data-[state=active]:bg-zinc-800">
                Overview
              </TabsTrigger>
              <TabsTrigger value="transactions" className="data-[state=active]:bg-zinc-800">
                Transactions
              </TabsTrigger>
              <TabsTrigger value="settings" className="data-[state=active]:bg-zinc-800">
                Settings
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      <PriceTicker />

      <main className="px-6 py-6 mx-auto max-w-7xl">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsContent value="dashboard" className="mt-0">
            <DashboardTab />
          </TabsContent>
          <TabsContent value="transactions" className="mt-0">
            <TransactionsTab />
          </TabsContent>
          <TabsContent value="settings" className="mt-0">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </main>

      <Toaster theme="dark" />
    </div>
  );
}
