const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / (values.length || 1);

const round = (number, precision = 5) =>
  Number(number.toFixed(precision));

function ema(values, period) {
  if (!values.length) return [];

  const multiplier = 2 / (period + 1);
  let current = values[0];

  return values.map((value, index) => {
    current =
      index === 0
        ? value
        : value * multiplier + current * (1 - multiplier);

    return current;
  });
}

function atr(candles, period = 14) {
  const trueRanges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;

    const previousClose = candles[index - 1].close;

    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose)
    );
  });

  return mean(trueRanges.slice(-period));
}

function swings(candles, wing = 2) {
  const highs = [];
  const lows = [];

  for (let i = wing; i < candles.length - wing; i++) {
    const window = candles.slice(i - wing, i + wing + 1);
    const high = candles[i].high;
    const low = candles[i].low;

    if (window.every((candle, j) => j === wing || high > candle.high)) {
      highs.push({ index: i, price: high });
    }

    if (window.every((candle, j) => j === wing || low < candle.low)) {
      lows.push({ index: i, price: low });
    }
  }

  return { highs, lows };
}

function validCandles(candles) {
  return (
    Array.isArray(candles) &&
    candles.length >= 60 &&
    candles.every(
      (candle) =>
        Number.isFinite(candle.open) &&
        Number.isFinite(candle.high) &&
        Number.isFinite(candle.low) &&
        Number.isFinite(candle.close) &&
        candle.high >= candle.low &&
        candle.high >= Math.max(candle.open, candle.close) &&
        candle.low <= Math.min(candle.open, candle.close)
    )
  );
}

