import { NextRequest, NextResponse } from "next/server";
import { fetchLongbridgePrice, fetchYahooPrice } from "@/lib/price";
import { getPlatformEnv } from "@/lib/env";

export async function POST(_req: NextRequest) {
  let lbResult: { configured: boolean; ok: boolean; error?: string } = { configured: false, ok: false };

  // Check if Longbridge creds are configured in env bindings
  const env = getPlatformEnv() as unknown as Record<string, string | undefined>;
  const lbConfigured = !!(env?.LONGPORT_APP_KEY || env?.LONGBRIDGE_APP_KEY);

  if (lbConfigured) {
    lbResult.configured = true;
    try {
      const price = await fetchLongbridgePrice("AAPL", "US");
      if (price !== null) {
        return NextResponse.json({ success: true, price, symbol: "AAPL.US", source: "longbridge" });
      }
      lbResult.error = "认证通过但 AAPL 行情数据为空，可能是账户未开通美股实时行情权限";
    } catch (e: any) {
      lbResult.error = `请求失败: ${e.message || "未知错误"}`;
    }
  }

  // Always test Yahoo as verification
  const yahooPrice = await fetchYahooPrice("AAPL", "US");
  const yahooOk = yahooPrice !== null;

  return NextResponse.json({
    success: yahooOk,
    price: yahooPrice ?? undefined,
    symbol: "AAPL.US",
    source: yahooOk ? "yahoo" : "none",
    longbridge: lbResult,
    note: lbConfigured
      ? (lbResult.error || "长桥已配置但无数据") + "。Yahoo Finance " + (yahooOk ? "连接正常" : "也失败")
      : "长桥未配置。Yahoo Finance " + (yahooOk ? "连接正常" : "失败，请检查网络"),
  });
}
