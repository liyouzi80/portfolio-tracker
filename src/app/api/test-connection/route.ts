import { NextRequest, NextResponse } from "next/server";
import { fetchLongbridgePrice } from "@/lib/price";


export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { appKey?: string; appSecret?: string; accessToken?: string };
  const { appKey, appSecret, accessToken } = body;

  try {
    const price = await fetchLongbridgePrice("AAPL", "US", appKey ? { appKey, appSecret: appSecret!, accessToken: accessToken! } : undefined);
    if (price !== null) {
      return NextResponse.json({ success: true, price, symbol: "AAPL.US" });
    }
    return NextResponse.json({
      success: false,
      error: "API 连接成功但未返回价格数据，请检查权限",
    });
  } catch {
    return NextResponse.json({
      success: false,
      error: "无法连接长桥 API，请检查网络或凭据",
    });
  }
}
