import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";

export const runtime = "edge";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { PRICE_CACHE } = getPlatformEnv();
  const cached = await PRICE_CACHE.get(params.id, "json");
  if (cached) return NextResponse.json(cached);
  return NextResponse.json({ price: null }, { status: 204 });
}
