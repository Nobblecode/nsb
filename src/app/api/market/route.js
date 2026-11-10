
import { NextResponse } from "next/server";
import { getCandles } from "@/lib/marketData";

export const dynamic = "force-dynamic";

const SUPPORTED_INSTRUMENTS = [
  "EUR/USD",
  "XAU/USD",
  "USD/JPY",
  "AUD/JPY",
];

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;

  const interval = searchParams.get("interval") || "1h";
  const symbol = (
    searchParams.get("symbol") || "EUR/USD"
  ).toUpperCase();

  if (!["1h", "4h"].includes(interval)) {
    return NextResponse.json(
      { error: "Only 1h and 4h intervals are supported." },
      { status: 400 }
    );
  }

  if (!SUPPORTED_INSTRUMENTS.includes(symbol)) {
    return NextResponse.json(
      { error: "Unsupported trading instrument." },
      { status: 400 }
    );
  }

  try {
    const candles = await getCandles(interval, 250, symbol);

    return NextResponse.json(
      {
        symbol,
        interval,
        candles,
        latest: candles.at(-1),
        source: "Twelve Data",
        fetchedAt: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message || "Market data unavailable",
        symbol,
        source: "Twelve Data",
        liveData: false,
      },
      {
        status: error.status || 502,
      }
    );
  }
}