export function analyzeStructure(
  candles,
  { pipSize = 0.0001, pricePrecision = 5 } = {}
) {
  if (!validCandles(candles)) {
    throw new Error(
      "At least 60 valid OHLC candles are required for structure analysis."
    );
  }

  if (
    !Number.isFinite(pipSize) ||
    pipSize <= 0 ||
    !Number.isInteger(pricePrecision) ||
    pricePrecision < 0 ||
    pricePrecision > 10
  ) {
    throw new Error("Invalid instrument price configuration.");
  }

  const closes = candles.map((candle) => candle.close);
  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  const fastEMA = ema(closes, 20);
  const slowEMA = ema(closes, 50);

  const ema20 = fastEMA.at(-1);
  const ema50 = slowEMA.at(-1);
  const atrValue = atr(candles);

  const recentCandles = candles.slice(-100);
  const { highs, lows } = swings(recentCandles, 2);

  const lastSwingHigh = highs.at(-1);
  const previousSwingHigh = highs.at(-2);
  const lastSwingLow = lows.at(-1);
  const previousSwingLow = lows.at(-2);

  const trend =
    ema20 > ema50 && last.close > ema50
      ? "bullish"
      : ema20 < ema50 && last.close < ema50
        ? "bearish"
        : "mixed";

  const higherHighs =
    lastSwingHigh &&
    previousSwingHigh &&
    lastSwingHigh.price > previousSwingHigh.price;

  const lowerHighs =
    lastSwingHigh &&
    previousSwingHigh &&
    lastSwingHigh.price < previousSwingHigh.price;

  const higherLows =
    lastSwingLow &&
    previousSwingLow &&
    lastSwingLow.price > previousSwingLow.price;

  const lowerLows =
    lastSwingLow &&
    previousSwingLow &&
    lastSwingLow.price < previousSwingLow.price;

  const structureTrend =
    higherHighs && higherLows
      ? "bullish"
      : lowerHighs && lowerLows
        ? "bearish"
        : "mixed";

  const swingHighPattern = higherHighs
    ? "higher high"
    : lowerHighs
      ? "lower high"
      : "unchanged or unavailable";

  const swingLowPattern = higherLows
    ? "higher low"
    : lowerLows
      ? "lower low"
      : "unchanged or unavailable";

  const support = lastSwingLow?.price ?? null;
  const resistance = lastSwingHigh?.price ?? null;

  const distanceToSupport =
    support == null ? null : Math.abs(last.close - support);

  const distanceToResistance =
    resistance == null ? null : Math.abs(resistance - last.close);

  const supportDistancePips =
    distanceToSupport == null
      ? null
      : Number((distanceToSupport / pipSize).toFixed(1));

  const resistanceDistancePips =
    distanceToResistance == null
      ? null
      : Number((distanceToResistance / pipSize).toFixed(1));

  const approachingThreshold = atrValue * 0.25;

  const approachingSupport = Boolean(
    support != null &&
      last.close >= support &&
      last.close - support <= approachingThreshold
  );

  const approachingResistance = Boolean(
    resistance != null &&
      last.close <= resistance &&
      resistance - last.close <= approachingThreshold
  );

  const marketPosition =
    support == null || resistance == null
      ? "insufficient swing data"
      : last.close > resistance
        ? "above recent swing resistance"
        : last.close < support
          ? "below recent swing support"
          : "between recent support and resistance";

  const marketStructureSummary =
    structureTrend === "bullish"
      ? `Bullish swing structure: ${swingHighPattern} and ${swingLowPattern}.`
      : structureTrend === "bearish"
        ? `Bearish swing structure: ${swingHighPattern} and ${swingLowPattern}.`
        : `Mixed swing structure: ${swingHighPattern} and ${swingLowPattern}.`;

  const comparisonCandles = candles.slice(-20, -1);

  const recentHigh = Math.max(
    ...comparisonCandles.map((candle) => candle.high)
  );

  const recentLow = Math.min(
    ...comparisonCandles.map((candle) => candle.low)
  );

  const brokeHigh = last.close > recentHigh;
  const brokeLow = last.close < recentLow;

  // Breakout monitoring levels (diagnostics only).
  const potentialBuyLevel = recentHigh;
  const potentialSellLevel = recentLow;

  const distanceToBuy = Math.max(
    0,
    potentialBuyLevel - last.close
  );

  const distanceToSell = Math.max(
    0,
    last.close - potentialSellLevel
  );

  const pipsToBuy = distanceToBuy / pipSize;
  const pipsToSell = distanceToSell / pipSize;

  const approachingBuyBreakout = Boolean(
    !brokeHigh &&
      distanceToBuy > 0 &&
      distanceToBuy <= approachingThreshold
  );

  const approachingSellBreakout = Boolean(
    !brokeLow &&
      distanceToSell > 0 &&
      distanceToSell <= approachingThreshold
  );

  const breakoutProximity = brokeHigh
    ? "BUY BREAKOUT LEVEL CROSSED"
    : brokeLow
      ? "SELL BREAKOUT LEVEL CROSSED"
      : approachingBuyBreakout
        ? "APPROACHING BUY BREAKOUT LEVEL"
        : approachingSellBreakout
          ? "APPROACHING SELL BREAKOUT LEVEL"
          : "NOT YET NEAR BREAKOUT LEVEL";

  const breakoutStatus = brokeHigh
    ? "PRICE ABOVE RANGE — confirmation required"
    : brokeLow
      ? "PRICE BELOW RANGE — confirmation required"
      : "PRICE INSIDE RANGE";

  const breakoutDirection = brokeHigh
    ? "bullish"
    : brokeLow
      ? "bearish"
      : null;

  const structure = brokeHigh
    ? "Bullish break of recent range"
    : brokeLow
      ? "Bearish break of recent range"
      : "No confirmed close beyond recent 19-candle range";

  const priceConfirmsBreakout =
    breakoutDirection === "bullish"
      ? last.close > ema20
      : breakoutDirection === "bearish"
        ? last.close < ema20
        : false;

  const candleBody = Math.abs(last.close - last.open);

  const bodyConfirmsBreakout =
    atrValue > 0 && candleBody >= atrValue * 0.15;

  const structuralConfirmation =
    structureTrend === breakoutDirection;

  const trendSupportsBreakout = trend === breakoutDirection;

  const breakoutConfirmed = Boolean(
    breakoutDirection &&
      priceConfirmsBreakout &&
      bodyConfirmsBreakout
  );

  const setupConfirmed = Boolean(
    breakoutConfirmed &&
      (trendSupportsBreakout || structuralConfirmation)
  );

  const signal = setupConfirmed
    ? breakoutDirection === "bullish"
      ? "BUY"
      : "SELL"
    : "NO TRADE";

  let reason;

  if (signal !== "NO TRADE") {
    reason =
      `${signal} setup: ${breakoutDirection} range break confirmed ` +
      `by price relative to EMA20 and candle strength, with ` +
      `${trendSupportsBreakout ? "EMA trend" : "swing structure"} support.`;
  } else if (!breakoutDirection) {
    reason =
      "No confirmed close beyond the recent 19-candle range. Wait for a valid setup.";
  } else if (!priceConfirmsBreakout) {
    reason =
      `${breakoutDirection} range break detected, but price has not confirmed it relative to EMA20.`;
  } else if (!bodyConfirmsBreakout) {
    reason =
      "The breakout candle body is too small relative to ATR. Possible weak breakout.";
  } else {
    reason =
      "A range break was detected, but neither EMA trend nor swing structure confirms its direction.";
  }

  const entry = last.close;
  const stopDistance = Math.max(atrValue * 1.5, entry * 0.0005);

  const stopLoss =
    signal === "BUY"
      ? entry - stopDistance
      : signal === "SELL"
        ? entry + stopDistance
        : null;

  const takeProfits =
    signal === "BUY"
      ? [
          entry + stopDistance,
          entry + stopDistance * 2,
          entry + stopDistance * 3,
        ]
      : signal === "SELL"
        ? [
            entry - stopDistance,
            entry - stopDistance * 2,
            entry - stopDistance * 3,
          ]
        : [null, null, null];

  const confidenceScore =
    signal === "NO TRADE"
      ? null
      : Math.round(
          Math.min(
            85,
            35 +
              (trendSupportsBreakout ? 20 : 0) +
              (structuralConfirmation ? 20 : 0) +
              (bodyConfirmsBreakout ? 5 : 0) +
              (priceConfirmsBreakout ? 5 : 0)
          )
        );

  const checks = [
    {
      id: "trend",
      label: "Directional technical confirmation",
      passed: setupConfirmed,
      detail: setupConfirmed
        ? `The ${breakoutDirection} breakout has EMA-price and candle confirmation, supported by ${trendSupportsBreakout ? "EMA trend" : "swing structure"}.`
        : reason,
    },
    {
      id: "breakout",
      label: "Confirmed 1H breakout",
      passed: breakoutConfirmed,
      detail: breakoutConfirmed
        ? `${breakoutDirection} breakout confirmed by EMA20 position and candle body.`
        : !breakoutDirection
          ? "The latest candle did not close beyond the recent range."
          : !priceConfirmsBreakout
            ? `The ${breakoutDirection} breakout has not confirmed relative to EMA20.`
            : "The breakout candle body is weak relative to ATR.",
    },
  ];

  return {
    signal,
    trend,
    structureTrend,
    breakoutDirection,
    structure,
    reason,
    checks,

    // Breakout diagnostics
    recentHigh: round(recentHigh, pricePrecision),
    recentLow: round(recentLow, pricePrecision),
    brokeHigh,
    brokeLow,
    priceConfirmsBreakout,
    bodyConfirmsBreakout,
    structuralConfirmation,
    trendSupportsBreakout,
    breakoutConfirmed,
    setupConfirmed,

    potentialBuyLevel: round(potentialBuyLevel, pricePrecision),
    potentialSellLevel: round(potentialSellLevel, pricePrecision),
    distanceToBuy: round(distanceToBuy, pricePrecision),
    distanceToSell: round(distanceToSell, pricePrecision),
    pipsToBuy: Number(pipsToBuy.toFixed(1)),
    pipsToSell: Number(pipsToSell.toFixed(1)),
    breakoutStatus,

    // Trade levels
    entry: round(entry, pricePrecision),
    stopLoss:
      stopLoss == null
        ? null
        : round(stopLoss, pricePrecision),
    takeProfits: takeProfits.map((value) =>
      value == null ? null : round(value, pricePrecision)
    ),

    // Indicator values
    atr: round(atrValue, pricePrecision),
    ema20: round(ema20, pricePrecision),
    ema50: round(ema50, pricePrecision),
    lastCandleTime: last.time,
    latestCandle: last,

    // Extended market-structure report
    swingHighPattern,
    swingLowPattern,
    marketStructureSummary,
    support:
      support == null ? null : round(support, pricePrecision),
    resistance:
      resistance == null ? null : round(resistance, pricePrecision),
    distanceToSupport:
      distanceToSupport == null
        ? null
        : round(distanceToSupport, pricePrecision),
    distanceToResistance:
      distanceToResistance == null
        ? null
        : round(distanceToResistance, pricePrecision),
    supportDistancePips,
    resistanceDistancePips,
    approachingSupport,
    approachingResistance,
    marketPosition,
    approachingBuyBreakout,
    approachingSellBreakout,
    breakoutProximity,

    // Confidence and market structure
    confidenceScore,
    confidenceNote:
      "Heuristic confluence score, not a probability or proven win rate.",
    swingHigh: lastSwingHigh
      ? round(lastSwingHigh.price, pricePrecision)
      : null,
    swingLow: lastSwingLow
      ? round(lastSwingLow.price, pricePrecision)
      : null,
    dataPoints: candles.length,
    previousClose: previous.close,
  };
}

