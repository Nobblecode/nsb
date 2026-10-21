
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

export function analyzeStructure(candles) {
  if (!Array.isArray(candles) || candles.length < 60) {
    throw new Error("At least 60 valid candles are required for structure analysis.");
  }

  const closes = candles.map((candle) => candle.close);
  const last = candles[candles.length - 1];
  const previous = candles[candles.length - 2];

  const fastEMA = ema(closes, 20);
  const slowEMA = ema(closes, 50);

  const { highs, lows } = swings(candles.slice(-100), 2);
  const lastSwingHigh = highs.at(-1);
  const lastSwingLow = lows.at(-1);

  const atrValue = atr(candles);

  const trend =
    fastEMA.at(-1) > slowEMA.at(-1) && last.close > slowEMA.at(-1)
      ? "bullish"
      : fastEMA.at(-1) < slowEMA.at(-1) && last.close < slowEMA.at(-1)
        ? "bearish"
        : "mixed";

  // Compare the latest candle close with the previous 19 candles.
  const comparisonCandles = candles.slice(-20, -1);
  const recentHigh = Math.max(...comparisonCandles.map((c) => c.high));
  const recentLow = Math.min(...comparisonCandles.map((c) => c.low));

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

  const trendIsDirectional = trend !== "mixed";
  const breakoutMatchesTrend = breakoutDirection === trend;

  let signal = "NO TRADE";
  let reason = "The trend and breakout conditions are not both satisfied.";

  if (trendIsDirectional && breakoutMatchesTrend) {
    signal = trend === "bullish" ? "BUY" : "SELL";
    reason =
      signal === "BUY"
        ? "Bullish trend and bullish range breakout confirmed."
        : "Bearish trend and bearish range breakout confirmed.";
  }

  const entry = last.close;
  const stopDistance = Math.max(atrValue * 1.5, 0.0005);

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

  const confidenceScore = Math.round(
    Math.min(
      85,
      35 +
        (trendIsDirectional ? 20 : 0) +
        (breakoutMatchesTrend ? 20 : 0) +
        (trendIsDirectional &&
        ((last.close > fastEMA.at(-1) && trend === "bullish") ||
          (last.close < fastEMA.at(-1) && trend === "bearish"))
          ? 10
          : 0)
    )
  );

  const checks = [
    {
      id: "trend",
      label: "Directional trend",
      passed: trendIsDirectional,
      detail: trendIsDirectional
        ? `The 1H trend is ${trend}.`
        : "The 1H EMA trend is mixed.",
    },
    {
      id: "breakout",
      label: "Confirmed 1H breakout",
      passed: breakoutMatchesTrend,
      detail: breakoutMatchesTrend
        ? `The candle closed beyond the recent range in the ${trend} direction.`
        : breakoutDirection
          ? `A ${breakoutDirection} breakout conflicts with the ${trend} trend.`
          : "The latest candle did not close beyond the recent range.",
    },
  ];

  return {
    signal,
    trend,
    structure,
    reason,
    checks,
    entry: round(entry),
    stopLoss: stopLoss == null ? null : round(stopLoss),
    takeProfits: takeProfits.map((value) =>
      value == null ? null : round(value)
    ),
    atr: round(atrValue),
    ema20: round(fastEMA.at(-1)),
    ema50: round(slowEMA.at(-1)),
    lastCandleTime: last.time,
    recentHigh: round(recentHigh),
    recentLow: round(recentLow),
    latestCandle: last,
    confidenceScore: signal === "NO TRADE" ? null : confidenceScore,
    confidenceNote:
      "Heuristic confluence score, not a probability or proven win rate.",
    swingHigh: lastSwingHigh ? round(lastSwingHigh.price) : null,
    swingLow: lastSwingLow ? round(lastSwingLow.price) : null,
    dataPoints: candles.length,
    previousClose: previous.close,
  };
}


