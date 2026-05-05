import { NextRequest, NextResponse } from "next/server";
import { fetchLongbridgePrice, fetchYahooPrice } from "@/lib/price";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { appKey?: string; appSecret?: string; accessToken?: string };
  const { appKey, appSecret, accessToken } = body;

  const lbKey = appKey || (typeof process !== "undefined" && process.env?.LONGPORT_APP_KEY) || (typeof process !== "undefined" && process.env?.LONGBRIDGE_APP_KEY);
  const lbSecret = appSecret || (typeof process !== "undefined" && process.env?.LONGPORT_APP_SECRET) || (typeof process !== "undefined" && process.env?.LONGBRIDGE_APP_SECRET);
  const lbToken = accessToken || (typeof process !== "undefined" && process.env?.LONGPORT_ACCESS_TOKEN) || (typeof process !== "undefined" && process.env?.LONGBRIDGE_ACCESS_TOKEN);

  const longbridgeConfigured = !!(lbKey && lbSecret && lbToken);
  let lbResult: { price?: number; error?: string } = {};

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
      lbResult = { error: "认证通过但 AAPL 行情数据为空，可能是账户未开通美股实时行情权限" };
    } catch (e: any) {
      lbResult = { error: `请求失败: ${e.message || "未知错误"}` };
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
    longbridge: longbridgeConfigured ? {
      configured: true,
      ok: false,
      error: lbResult.error || "未返回价格",
    } : { configured: false },
    note: longbridgeConfigured
      ? (lbResult.error || "长桥已配置但无数据") + "。Yahoo Finance " + (yahooOk ? "连接正常" : "也失败")
      : "长桥未配置，使用 Yahoo Finance" + (yahooOk ? "" : " (失败)"),
  });
}
