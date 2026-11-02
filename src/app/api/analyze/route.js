
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

export async function POST() {
  try {
    const [oneHourCandles, fourHourCandles, calendarResult] =
      await Promise.all([
        getCandles("1h", 250),
        getCandles("4h", 250),
        getEconomicEvents()
          .then((events) => ({
            available: true,
            events,
            error: null,
          }))
          .catch((error) => ({
            available: false,
            events: [],
            error: error.message || "Economic calendar unavailable",
          })),
      ]);

    const oneHour = analyzeStructure(oneHourCandles);
    const fourHour = analyzeStructure(fourHourCandles);

    const fundamentals = calendarResult.available
      ? assessAutomaticFundamentals(calendarResult.events)
      : {
          source: "Finance Calendar",
          mode: "automatic",
          bias: "unknown",
          eventRisk: "unknown",
          calendarAvailable: false,
          calendarCoverage: "unverified",
          upcomingHighImpactEvents: [],
          interpretations: [],
          complete: false,
          note: calendarResult.error,
          caution:
            "The economic calendar could not be retrieved. Event risk is unknown.",
        };

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

    const latestOneHourCandle = oneHourCandles.at(-1);
    const latestFourHourCandle = fourHourCandles.at(-1);

    const responseData = {
      generatedAt: new Date().toISOString(),
      symbol: "EUR/USD",
      source: calendarResult.available
        ? "Twelve Data + Finance Calendar"
        : "Twelve Data; Finance Calendar unavailable",
      liveData: true,

      // Technical analysis results.
      oneHour,
      fourHour,
      fundamentals,
      combined,
      analysisMode: combined.analysisMode,
      trade,

      // Diagnostic information for checking dashboard consistency.
      
dataDiagnostics: {
  oneHour: {
    candleCount: oneHourCandles.length,
    latestCandleTime: latestOneHourCandle.time,
    latestCandleClose: latestOneHourCandle.close,
    analysisEntry: oneHour.entry,
    candleMatchesAnalysisEntry:
      latestOneHourCandle.close === oneHour.entry,

    signal: oneHour.signal,
    trend: oneHour.trend,
    structureTrend: oneHour.structureTrend,
    breakoutDirection: oneHour.breakoutDirection,
    recentHigh: oneHour.recentHigh,
    recentLow: oneHour.recentLow,
    atr: oneHour.atr,
    ema20: oneHour.ema20,
    ema50: oneHour.ema50,
    brokeHigh: oneHour.brokeHigh,
    brokeLow: oneHour.brokeLow,
    priceConfirmsBreakout: oneHour.priceConfirmsBreakout,
    bodyConfirmsBreakout: oneHour.bodyConfirmsBreakout,
    structuralConfirmation: oneHour.structuralConfirmation,
    trendSupportsBreakout: oneHour.trendSupportsBreakout,
    breakoutConfirmed: oneHour.breakoutConfirmed,
    setupConfirmed: oneHour.setupConfirmed,
    reason: oneHour.reason,
    
  potentialBuyLevel: oneHour.potentialBuyLevel,
  potentialSellLevel: oneHour.potentialSellLevel,
  distanceToBuy: oneHour.distanceToBuy,
  distanceToSell: oneHour.distanceToSell,
  pipsToBuy: oneHour.pipsToBuy,
  pipsToSell: oneHour.pipsToSell,
  breakoutStatus: oneHour.breakoutStatus,

  },

  fourHour: {
    candleCount: fourHourCandles.length,
    latestCandleTime: latestFourHourCandle.time,
    latestCandleClose: latestFourHourCandle.close,
    trend: fourHour.trend,
    structureTrend: fourHour.structureTrend,
    signal: fourHour.signal,
  },

  combined: {
    signal: combined.signal,
    reason: combined.reason,
    checks: combined.checks,
    failedChecks: combined.failedChecks,
  },

  trade,

  calendarAvailable: fundamentals.calendarAvailable ?? true,
  fundamentalsComplete: combined.fundamentalsComplete,
  eventRisk: fundamentals.eventRisk,
},


      caveat:
        "Rule-based educational analysis. The 1H completed candle is the setup reference; the displayed entry is not a guarantee of an executable market price. Fundamental completeness and calendar risk must be evaluated according to the configured trading rules.",
    };

    console.log(
      "NSB analysis diagnostics:",
      JSON.stringify(responseData.dataDiagnostics, null, 2)
    );

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Analysis failed:", error);

    return NextResponse.json(
      {
        error:
          error.message ||
          "Analysis failed. Verify that market data is available.",
      },
      { status: 502 }
    );
  }
}
