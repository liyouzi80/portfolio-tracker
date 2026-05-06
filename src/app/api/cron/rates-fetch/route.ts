import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";

const API_URL = "https://api.exchangerate-api.com/v4/latest/USD";

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch {
      if (i === retries - 1) throw new Error("All retries exhausted");
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
  throw new Error("Unreachable");
}

export async function GET(req: NextRequest) {
  const env = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const cronSecret = env?.CRON_SECRET;
  if (cronSecret && req.nextUrl.searchParams.get("secret") !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { DB: d1 } = getPlatformEnv();

  try {
    const res = await fetchWithRetry(API_URL);
    const data = await res.json() as { rates: Record<string, number> };
    const rates = data.rates;
    const now = new Date().toISOString();

    const currencies = ["CNY", "HKD", "USD", "JPY", "KRW", "EUR", "GBP", "CHF", "CAD", "AUD", "TWD", "INR"];

    // Batch all 132 upserts into a single D1 batch call
    const stmts: D1PreparedStatement[] = [];
    for (const from of currencies) {
      for (const to of currencies) {
        if (from === to) continue;
        const rate = Math.round((rates[to] / rates[from]) * 10000) / 10000;
        stmts.push(
          d1.prepare(
            "INSERT INTO exchange_rates (from_currency, to_currency, rate, updated_at) VALUES (?, ?, ?, ?) " +
            "ON CONFLICT(from_currency, to_currency) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at"
          ).bind(from, to, rate, now)
        );
      }
    }
    await d1.batch(stmts);

    return NextResponse.json({ success: true, updated: now, pairs: stmts.length });
  } catch {
    return NextResponse.json({ error: "Failed to fetch rates" }, { status: 500 });
  }
}
