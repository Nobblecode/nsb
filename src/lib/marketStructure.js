
const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / (values.length || 1);

const round = (number) => Number(number.toFixed(5));

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

export function analyzeStructure(candles) {
  if (!validCandles(candles)) {
    throw new Error(
      "At least 60 valid OHLC candles are required for structure analysis."
    );
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

  const comparisonCandles = candles.slice(-20, -1);

  const recentHigh = Math.max(
    ...comparisonCandles.map((candle) => candle.high)
  );

  const recentLow = Math.min(
    ...comparisonCandles.map((candle) => candle.low)
  );

  const brokeHigh = last.close > recentHigh;
  const brokeLow = last.close < recentLow;

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
    entry: round(entry),
    stopLoss: stopLoss == null ? null : round(stopLoss),
    takeProfits: takeProfits.map((value) =>
      value == null ? null : round(value)
    ),
    atr: round(atrValue),
    ema20: round(ema20),
    ema50: round(ema50),
    lastCandleTime: last.time,
    recentHigh: round(recentHigh),
    recentLow: round(recentLow),
    latestCandle: last,
    confidenceScore,
    confidenceNote:
      "Heuristic confluence score, not a probability or proven win rate.",
    swingHigh: lastSwingHigh ? round(lastSwingHigh.price) : null,
    swingLow: lastSwingLow ? round(lastSwingLow.price) : null,
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

  const eventRisk = fundamentals.eventRisk || "unknown";
  const highRisk = eventRisk === "high";

  const technicalSignal = oneHour.signal;

  const hasTechnicalSignal =
    technicalSignal === "BUY" || technicalSignal === "SELL";

  const signalDirection =
    technicalSignal === "BUY"
      ? "bullish"
      : technicalSignal === "SELL"
        ? "bearish"
        : "unknown";

  const fourHourOpposes =
    (signalDirection === "bullish" && fourHour.trend === "bearish") ||
    (signalDirection === "bearish" && fourHour.trend === "bullish");

  const biasConflicts =
    fundamentalsComplete &&
    bias !== "neutral" &&
    bias !== signalDirection;

  const eventRiskAcceptable = !highRisk;

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
      id: "trend-alignment",
      label: "4H trend context",
      passed: !fourHourOpposes,
      detail: fourHourOpposes
        ? `The 4H ${fourHour.trend} trend opposes the 1H ${signalDirection} setup.`
        : fourHour.trend === "mixed"
          ? "The 4H EMA trend is mixed. It does not confirm direction, so use extra caution."
          : `The 4H trend (${fourHour.trend}) does not oppose the 1H setup.`,
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
        : "Fundamentals are incomplete. Technical-only mode is being used; fundamental direction is not assumed.",
    },
    {
      id: "event-risk",
      label: "High-impact event risk",
      passed: eventRiskAcceptable,
      detail: highRisk
        ? "A high-impact event is identified. NSB blocks new setups."
        : eventRisk === "unknown"
          ? "Calendar risk is unverified. Technical-only analysis may proceed, but unexpected event risk remains."
          : `Reported event risk is ${eventRisk}.`,
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
        ? "Technical setup confirmed, 4H context does not oppose it, and fundamental checks passed."
        : "Technical-only setup confirmed. Fundamental data is incomplete and calendar risk may remain unverified."
      : failedChecks.length
        ? failedChecks.map((check) => check.detail).join(" ")
        : oneHour.reason || "No trade setup is confirmed.";

  return {
    signal,
    reason,
    aligned:
      oneHour.trend === fourHour.trend &&
      oneHour.trend !== "mixed",
    technicalSetupValid: Boolean(technicalSetupValid),
    fundamentalsComplete,
    analysisMode,
    eventRisk,
    bias,
    checks,
    failedChecks,
    passedChecks,
  };
}