export function combineAnalysis(oneHour, fourHour, fundamentals = {}) {
  const aligned =
    oneHour.trend === fourHour.trend &&
    oneHour.trend !== "mixed";

  const validBias = ["bullish", "bearish", "neutral"].includes(
    fundamentals.bias
  );

  const bias = validBias ? fundamentals.bias : "unknown";
  const mode = fundamentals.mode || "manual";

  const fundamentalsComplete =
    fundamentals.complete === true && validBias;

  const calendarCoverageVerified =
    fundamentals.coverageVerified === true ||
    fundamentals.calendarCoverage === "verified";

  const reportedEventRisk = fundamentals.eventRisk || "unknown";

  const eventRisk = calendarCoverageVerified
    ? reportedEventRisk
    : "unknown";

  const highRisk = eventRisk === "high";

  const eventRiskAcceptable =
    calendarCoverageVerified &&
    ["low", "medium"].includes(eventRisk);

  const biasConflicts =
    bias !== "neutral" &&
    bias !== "unknown" &&
    bias !== oneHour.trend;

  const trendCheck = oneHour.checks?.find(
    (check) => check.id === "trend"
  );

  const breakoutCheck = oneHour.checks?.find(
    (check) => check.id === "breakout"
  );

  const technicalSetupValid = Boolean(
    trendCheck?.passed && breakoutCheck?.passed
  );

  const checks = [
    {
      id: "trend-alignment",
      label: "1H and 4H trend alignment",
      passed: aligned,
      detail: aligned
        ? `Both timeframes are ${oneHour.trend}.`
        : `1H trend: ${oneHour.trend}. 4H trend: ${fourHour.trend}. Both must agree and cannot be mixed.`,
    },
    {
      id: "directional-trend",
      label: "Directional 1H trend",
      passed: Boolean(trendCheck?.passed),
      detail:
        trendCheck?.detail ||
        "No directional trend confirmation was returned.",
    },
    {
      id: "breakout-confirmation",
      label: "Confirmed 1H breakout",
      passed: Boolean(breakoutCheck?.passed),
      detail:
        breakoutCheck?.detail ||
        "No breakout confirmation was returned.",
    },
    {
      id: "fundamentals",
      label: "Fundamental assessment complete",
      passed: fundamentalsComplete,
      detail: fundamentalsComplete
        ? `The ${mode} fundamental assessment is complete.`
        : fundamentals.note ||
          "Fundamental data is incomplete or the bias has not been established. A neutral default is not sufficient evidence.",
    },
    {
  id: "event-risk",
  label: "High-impact event risk",
  passed: eventRiskAcceptable && !highRisk,
  detail: highRisk
    ? "High-impact event risk detected. NSB blocks new setups."
    : !calendarCoverageVerified
      ? "Economic calendar coverage is unverified. NSB blocks new setups until coverage and event risk can be verified."
      : eventRiskAcceptable
        ? `Verified event risk is ${eventRisk}; the event-risk check passed.`
        : "Event risk is unknown or cannot be verified. NSB blocks new setups.",
},
    {
      id: "fundamental-bias",
      label: "Fundamental and technical bias",
      passed:
        fundamentalsComplete &&
        validBias &&
        !biasConflicts,
      detail: !fundamentalsComplete || !validBias
        ? "Fundamental bias cannot be verified until a complete assessment is available."
        : biasConflicts
          ? `Fundamental bias (${bias}) conflicts with the 1H trend (${oneHour.trend}).`
          : `Fundamental bias (${bias}) does not conflict with the 1H trend.`,
    },
  ];

  const failedChecks = checks.filter((check) => !check.passed);
  const passedChecks = checks.filter((check) => check.passed);

  const signal =
    failedChecks.length === 0 &&
    oneHour.signal !== "NO TRADE"
      ? oneHour.signal
      : "NO TRADE";

  const reason =
    signal !== "NO TRADE"
      ? `All ${checks.length} required checks passed.`
      : failedChecks.length > 0
        ? failedChecks.map((check) => check.detail).join(" ")
        : oneHour.reason || "The technical setup did not produce a trade signal.";

  return {
    signal,
    reason,
    aligned,
    technicalSetupValid,
    fundamentalsComplete,
    eventRisk,
    bias,
    checks,
    failedChecks,
    passedChecks,
  };
}
