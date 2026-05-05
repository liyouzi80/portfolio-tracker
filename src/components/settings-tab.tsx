"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AccountSheet } from "./account-sheet";
import { AlertSheet } from "./alert-sheet";
import { Plus, Pencil, Trash2 } from "lucide-react";

const mockAccounts = [
  { id: "1", name: "盈透证券", currency: "USD", leverage: 1 },
  { id: "2", name: "长桥", currency: "HKD", leverage: 1.5 },
  { id: "3", name: "A股", currency: "CNY", leverage: 1 },
];

const mockAlerts = [
  { id: "1", symbol: "AAPL", condition: "price_below", threshold: 160, enabled: true },
  { id: "2", symbol: "0700", condition: "price_above", threshold: 420, enabled: false },
];

export function SettingsTab() {
  const [accountOpen, setAccountOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">账户管理</CardTitle>
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setAccountOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500">账户名称</TableHead>
                <TableHead className="text-zinc-500">币种</TableHead>
                <TableHead className="text-zinc-500">杠杆</TableHead>
                <TableHead className="text-zinc-500 w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockAccounts.map((a) => (
                <TableRow key={a.id} className="border-zinc-800">
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-zinc-700">{a.currency}</Badge>
                  </TableCell>
                  <TableCell className="font-mono">{a.leverage}x</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-zinc-300">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-red-400">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">价格提醒</CardTitle>
            <Button size="sm" variant="outline" className="border-zinc-700 text-zinc-300" onClick={() => setAlertOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-500">代码</TableHead>
                <TableHead className="text-zinc-500">条件</TableHead>
                <TableHead className="text-zinc-500">阈值</TableHead>
                <TableHead className="text-zinc-500">状态</TableHead>
                <TableHead className="text-zinc-500 w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {mockAlerts.map((a) => (
                <TableRow key={a.id} className="border-zinc-800">
                  <TableCell className="font-mono font-medium">{a.symbol}</TableCell>
                  <TableCell className="text-zinc-300">{a.condition === "price_below" ? "低于" : "高于"}</TableCell>
                  <TableCell className="font-mono">{a.threshold}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={a.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-zinc-800 text-zinc-500 border-zinc-700"}>
                      {a.enabled ? "启用" : "暂停"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-500 hover:text-red-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-sm font-medium">数据源</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-zinc-400">行情源：</span>
            <Badge className="bg-emerald-500/10 text-emerald-400">长桥 (主)</Badge>
            <span className="text-zinc-600">→</span>
            <Badge variant="outline" className="border-zinc-700 text-zinc-500">Yahoo Finance (备)</Badge>
          </div>
        </CardContent>
      </Card>

      <AccountSheet open={accountOpen} onOpenChange={setAccountOpen} />
      <AlertSheet open={alertOpen} onOpenChange={setAlertOpen} />
    </div>
  );
}
