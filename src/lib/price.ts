// Yahoo Finance v8 chart API (free, no key required)
// A-shares: 600519.SS (Shanghai), 000001.SZ (Shenzhen)
// HK: 0700.HK, US: AAPL
export async function fetchYahooPrice(symbol: string, market: string): Promise<number | null> {
  const suffix = market === "CN" ? ".SS" : market === "HK" ? ".HK" : "";
  const yahooSymbol = symbol + suffix;

  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PortfolioTracker/1.0)",
        "Accept": "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as { chart: { result?: [{ meta?: { regularMarketPrice?: number } }] } };
    return data.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

// Longbridge OpenAPI (requires App Key & Secret from open.longbridge.com)
// Not configured = falls back to Yahoo Finance automatically
export async function fetchLongbridgePrice(symbol: string, market: string): Promise<number | null> {
  const appKey = process.env.LONGBRIDGE_APP_KEY;
  const appSecret = process.env.LONGBRIDGE_APP_SECRET;
  if (!appKey || !appSecret) throw new Error("Longbridge not configured");

  const lbMarket = market === "CN" ? "sh" : market === "HK" ? "hk" : "us";
  const url = `https://openapi.longbridge.global/v1/quote?symbol=${symbol}.${lbMarket}`;

  try {
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${appKey}` } });
    if (!res.ok) throw new Error(`Longbridge API error: ${res.status}`);
    const data = await res.json() as { lastDone?: number; lastPrice?: number };
    return data?.lastDone ?? data?.lastPrice ?? null;
  } catch {
    return null;
  }
}
