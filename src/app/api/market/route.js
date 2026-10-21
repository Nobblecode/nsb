import { NextResponse } from "next/server";
import { getCandles } from "@/lib/marketData";
export const dynamic = "force-dynamic";
export async function GET(request) {
  const interval = new URL(request.url).searchParams.get("interval") || "1h";
  if (!["1h", "4h"].includes(interval)) return NextResponse.json({ error: "Only 1h and 4h intervals are supported." }, { status: 400 });
  try {
    const candles = await getCandles(interval, 250);
    return NextResponse.json({ symbol: "EUR/USD", interval, candles, latest: candles.at(-1), source: "Twelve Data", fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Market data unavailable", source: "Twelve Data", liveData: false }, { status: error.status || 502 });
  }
}
