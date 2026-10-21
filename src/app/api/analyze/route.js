
import { NextResponse } from "next/server";
import { getCandles } from "@/lib/marketData";
import {
  analyzeStructure,
  combineAnalysis,
} from "@/lib/marketStructure";
import { assessAutomaticFundamentals } from "@/lib/automaticFundamentals";

export const dynamic = "force-dynamic";

async function getEconomicEvents() {
  const url = new URL(
    "https://www.financecalendar.com/wp-json/fc/v1/calendar"
  );

  url.searchParams.set("country", "US,EU");
  url.searchParams.set("tz", "Africa/Lagos");
  url.searchParams.set("limit", "100");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(
      `Economic calendar unavailable (${response.status})`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data.events)) {
    throw new Error("Economic calendar returned an unexpected format");
  }

  return data.events;
}

export async function POST(request) {
  try {
    const [oneHourCandles, fourHourCandles, events] =
      await Promise.all([
        getCandles("1h", 250),
        getCandles("4h", 250),
        getEconomicEvents(),
      ]);

    const oneHour = analyzeStructure(oneHourCandles);
    const fourHour = analyzeStructure(fourHourCandles);

   const fundamentals = assessAutomaticFundamentals(events);
    const combined = combineAnalysis(
      oneHour,
      fourHour,
      fundamentals
    );

    const trade =
      combined.signal === "NO TRADE"
        ? {
            signal: "NO TRADE",
            entry: null,
            stopLoss: null,
            takeProfits: [null, null, null],
          }
        : {
            signal: combined.signal,
            entry: oneHour.entry,
            stopLoss: oneHour.stopLoss,
            takeProfits: oneHour.takeProfits,
          };

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      symbol: "EUR/USD",
      source: "Twelve Data + Finance Calendar",
      liveData: true,
      oneHour,
      fourHour,
      fundamentals,
      combined,
      trade,
      caveat:
        "Rule-based educational analysis. Economic surprises are simplified indicators, not verified predictions or financial advice.",
    });
  } catch (error) {
    console.error("Analysis failed:", error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Analysis failed. Verify market-data and calendar availability.",
      },
      { status: error.status || 502 }
    );
  }
}
