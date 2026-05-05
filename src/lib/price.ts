// --- Tencent Finance (free, no key, multi-market) ---
// Primary source. Supports CN/HK/US. One request per symbol.
// Shanghai: sh600519, Shenzhen: sz000001, HK: hk00700, US: aapl

function tencentSymbol(symbol: string, market: string): string {
  if (market === "CN") {
    const first = symbol.charAt(0);
    return first === "6" ? `sh${symbol}` : `sz${symbol}`;
  }
  if (market === "HK") return `hk${symbol}`;
  return symbol.toLowerCase(); // US
}

export async function fetchTencentPrice(symbol: string, market: string): Promise<{ price: number; name: string } | null> {
  const qs = tencentSymbol(symbol, market);
  try {
    const res = await fetch(`http://qt.gtimg.cn/q=${qs}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    // Response: v_sh600519="1~贵州茅台~600519~1850.00~..."
    const match = text.match(/"([^"]*)"/);
    if (!match) return null;
    const fields = match[1].split("~");
    // fields[0]: 0=停牌,1=正常; [1]: 名称; [3]: 最新价
    if (fields[0] === "0" || !fields[3] || fields[3] === "0.000") return null;
    const price = parseFloat(fields[3]);
    if (!price || isNaN(price)) return null;
    return { price, name: fields[1] || symbol };
  } catch {
    return null;
  }
}

// --- Tencent batch fetch (all symbols at once) ---
export async function fetchTencentPrices(symbols: Array<{ symbol: string; market: string }>): Promise<Map<string, { price: number; name: string }>> {
  const result = new Map<string, { price: number; name: string }>();
  if (symbols.length === 0) return result;
  const qs = symbols.map(s => tencentSymbol(s.symbol, s.market)).join(",");
  try {
    const res = await fetch(`http://qt.gtimg.cn/q=${qs}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) return result;
    const text = await res.text();
    const matches = text.matchAll(/v_(\w+)="([^"]*)"/g);
    for (const m of matches) {
      const fields = m[2].split("~");
      if (fields[0] === "0" || !fields[3] || fields[3] === "0.000") continue;
      const price = parseFloat(fields[3]);
      if (!price || isNaN(price)) continue;
      // Resolve original symbol from the key
      const key = m[1]; // e.g., sh600519, hk00700, aapl
      const original = symbols.find(s => tencentSymbol(s.symbol, s.market) === key);
      if (original) {
        result.set(`${original.market}:${original.symbol}`, { price, name: fields[1] });
      }
    }
    return result;
  } catch {
    return result;
  }
}

// --- Yahoo Finance v8 chart API (free, no key required) ---
// Backup source. A-shares: 600519.SS, HK: 0700.HK, US: AAPL

function cnSuffix(symbol: string): string {
  // Shanghai: 6xxxxx (600/601/603/605/688)
  // Shenzhen: 0xxxxx (000-004), 2xxxxx (002), 3xxxxx (300/301)
  const first = symbol.charAt(0);
  if (first === "6") return ".SS";
  if (first === "0" || first === "3" || first === "2") return ".SZ";
  return ".SS";
}

export async function fetchYahooPrice(symbol: string, market: string): Promise<number | null> {
  const q = await fetchYahooQuote(symbol, market);
  return q?.price ?? null;
}

export async function fetchYahooQuote(symbol: string, market: string): Promise<{ price: number; name?: string } | null> {
  const suffix = market === "CN" ? cnSuffix(symbol) : market === "HK" ? ".HK" : "";
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
    const data = await res.json() as { chart: { result?: [{ meta?: { regularMarketPrice?: number; shortName?: string; longName?: string } }] } };
    const meta = data.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return { price: meta.regularMarketPrice, name: meta.shortName || meta.longName };
  } catch {
    return null;
  }
}

// --- Finnhub (free tier: 60 req/min, US stocks only) ---
// API key stored as Worker secret FINNHUB_API_KEY

