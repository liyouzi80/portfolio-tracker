import { NextRequest, NextResponse } from "next/server";
import { getPlatformEnv } from "@/lib/env";


export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { PRICE_CACHE } = getPlatformEnv();
  const cached = await PRICE_CACHE.get(id, "json");
  if (cached) return NextResponse.json(cached);
  return NextResponse.json({ price: null }, { status: 204 });
}
