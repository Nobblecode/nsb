
import { NextResponse } from "next/server";
import {
  getCandles,
  INSTRUMENTS,
} from "@/lib/marketData";
import {
  analyzeStructure,
  combineAnalysis,
} from "@/lib/marketStructure";
import { assessAutomaticFundamentals } from "@/lib/automaticFundamentals";

export const dynamic = "force-dynamic";


async function getEconomicEvents() {
  const apiKey = process.env.FC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Finance Calendar API key is missing. Check FC_API_KEY in .env.local."
    );
  }

  const url = new URL(
    "https://www.financecalendar.com/wp-json/fc/v1/calendar"
  );

  url.searchParams.set("country", "US,EU,JP,AU");
  url.searchParams.set("tz", "Africa/Lagos");
  url.searchParams.set("limit", "100");

  const response = await fetch(url.toString(), {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
    headers: {
      "X-API-Key": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Economic calendar unavailable (${response.status})`
    );
  }

  const data = await response.json();

  if (!data || !Array.isArray(data.events)) {
    throw new Error(
      "Economic calendar returned an unexpected format"
    );
  }

  return data.events;
}


function unavailableFundamentals(note) {
  return {
    source: "Finance Calendar",
    mode: "automatic",
    bias: "unknown",
    eventRisk: "unknown",
    calendarAvailable: false,
    calendarCoverage: "unverified",
    upcomingHighImpactEvents: [],
    interpretations: [],
    complete: false,
    note,
    caution:
      "Fundamental information is incomplete. Event risk is unknown, so this must not be treated as a safe trading environment.",
  };
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const symbol = String(
      body.symbol || "EUR/USD"
    ).toUpperCase();

    if (!Object.prototype.hasOwnProperty.call(INSTRUMENTS, symbol)) {
      return NextResponse.json(
        {
          error: `Unsupported trading instrument: ${symbol}`,
          supportedInstruments: Object.keys(INSTRUMENTS),
        },
        { status: 400 }
      );
    }

    const instrument = INSTRUMENTS[symbol];

    const [
      oneHourCandles,
      fourHourCandles,
      calendarResult,
    ] = await Promise.all([
      getCandles("1h", 250, symbol),
      getCandles("4h", 250, symbol),
      getEconomicEvents()
        .then((events) => ({
          available: true,
          events,
          error: null,
        }))
        .catch((error) => ({
          available: false,
          events: [],
          error:
            error.message ||
            "Economic calendar unavailable",
        })),
    ]);

    const oneHour = analyzeStructure(oneHourCandles, instrument);
const fourHour = analyzeStructure(fourHourCandles, instrument);

    // Keep the existing automatic assessment for EUR/USD.
    // Other instruments remain incomplete until their
    // currency-specific calendar assessment is verified.
    const fundamentals = calendarResult.available
  ? assessAutomaticFundamentals(
      calendarResult.events,
      symbol
    )
  : unavailableFundamentals(calendarResult.error);

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
      symbol,
      instrument,
      source: fundamentals.calendarAvailable
  ? "Twelve Data + Finance Calendar (coverage unverified)"
  : "Twelve Data; fundamentals incomplete",
      liveData: true,

      oneHour,
      fourHour,
      fundamentals,
      combined,
      analysisMode: combined.analysisMode,
      trade,

      dataDiagnostics: {
        symbol,

        oneHour: {
          candleCount: oneHourCandles.length,
          latestCandleTime: latestOneHourCandle.time,
          latestCandleClose: latestOneHourCandle.close,
          analysisEntry: oneHour.entry,
          candleMatchesAnalysisEntry:
  Number(
    latestOneHourCandle.close.toFixed(instrument.pricePrecision)
  ) === oneHour.entry,

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
          priceConfirmsBreakout:
            oneHour.priceConfirmsBreakout,
          bodyConfirmsBreakout:
            oneHour.bodyConfirmsBreakout,
          structuralConfirmation:
            oneHour.structuralConfirmation,
          trendSupportsBreakout:
            oneHour.trendSupportsBreakout,
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

        calendarAvailable:
          fundamentals.calendarAvailable ?? false,
        fundamentalsComplete:
          combined.fundamentalsComplete,
        eventRisk: fundamentals.eventRisk,
      },

      caveat:
        "Rule-based educational analysis. The 1H completed candle is the setup reference; the displayed entry is not a guarantee of an executable market price. Fundamental completeness and calendar risk must be evaluated according to the configured trading rules.",
    };

    console.log(
      `NSB ${symbol} analysis diagnostics:`,
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