export async function fetchFinnhubPrice(symbol: string, market: string): Promise<{ price: number; name: string } | null> {
  if (market !== "US") return null; // Finnhub is US-only
  const env = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const apiKey = env?.FINNHUB_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`);
    if (!res.ok) return null;
    const data = await res.json() as { c: number; h: number; l: number; o: number; pc: number; t: number };
    if (!data.c || data.c === 0) return null;

    // Get company name
    let name = symbol;
    try {
      const profileRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${apiKey}`);
      if (profileRes.ok) {
        const profile = await profileRes.json() as { name?: string };
        if (profile.name) name = profile.name;
      }
    } catch { /* use symbol as name */ }

    return { price: data.c, name };
  } catch {
    return null;
  }
}

// --- LongPort / LongBridge OpenAPI (HMAC-SHA256 signed requests) ---
// Ref: https://github.com/longportapp/openapi-sdk
// Official SDK (npm: longport) cannot run on Cloudflare Workers (V8 Isolate)
// because it depends on native Rust bindings. This is the Edge-compatible impl.

import { getPlatformEnv } from "@/lib/env";

const LONGPORT_BASE_URL = "https://openapi.longportapp.com";

async function sha1(data: string): Promise<string> {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-1", enc.encode(data));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSha256(data: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function signRequest(
  method: string, path: string, query: string,
  appKey: string, appSecret: string, accessToken: string, body?: string,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signedHeaders = "authorization;x-api-key;x-timestamp";
  const signedValues = `authorization:${accessToken}\nx-api-key:${appKey}\nx-timestamp:${timestamp}\n`;

  let strToSign = `${method}|${path}|${query}|${signedValues}|${signedHeaders}|`;
  if (body) {
    strToSign += await sha1(body);
  }

  const hash = await sha1(strToSign);
  const signature = await hmacSha256(`HMAC-SHA256|${hash}`, appSecret);

  return `HMAC-SHA256 SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

export async function fetchLongbridgePrice(symbol: string, market: string): Promise<number | null> {
  // Use Cloudflare Workers bindings (env) instead of process.env
  const env = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const appKey = env?.LONGPORT_APP_KEY || env?.LONGBRIDGE_APP_KEY;
  const appSecret = env?.LONGPORT_APP_SECRET || env?.LONGBRIDGE_APP_SECRET;
  const accessToken = env?.LONGPORT_ACCESS_TOKEN || env?.LONGBRIDGE_ACCESS_TOKEN;

  if (!appKey || !appSecret || !accessToken) return null;

  // Market suffixes must be UPPERCASE for Longbridge
  const lbMarket = market === "CN" ? "SH" : market === "HK" ? "HK" : "US";
  const path = "/v1/quote";
  const query = `symbol=${symbol}.${lbMarket}`;

  const signature = await signRequest("GET", path, query, appKey, appSecret, accessToken);

  try {
    const res = await fetch(`${LONGPORT_BASE_URL}${path}?${query}`, {
      headers: {
        "Authorization": accessToken,
        "X-Api-Key": appKey,
        "X-Timestamp": Math.floor(Date.now() / 1000).toString(),
        "X-Api-Signature": signature,
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "openapi-sdk",
      },
    });
    if (!res.ok) return null;

    const json = await res.json() as any;

    // Response may be wrapped: {code: 0, data: [{last_done: "150.00"}]}
    // or flat: {last_done: 150.00}
    let quote: any;
    if (json.code !== undefined && Array.isArray(json.data)) {
      quote = json.data[0];
    } else {
      quote = json;
    }
    if (!quote) return null;

    // last_done is the latest trade price, may be string or number
    const price = quote.last_done ?? quote.lastDone ?? quote.last_price ?? quote.lastPrice ?? quote.price;
    if (price === undefined || price === null) return null;
    return typeof price === "number" ? price : Number(price);
  } catch {
    return null;
  }
}
