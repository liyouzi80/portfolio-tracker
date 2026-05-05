"use client";

import { useState, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Upload, FileText } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportSheet({ open, onOpenChange }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  }, []);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    // TODO: real API call
    setImporting(false);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-zinc-950 border-zinc-800 text-zinc-100 sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-zinc-100">Import Transactions</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-6">
          <div className="border-2 border-dashed border-zinc-700 rounded-lg p-10 text-center">
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="h-8 w-8 text-emerald-400" />
                <p className="text-sm text-zinc-300">{file.name}</p>
                <p className="text-xs text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
                <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Remove</Button>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 text-zinc-500 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">Drag & drop a CSV/Excel file</p>
                <p className="text-xs text-zinc-600 mt-1">or</p>
                <label className="mt-2 inline-block cursor-pointer text-sm text-emerald-400 hover:text-emerald-300">
                  Browse files
                  <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
                </label>
              </>
            )}
          </div>

          <div className="text-xs text-zinc-500">
            Expected columns: <code className="text-zinc-400">symbol, type, quantity, price, fee, date</code>
          </div>

          <Button onClick={handleImport} disabled={!file || importing} className="w-full">
            {importing ? "Importing..." : "Import"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
