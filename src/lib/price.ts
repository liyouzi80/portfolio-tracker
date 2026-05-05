// Yahoo Finance v8 chart API (free, no key required)
// A-shares: 600519.SS (Shanghai), 000001.SZ (Shenzhen)
// HK: 0700.HK, US: AAPL

function cnSuffix(symbol: string): string {
  // Shanghai: 6xxxxx (600/601/603/605/688)
  // Shenzhen: 0xxxxx (000-004), 2xxxxx (002), 3xxxxx (300/301)
  const first = symbol.charAt(0);
  if (first === "6") return ".SS";
  if (first === "0" || first === "3" || first === "2") return ".SZ";
  return ".SS";
}

export async function fetchYahooPrice(symbol: string, market: string): Promise<number | null> {
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
    const data = await res.json() as { chart: { result?: [{ meta?: { regularMarketPrice?: number } }] } };
    return data.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  } catch {
    return null;
  }
}

// --- LongPort / LongBridge OpenAPI (HMAC-SHA256 signed requests) ---
// Ref: https://github.com/longportapp/openapi-sdk

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

interface LongportCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
}

export async function getLongbridgeCredsFromD1(d1: D1Database): Promise<LongportCredentials | null> {
  const rows = await d1
    .prepare("SELECT key, value FROM auth WHERE key IN ('setting:lbKey','setting:lbSecret','setting:lbAccessToken')")
    .all<{ key: string; value: string }>();
  const map: Record<string, string> = {};
  for (const row of rows.results) map[row.key.replace("setting:", "")] = row.value;
  if (!map.lbKey || !map.lbSecret || !map.lbAccessToken) return null;
  return { appKey: map.lbKey, appSecret: map.lbSecret, accessToken: map.lbAccessToken };
}

export async function fetchLongbridgePrice(symbol: string, market: string, creds?: LongportCredentials): Promise<number | null> {
  const appKey = creds?.appKey || process.env.LONGPORT_APP_KEY || process.env.LONGBRIDGE_APP_KEY;
  const appSecret = creds?.appSecret || process.env.LONGPORT_APP_SECRET || process.env.LONGBRIDGE_APP_SECRET;
  const accessToken = creds?.accessToken || process.env.LONGPORT_ACCESS_TOKEN || process.env.LONGBRIDGE_ACCESS_TOKEN;

  if (!appKey || !appSecret || !accessToken) throw new Error("Longbridge not configured");

  const lbMarket = market === "CN" ? "sh" : market === "HK" ? "hk" : "us";
  const path = "/v1/quote";
  const query = `symbol=${symbol}.${lbMarket}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signature = await signRequest("GET", path, query, appKey, appSecret, accessToken);

  try {
    const res = await fetch(`${LONGPORT_BASE_URL}${path}?${query}`, {
      headers: {
        "Authorization": accessToken,
        "X-Api-Key": appKey,
        "X-Timestamp": timestamp,
        "X-Api-Signature": signature,
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "openapi-sdk",
      },
    });
    if (!res.ok) throw new Error(`Longbridge API error: ${res.status}`);
    const data = await res.json() as { lastDone?: number; lastPrice?: number };
    return data?.lastDone ?? data?.lastPrice ?? null;
  } catch {
    return null;
  }
}
