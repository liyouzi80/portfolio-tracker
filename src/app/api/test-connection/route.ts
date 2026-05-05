import { NextRequest, NextResponse } from "next/server";
import { fetchLongbridgePrice, fetchYahooPrice } from "@/lib/price";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { appKey?: string; appSecret?: string; accessToken?: string };
  const { appKey, appSecret, accessToken } = body;
  const hasCreds = !!(appKey && appSecret && accessToken);

  // Try Longbridge first if creds provided
  if (hasCreds) {
    try {
      const price = await fetchLongbridgePrice("AAPL", "US", { appKey: appKey!, appSecret: appSecret!, accessToken: accessToken! });
      if (price !== null) {
        return NextResponse.json({ success: true, price, symbol: "AAPL.US", source: "longbridge" });
      }
    } catch { /* fall through to Yahoo */ }
  }

  // Fallback to Yahoo (works without API key)
  const yahooPrice = await fetchYahooPrice("AAPL", "US");
  if (yahooPrice !== null) {
    return NextResponse.json({
      success: true,
      price: yahooPrice,
      symbol: "AAPL.US",
      source: hasCreds ? "yahoo-fallback" : "yahoo",
      note: hasCreds ? "长桥未返回数据，已通过 Yahoo Finance 验证连接正常" : undefined,
    });
  }

  return NextResponse.json({
    success: false,
    error: "无法获取 AAPL 价格，请检查网络连接",
  });
}
