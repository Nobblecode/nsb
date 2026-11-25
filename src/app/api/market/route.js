
import { NextResponse } from "next/server";
import {
  getCandles,
  INSTRUMENTS,
} from "@/lib/marketData";

export const dynamic = "force-dynamic";

const SUPPORTED_INTERVALS = ["1min", "1h", "4h"];

export async function GET(request) {
  const searchParams = new URL(request.url).searchParams;

  const requestedInterval = searchParams.get("interval") || "1h";
  const interval =
    requestedInterval === "1m" ? "1min" : requestedInterval;

  const symbol = (
    searchParams.get("symbol") || "EUR/USD"
  ).toUpperCase();

  if (!SUPPORTED_INTERVALS.includes(interval)) {
    return NextResponse.json(
      {
        error: "Only 1min, 1h and 4h intervals are supported.",
      },
      { status: 400 }
    );
  }

  if (!Object.hasOwn(INSTRUMENTS, symbol)) {
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
    console.error("Market data API error:", error);

    return NextResponse.json(
      {
        error: error.message || "Market data unavailable",
        symbol,
        interval,
        source: "Twelve Data",
        liveData: false,
      },
      { status: error.status || 502 }
    );
  }
}
