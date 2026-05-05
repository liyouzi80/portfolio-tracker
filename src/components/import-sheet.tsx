"use client";

import { useState, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Upload, FileText } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

export function ImportSheet({ open, onOpenChange, onDone }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }, []);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
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
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">导入交易记录</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div className="border-2 border-dashed border-zinc-700 rounded-lg p-10 text-center">
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
                <p className="text-xs text-zinc-600 mt-1">或</p>
                <label className="mt-2 inline-block cursor-pointer text-sm text-emerald-400 hover:text-emerald-300">
                  浏览文件
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
                </label>
              </>
            )}
          </div>

          <div className="text-xs text-zinc-500">
            支持列名：<code className="text-zinc-400">代码/代码, 类型, 数量, 价格, 手续费, 日期</code>
          </div>

          <Button onClick={handleImport} disabled={!file || importing} className="w-full">
            {importing ? "导入中..." : "开始导入"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
