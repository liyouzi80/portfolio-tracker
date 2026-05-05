import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { exchangeRates } from "@/db/schema";
import { getPlatformEnv } from "@/lib/env";

export const runtime = "edge";

// Free exchange rate API
const API_URL = "https://api.exchangerate-api.com/v4/latest/CNY";

export async function GET() {
  const { DB } = getPlatformEnv();
  const db = getDb(DB);

  try {
    const res = await fetch(API_URL);
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
