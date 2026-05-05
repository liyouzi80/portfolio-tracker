import { NextResponse } from "next/server";


export async function GET() {
  try {
    const res = await fetch(
      "https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN"
    );
    const data = await res.json() as { images: { url: string }[] };
    const url = "https://www.bing.com" + (data.images?.[0]?.url || "");
    return NextResponse.json(
      { url },
      { headers: { "Cache-Control": "public, max-age=3600" } }
    );
  } catch {
    return NextResponse.json({ url: "" }, { status: 502 });
  }
}
