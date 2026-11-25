
import { NextResponse } from "next/server";

import {
  getHistoricalCandles,
} from "@/lib/backtesting/historicalData";

import {
  runBacktest,
} from "@/lib/backtesting/engine";

import {
  INSTRUMENTS,
} from "@/lib/marketData";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value, name) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error(
      `${name} must use YYYY-MM-DD format.`
    );
  }

  const timestamp = Date.parse(
    `${value}T00:00:00Z`
  );

  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid ${name}.`);
  }

  return timestamp;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const {
      symbol = "EUR/USD",
      startDate,
      endDate,
      spreadPips = 0,
      slippagePips = 0,
    } = body;

    if (!INSTRUMENTS[symbol]) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported trading instrument.",
        },
        { status: 400 }
      );
    }

    const start = parseDate(
      startDate,
      "Start date"
    );

    const endDateStart = parseDate(
      endDate,
      "End date"
    );

    const endExclusive = endDateStart + DAY_MS;

    if (start >= endExclusive) {
      return NextResponse.json(
        {
          success: false,
          error: "Start date must be earlier than end date.",
        },
        { status: 400 }
      );
    }

    const days =
      (endExclusive - start) / DAY_MS;

    if (days > 370) {
      return NextResponse.json(
        {
          success: false,
          error: "The selected backtest period cannot exceed approximately 12 months.",
        },
        { status: 400 }
      );
    }

    const spread = Number(spreadPips);
    const slippage = Number(slippagePips);

    if (
      !Number.isFinite(spread) ||
      spread < 0 ||
      !Number.isFinite(slippage) ||
      slippage < 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Spread and slippage must be valid non-negative numbers.",
        },
        { status: 400 }
      );
    }

    // Sequential retrieval avoids simultaneous API calls.
    // Each helper also caches previously retrieved chunks.
    const oneHourResult = await getHistoricalCandles({
      symbol,
      interval: "1h",
      startDate,
      endDate,
    });

    const fourHourResult = await getHistoricalCandles({
      symbol,
      interval: "4h",
      startDate,
      endDate,
    });

    const result = runBacktest({
      symbol,

      oneHourCandles: oneHourResult.candles,
      fourHourCandles: fourHourResult.candles,

      spreadPips: spread,
      slippagePips: slippage,

      testStartTime: start,
      testEndTime: endExclusive,
    });

    return NextResponse.json({
      success: true,
      result,

      data: {
        oneHour: oneHourResult.metadata,
        fourHour: fourHourResult.metadata,
      },

      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "NSB backtest error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Backtesting failed.",
      },
      {
        status: error.status || 500,
      }
    );
  }
}
