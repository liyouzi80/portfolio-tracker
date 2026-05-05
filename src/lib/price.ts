// Yahoo Finance API adapter (unofficial but widely used)
export async function fetchYahooPrice(symbol: string, market: string): Promise<number | null> {
  const yahooSymbol = market === "CN" ? `${symbol}.SS` :
    market === "HK" ? `${symbol}.HK` : symbol;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;
  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json() as {
    chart: { result: [{ meta: { regularMarketPrice: number } }] };
  };
  return data.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
}

// Longbridge OpenAPI adapter
export async function fetchLongbridgePrice(symbol: string, market: string): Promise<number | null> {
  const appKey = process.env.LONGBRIDGE_APP_KEY;
  const appSecret = process.env.LONGBRIDGE_APP_SECRET;
  if (!appKey || !appSecret) throw new Error("Longbridge credentials not configured");

  const lbMarket = market === "CN" ? "sh" : market === "HK" ? "hk" : "us";
  const url = `https://openapi.longbridge.global/v1/quote?symbol=${symbol}.${lbMarket}`;

  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${appKey}`,
    },
  });
  if (!res.ok) throw new Error(`Longbridge API error: ${res.status}`);

  const data = await res.json() as { lastDone?: number; lastPrice?: number };
  return data?.lastDone ?? data?.lastPrice ?? null;
}
