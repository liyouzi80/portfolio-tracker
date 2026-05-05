import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { exchangeRates } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";

const API_URL = "https://api.exchangerate-api.com/v4/latest/CNY";

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch {
      if (i === retries - 1) throw new Error("All retries exhausted");
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000)); // 1s, 2s, 4s
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

  const { DB } = getPlatformEnv();
  const db = getDb(DB);

  try {
    const res = await fetchWithRetry(API_URL);
    const data = await res.json() as { rates: Record<string, number> };
    const rates = data.rates;
    const now = new Date().toISOString();

    const currencies = ["CNY", "HKD", "USD"];
    for (const from of currencies) {
      for (const to of currencies) {
        if (from === to) continue;
        const rate = rates[to] / rates[from];
        await db.insert(exchangeRates).values({
          fromCurrency: from,
          toCurrency: to,
          rate: Math.round(rate * 10000) / 10000,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [exchangeRates.fromCurrency, exchangeRates.toCurrency],
          set: { rate: Math.round(rate * 10000) / 10000, updatedAt: now },
        });
      }
    }

    return NextResponse.json({ success: true, updated: now });
  } catch {
    return NextResponse.json({ error: "Failed to fetch rates" }, { status: 500 });
  }
}
