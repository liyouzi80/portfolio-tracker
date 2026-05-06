"use client";
import { useState, useEffect, useCallback } from "react";

export interface PortfolioSummaryHolding {
  symbol: string;
  market: string;
  name: string;
  currentPrice?: number;
  priceUpdatedAt?: number;
}

export function usePortfolioSummary(visible: boolean) {
  const [holdings, setHoldings] = useState<PortfolioSummaryHolding[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/portfolio?baseCurrency=USD`);
      if (!r.ok) return;
      const d = await r.json() as { holdings?: PortfolioSummaryHolding[] };
      setHoldings(d.holdings ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => reload(), 60_000);
    return () => clearInterval(id);
  }, [visible, reload]);

  return { holdings, loading, reload };
}
