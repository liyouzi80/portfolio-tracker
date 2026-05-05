import { NextRequest, NextResponse } from "next/server";
import { fetchLongbridgePrice, fetchYahooPrice } from "@/lib/price";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { appKey?: string; appSecret?: string; accessToken?: string };
  const { appKey, appSecret, accessToken } = body;

  const lbKey = appKey || (typeof process !== "undefined" && process.env?.LONGPORT_APP_KEY) || (typeof process !== "undefined" && process.env?.LONGBRIDGE_APP_KEY);
  const lbSecret = appSecret || (typeof process !== "undefined" && process.env?.LONGPORT_APP_SECRET) || (typeof process !== "undefined" && process.env?.LONGBRIDGE_APP_SECRET);
  const lbToken = accessToken || (typeof process !== "undefined" && process.env?.LONGPORT_ACCESS_TOKEN) || (typeof process !== "undefined" && process.env?.LONGBRIDGE_ACCESS_TOKEN);

  const longbridgeConfigured = !!(lbKey && lbSecret && lbToken);

  // Try Longbridge if credentials available
  if (longbridgeConfigured) {
    try {
      const price = await fetchLongbridgePrice("AAPL", "US", {
        appKey: lbKey as string,
        appSecret: lbSecret as string,
        accessToken: lbToken as string,
      });
      if (price !== null) {
        return NextResponse.json({ success: true, price, symbol: "AAPL.US", source: "longbridge" });
      }
      return NextResponse.json({
        success: false,
        error: "长桥 API 连接成功但未返回 AAPL 价格，请检查 API 权限是否包含实时行情",
        source: "longbridge",
      });
    } catch (e: any) {
      return NextResponse.json({
        success: false,
        error: `长桥 API 请求失败: ${e.message || "未知错误"}`,
        source: "longbridge",
      });
    }
  }

  // No Longbridge creds — test Yahoo instead
  const yahooPrice = await fetchYahooPrice("AAPL", "US");
  if (yahooPrice !== null) {
    return NextResponse.json({
      success: true,
      price: yahooPrice,
      symbol: "AAPL.US",
      source: "yahoo",
      note: "长桥凭证未配置，使用 Yahoo Finance",
    });
  }

  return NextResponse.json({
    success: false,
    error: "长桥凭证未配置，且 Yahoo Finance 也无法获取价格，请检查网络",
  });
}
