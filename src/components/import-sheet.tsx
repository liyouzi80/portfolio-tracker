"use client";

import { useState, useCallback, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Download } from "lucide-react";
import { toast } from "sonner";

interface Account {
  id: string;
  name: string;
  currency: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  onDone?: () => void;
}

export function ImportSheet({ open, onOpenChange, accounts, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const [importing, setImporting] = useState(false);
  const [purgeFirst, setPurgeFirst] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File | null) => {
    if (f) setFile(f);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }, []);

  const handleImport = async () => {
    if (!file || !accountId) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("accountId", accountId);
      if (purgeFirst) formData.append("purge", "1");
      const res = await fetch("/api/transactions/import", { method: "POST", body: formData });
      const data = await res.json() as { count?: number; error?: string };
      if (data.count !== undefined) {
        toast.success(`成功导入 ${data.count} 条记录`);
        onDone?.();
      } else {
        toast.error(data.error || "导入失败");
      }
    } catch {
      toast.error("导入失败: 网络错误");
    }
    setImporting(false);
    setFile(null);
    setAccountId("");
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">导入交易记录</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          {/* Account selector */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">导入到账户</Label>
            <Select value={accountId} onValueChange={(v) => v && setAccountId(v)}>
              <SelectTrigger className="bg-zinc-900 border-zinc-700 h-10 text-sm">
                <SelectValue placeholder="选择账户..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.length === 0 ? (
                  <div className="px-2 py-4 text-sm text-zinc-500 text-center">暂无账户，请先在设置中添加</div>
                ) : (
                  accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* File drop zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
              dragOver ? "border-emerald-400 bg-emerald-400/5" : "border-zinc-700"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-8 w-8 text-emerald-400" />
                <p className="text-sm text-zinc-300">{file.name}</p>
                <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
                <Button variant="ghost" size="sm" onClick={() => setFile(null)}>移除</Button>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 text-zinc-500 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">拖拽或选择 CSV/Excel 文件</p>
                <p className="text-xs text-zinc-500 mt-1">或</p>
                <label className="mt-2 inline-block cursor-pointer text-sm text-emerald-400 hover:text-emerald-300">
                  浏览文件
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
                </label>
              </>
            )}
          </div>

          {/* CSV format hint + template download */}
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>列：符号, 类型, 数量, 价格, 手续费, 日期, 市场</span>
            <a
              href="data:text/csv;charset=utf-8,symbol,type,quantity,price,fee,date,market%0AAAPL,buy,10,150,0.5,2025-01-01,US"
              download="template.csv"
              className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300"
            >
              <Download className="h-3 w-3" />
              模板
            </a>
          </div>

          {/* Purge mode checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="purge-mode"
              checked={purgeFirst}
              onChange={(e) => setPurgeFirst(e.target.checked)}
              className="rounded accent-red-500"
            />
            <label htmlFor="purge-mode" className="text-xs text-zinc-400 cursor-pointer">
              清空目标账户已有交易后导入（用于完整数据替换）
            </label>
          </div>

          <Button onClick={handleImport} disabled={!file || !accountId || importing} className={`w-full ${purgeFirst ? "bg-red-600 hover:bg-red-700" : ""}`}>
            {importing ? "导入中..." : purgeFirst ? "清空并导入" : "开始导入"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
