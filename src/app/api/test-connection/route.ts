import { NextRequest, NextResponse } from "next/server";
import { fetchTencentPrice, fetchFinnhubPrice, fetchLongbridgePrice, fetchYahooPrice } from "@/lib/price";
import { getPlatformEnv } from "@/lib/env";

export async function POST(_req: NextRequest) {
  // Test Tencent (free, always available)
  const tencent = await fetchTencentPrice("AAPL", "US");
  const tencentOk = tencent !== null;

  // Test Finnhub (free, needs API key, US only)
  const finnhub = await fetchFinnhubPrice("AAPL", "US");
  const finnhubOk = finnhub !== null;

  // Check Longbridge
  const env = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const lbConfigured = !!(env?.LONGPORT_APP_KEY || env?.LONGBRIDGE_APP_KEY);
  let lbResult: { configured: boolean; ok: boolean; error?: string } = { configured: false, ok: false };

  if (lbConfigured) {
    lbResult.configured = true;
    try {
      const price = await fetchLongbridgePrice("AAPL", "US");
      if (price !== null) {
        lbResult.ok = true;
        // If Longbridge works, return immediately
        return NextResponse.json({
          success: true,
          price,
          symbol: "AAPL.US",
          source: "longbridge",
          tencent: { ok: tencentOk, price: tencent?.price },
          longbridge: lbResult,
        });
      }
      lbResult.error = "认证通过但 AAPL 行情数据为空，可能未开通美股实时行情";
    } catch (e: any) {
      lbResult.error = `请求失败: ${e.message || "未知错误"}`;
    }
  }

  // Test Yahoo
  const yahooPrice = await fetchYahooPrice("AAPL", "US");
  const yahooOk = yahooPrice !== null;

  const anyOk = tencentOk || finnhubOk || yahooOk;
  const bestPrice = tencent?.price ?? finnhub?.price ?? yahooPrice ?? undefined;
  const bestSource = tencentOk ? "tencent" : finnhubOk ? "finnhub" : yahooOk ? "yahoo" : "none";

  return NextResponse.json({
    success: anyOk,
    price: bestPrice,
    symbol: "AAPL.US",
    source: bestSource,
    tencent: { ok: tencentOk, price: tencent?.price },
    finnhub: { ok: finnhubOk, price: finnhub?.price },
    longbridge: lbResult,
    yahoo: { ok: yahooOk },
    note: [
      tencentOk ? "腾讯正常" : "腾讯失败",
      finnhubOk ? "Finnhub正常" : "Finnhub失败",
      lbConfigured ? `长桥${lbResult.ok ? "正常" : lbResult.error}` : "长桥未配置",
      yahooOk ? "Yahoo正常" : "Yahoo失败",
    ].join(" | "),
  });
}