export function combineAnalysis(oneHour, fourHour, fundamentals = {}) {
  const validBias = ["bullish", "bearish", "neutral"].includes(
    fundamentals.bias
  );

  const bias = validBias ? fundamentals.bias : "unknown";

  const fundamentalsComplete =
    fundamentals.complete === true && validBias;

  const analysisMode = fundamentalsComplete
    ? "TECHNICAL + FUNDAMENTAL"
    : "TECHNICAL ONLY";

  const eventRisk = String(
    fundamentals.eventRisk || "unknown"
  ).toLowerCase();

  const calendarCoverage = String(
    fundamentals.calendarCoverage || "unknown"
  ).toLowerCase();

  const highRisk = eventRisk === "high";

  // Calendar safety requires explicitly verified coverage.
  const calendarVerified = calendarCoverage === "verified";

  const calendarUnverified =
    !calendarVerified || eventRisk === "unknown";

  const technicalSignal = oneHour.signal;

  const hasTechnicalSignal =
    technicalSignal === "BUY" || technicalSignal === "SELL";

  const signalDirection =
    technicalSignal === "BUY"
      ? "bullish"
      : technicalSignal === "SELL"
        ? "bearish"
        : "unknown";

  // Higher-timeframe EMA trend comparison
  const fourHourOpposes =
    (signalDirection === "bullish" && fourHour.trend === "bearish") ||
    (signalDirection === "bearish" && fourHour.trend === "bullish");

  // Swing structure comparison
  const oneHourStructure = oneHour.structureTrend || "unknown";
  const fourHourStructure = fourHour.structureTrend || "unknown";

  const fourHourStructureOpposes =
    (signalDirection === "bullish" && fourHourStructure === "bearish") ||
    (signalDirection === "bearish" && fourHourStructure === "bullish");

  const oneHourStructureConfirms =
    oneHourStructure === signalDirection;

  const fourHourStructureConfirms =
    fourHourStructure === signalDirection;

  const structureAlignment =
    oneHourStructure === "unknown" ||
    fourHourStructure === "unknown" ||
    oneHourStructure === "mixed" ||
    fourHourStructure === "mixed"
      ? "inconclusive"
      : oneHourStructure === fourHourStructure
        ? "aligned"
        : "conflicting";

  const emaAlignment =
    oneHour.trend === fourHour.trend &&
    oneHour.trend !== "mixed"
      ? "aligned"
      : "conflicting";

  const biasConflicts =
    fundamentalsComplete &&
    bias !== "neutral" &&
    bias !== signalDirection;

  // Only a detected high-impact event inside the configured
// protection window blocks a new entry.
// Unverified calendar coverage remains a warning, not a permanent block.
const eventRiskAcceptable =
  fundamentals.calendarAvailable !== false && !highRisk;

  const technicalSetupValid = Boolean(
    hasTechnicalSignal &&
      oneHour.checks?.some(
        (check) => check.id === "trend" && check.passed
      ) &&
      oneHour.checks?.some(
        (check) => check.id === "breakout" && check.passed
      )
  );

  const checks = [
    {
      id: "swing-structure-confirmation",
      label: "1H and 4H swing structure confirmation",
      passed:
        oneHourStructureConfirms &&
        fourHourStructureConfirms,
      detail:
        oneHourStructureConfirms && fourHourStructureConfirms
          ? `Both the 1H and 4H swing structures confirm the ${signalDirection} direction.`
          : !oneHourStructureConfirms &&
              !fourHourStructureConfirms
            ? `Neither timeframe confirms the ${signalDirection} direction. 1H: ${oneHourStructure}; 4H: ${fourHourStructure}.`
            : !oneHourStructureConfirms
              ? `The 1H structure (${oneHourStructure}) does not confirm the ${signalDirection} direction.`
              : `The 4H structure (${fourHourStructure}) does not confirm the ${signalDirection} direction.`,
    },
    {
      id: "higher-timeframe-structure",
      label: "4H swing structure does not oppose setup",
      passed: !fourHourStructureOpposes,
      detail: fourHourStructureOpposes
        ? `The 4H ${fourHourStructure} swing structure opposes the 1H ${signalDirection} setup.`
        : structureAlignment === "aligned"
          ? `The 1H and 4H swing structures agree (${oneHourStructure}).`
          : structureAlignment === "conflicting"
            ? `The 1H structure is ${oneHourStructure}, while the 4H structure is ${fourHourStructure}. The timeframes disagree.`
            : `The 4H swing structure does not directly oppose the setup, but confirmation remains inconclusive. 1H: ${oneHourStructure}; 4H: ${fourHourStructure}.`,
    },
    {
      id: "higher-timeframe-ema",
      label: "4H EMA trend does not oppose setup",
      passed: !fourHourOpposes,
      detail: fourHourOpposes
        ? `The 4H EMA trend (${fourHour.trend}) opposes the 1H ${signalDirection} setup. NSB blocks the trade.`
        : `The 4H EMA trend (${fourHour.trend}) does not directly oppose the 1H ${signalDirection} setup.`,
    },
    {
      id: "directional-trend",
      label: "Directional 1H technical setup",
      passed: Boolean(technicalSetupValid),
      detail: technicalSetupValid
        ? oneHour.reason
        : oneHour.reason || "The 1H technical setup is not confirmed.",
    },
    {
      id: "breakout-confirmation",
      label: "Confirmed 1H breakout",
      passed: Boolean(
        oneHour.checks?.some(
          (check) => check.id === "breakout" && check.passed
        )
      ),
      detail:
        oneHour.checks?.find((check) => check.id === "breakout")?.detail ||
        "No confirmed 1H breakout was returned.",
    },
    {
      id: "fundamentals",
      label: "Fundamental assessment",
      passed: true,
      detail: fundamentalsComplete
        ? "Fundamental bias data is available."
        : "Fundamental data is incomplete. NSB is operating in technical-only mode. This does not override calendar safety checks.",
    },
    {
  id: "event-risk",
  label: "15-minute high-impact news protection",
  passed: eventRiskAcceptable,
  detail: highRisk
    ? "A relevant high-impact event is inside the configured 15-minute protection window. NSB blocks new entries."
    : calendarUnverified
      ? "Calendar coverage is unverified. No high-impact event is currently detected inside the protection window, so technical signals can still be evaluated. This is not proof that the calendar is complete."
      : "No high-impact event is detected inside the configured protection window.",
},
    {
      id: "fundamental-bias",
      label: "Fundamental and technical bias",
      passed: !fundamentalsComplete || !biasConflicts,
      detail: !fundamentalsComplete
        ? "No complete fundamental bias is available; no fundamental direction is assumed."
        : biasConflicts
          ? `Fundamental bias (${bias}) conflicts with the 1H setup (${signalDirection}).`
          : `Fundamental bias (${bias}) does not conflict with the 1H setup.`,
    },
  ];

  const failedChecks = checks.filter((check) => !check.passed);
  const passedChecks = checks.filter((check) => check.passed);

  const signal =
    failedChecks.length === 0 && technicalSetupValid
      ? technicalSignal
      : "NO TRADE";

  const reason =
  signal !== "NO TRADE"
    ? fundamentalsComplete
      ? "Technical setup confirmed, both timeframe structures align, 4H EMA context does not oppose the setup, and fundamental bias does not conflict."
      : calendarUnverified
        ? "Technical-only setup confirmed. Both timeframe structures align and no high-impact event is detected inside the protection window. Calendar coverage remains unverified."
        : "Technical-only setup confirmed. Both timeframe structures align and the event-risk check passed."
    : failedChecks.length
      ? failedChecks.map((check) => check.detail).join(" ")
      : oneHour.reason || "No trade setup is confirmed.";

  return {
    signal,
    reason,

    aligned: emaAlignment === "aligned",

    emaAlignment,
    structureAlignment,

    oneHourStructure,
    fourHourStructure,

    oneHourStructureConfirms,
    fourHourStructureConfirms,
    fourHourStructureOpposes,
    fourHourOpposes,

    technicalSetupValid: Boolean(technicalSetupValid),
    technicalSignal,
    entryBlockedByNews: highRisk,
    entryAllowed: signal !== "NO TRADE",
    fundamentalsComplete,
    analysisMode,
    eventRisk,
    calendarCoverage,
    calendarUnverified,
    bias,

    checks,
    failedChecks,
    passedChecks,
  };
}