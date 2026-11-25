
import { analyzeStructure } from "@/lib/marketStructure";
import { INSTRUMENTS } from "@/lib/marketData";
import { calculateBacktestMetrics } from "./metrics";

const ONE_HOUR = 60 * 60 * 1000;
const FOUR_HOURS = 4 * ONE_HOUR;
const WARMUP_CANDLES = 250;

function timestamp(time) {
  if (typeof time !== "string") return NaN;

  return Date.parse(`${time.replace(" ", "T")}Z`);
}

function hasPassedCheck(analysis, id) {
  return Boolean(
    analysis.checks?.some(
      (check) => check.id === id && check.passed
    )
  );
}

function isTechnicalSetupValid(oneHour, fourHour) {
  if (!["BUY", "SELL"].includes(oneHour.signal)) {
    return false;
  }

  const direction =
    oneHour.signal === "BUY" ? "bullish" : "bearish";

  const oneHourStructure =
    oneHour.structureTrend || "unknown";

  const fourHourStructure =
    fourHour.structureTrend || "unknown";

  const fourHourOpposes =
    (direction === "bullish" && fourHour.trend === "bearish") ||
    (direction === "bearish" && fourHour.trend === "bullish");

  return (
    hasPassedCheck(oneHour, "trend") &&
    hasPassedCheck(oneHour, "breakout") &&
    oneHourStructure === direction &&
    fourHourStructure === direction &&
    !fourHourOpposes
  );
}

/**
 * Simulates one trade using approximate bid/ask prices.
 *
 * Historical OHLC candles are treated as mid-market prices.
 * A fixed spread is used to estimate bid and ask prices.
 *
 * Slippage is applied adversely to executions.
 */
function simulateTrade({
  signal,
  signalCandle,
  entryCandle,
  entryIndex,
  candles,
  lastEligibleIndex,
  pipSize,
  atrValue,
  spreadPips,
  slippagePips,
}) {
  if (lastEligibleIndex < entryIndex) {
    return null;
  }

  const direction = signal === "BUY" ? 1 : -1;

  const halfSpread = (spreadPips / 2) * pipSize;
  const slippage = slippagePips * pipSize;

  /*
   * BUY:
   *   Entry at ask = mid + half spread + slippage.
   *
   * SELL:
   *   Entry at bid = mid - half spread - slippage.
   */
  const entry =
    entryCandle.open +
    direction * (halfSpread + slippage);

  const riskDistance = Math.max(
    atrValue * 1.5,
    signalCandle.close * 0.0005
  );

  const stopLoss = entry - direction * riskDistance;

  const targets = [1, 2, 3].map(
    (multiple) =>
      entry + direction * riskDistance * multiple
  );

  const targetHits = [false, false, false];

  let remaining = 1;
  let netPricePnl = 0;
  let exitIndex = entryIndex;
  let exitReason = "end-of-data";

  for (
    let i = entryIndex;
    i <= lastEligibleIndex;
    i++
  ) {
    const candle = candles[i];

    /*
     * Approximate executable quotes from mid-market OHLC.
     *
     * BUY positions close by selling at the bid.
     * SELL positions close by buying at the ask.
     */
    const executableOpen =
      candle.open - direction * halfSpread;

    const executableHigh =
      direction === 1
        ? candle.high - halfSpread
        : candle.high + halfSpread;

    const executableLow =
      direction === 1
        ? candle.low - halfSpread
        : candle.low + halfSpread;

    /*
     * Stop triggers are checked against the executable
     * bid/ask side, not raw mid-market prices.
     */
    const stopHit =
      direction === 1
        ? executableLow <= stopLoss
        : executableHigh >= stopLoss;

    /*
     * Conservative intrabar assumption:
     * if a stop and target are both touched in one candle,
     * the stop is assumed to occur first.
     */
    if (stopHit) {
      /*
       * If the candle opens beyond the stop, use the
       * adverse opening quote instead of the stop price.
       *
       * BUY: lower exit price is worse.
       * SELL: higher exit price is worse.
       */
      const stopBaseFill =
        direction === 1
          ? Math.min(stopLoss, executableOpen)
          : Math.max(stopLoss, executableOpen);

      const exitFill =
        stopBaseFill - direction * slippage;

      netPricePnl +=
        direction * (exitFill - entry) * remaining;

      remaining = 0;
      exitIndex = i;
      exitReason = "stop-loss";

      break;
    }

    for (let targetIndex = 0; targetIndex < 3; targetIndex++) {
      if (targetHits[targetIndex] || remaining <= 0) {
        continue;
      }

      const target = targets[targetIndex];

      /*
       * BUY target: bid must reach the target.
       * SELL target: ask must reach the target.
       */
      const targetHit =
        direction === 1
          ? executableHigh >= target
          : executableLow <= target;

      if (!targetHit) {
        continue;
      }

      const fraction = Math.min(1 / 3, remaining);

      /*
       * Target execution is conservatively filled at the
       * target price, with adverse slippage.
       *
       * The spread is already represented by the
       * executable bid/ask trigger.
       */
      const exitFill =
        target - direction * slippage;

      netPricePnl +=
        direction * (exitFill - entry) * fraction;

      remaining -= fraction;
      targetHits[targetIndex] = true;

      if (remaining < 0.0000001) {
        remaining = 0;
        exitIndex = i;
        exitReason = `target-${targetIndex + 1}`;

        break;
      }
    }

    if (remaining === 0) {
      break;
    }

    exitIndex = i;
  }

  /*
   * Close any remaining position at the last completed
   * candle's executable closing quote.
   */
  if (remaining > 0) {
    const lastCandle = candles[lastEligibleIndex];

    const executableClose =
      lastCandle.close - direction * halfSpread;

    const exitFill =
      executableClose - direction * slippage;

    netPricePnl +=
      direction * (exitFill - entry) * remaining;

    remaining = 0;
    exitIndex = lastEligibleIndex;
    exitReason = "end-of-data";
  }

  const netR = netPricePnl / riskDistance;
  const netPips = netPricePnl / pipSize;

  return {
    direction: signal,

    signalTime: signalCandle.time,
    entryTime: entryCandle.time,
    exitTime: candles[exitIndex].time,

    entry: Number(entry.toFixed(8)),
    stopLoss: Number(stopLoss.toFixed(8)),

    takeProfits: targets.map(
      (target) => Number(target.toFixed(8))
    ),

    targetHits,

    netR: Number(netR.toFixed(5)),
    netPips: Number(netPips.toFixed(2)),

    outcome:
      netR > 0.00001
        ? "WIN"
        : netR < -0.00001
          ? "LOSS"
          : "BREAKEVEN",

    exitReason,
    durationCandles: exitIndex - entryIndex + 1,
  };
}

export function runBacktest({
  symbol,
  oneHourCandles,
  fourHourCandles,
  spreadPips = 0,
  slippagePips = 0,
  testStartTime,
  testEndTime,
}) {
  const instrument = INSTRUMENTS[symbol];

  if (!instrument) {
    throw new Error(`Unsupported instrument: ${symbol}`);
  }

  if (
    !Number.isFinite(spreadPips) ||
    spreadPips < 0 ||
    !Number.isFinite(slippagePips) ||
    slippagePips < 0
  ) {
    throw new Error(
      "Spread and slippage must be non-negative numbers."
    );
  }

  if (
    !Number.isFinite(testStartTime) ||
    !Number.isFinite(testEndTime) ||
    testStartTime >= testEndTime
  ) {
    throw new Error(
      "Valid backtest start and end boundaries are required."
    );
  }

  if (
    !Array.isArray(oneHourCandles) ||
    !Array.isArray(fourHourCandles) ||
    oneHourCandles.length < WARMUP_CANDLES ||
    fourHourCandles.length < WARMUP_CANDLES
  ) {
    throw new Error(
      "At least 250 candles are required for both 1H and 4H data."
    );
  }

  const trades = [];

  const diagnostics = {
    evaluatedCandles: 0,
    noSignal: 0,
    insufficientFourHourHistory: 0,
    rejectedTechnicalConfirmation: 0,
    delayedEntrySkipped: 0,
    missingEntryCandle: 0,
    endOfDataClosedTrades: 0,
  };

  /*
   * Find the final 1H candle that has completely closed
   * within the selected backtest period.
   *
   * This is calculated once rather than for every trade.
   */
  const lastEligibleIndex = oneHourCandles.findLastIndex(
    (candle) => {
      const candleTime = timestamp(candle.time);

      return (
        Number.isFinite(candleTime) &&
        candleTime + ONE_HOUR <= testEndTime
      );
    }
  );

  if (lastEligibleIndex < 0) {
    throw new Error(
      "No completed 1H candles are available inside the selected period."
    );
  }

  let fourHourIndex = 0;
  let index = WARMUP_CANDLES - 1;

  while (index < oneHourCandles.length - 1) {
    const signalCandle = oneHourCandles[index];

    const signalOpenTime = timestamp(signalCandle.time);

    const signalCloseTime =
      signalOpenTime + ONE_HOUR;

    /*
     * A signal is eligible when its candle closes
     * after the selected start and no later than the end.
     *
     * Candles before the selected period remain available
     * for indicator warm-up.
     */
    if (signalCloseTime <= testStartTime) {
      index++;
      continue;
    }

    if (signalCloseTime > testEndTime) {
      break;
    }

    /*
     * Only completed 4H candles may confirm a 1H signal.
     */
    while (
      fourHourIndex < fourHourCandles.length &&
      timestamp(fourHourCandles[fourHourIndex].time) +
        FOUR_HOURS <= signalCloseTime
    ) {
      fourHourIndex++;
    }

    if (fourHourIndex < WARMUP_CANDLES) {
      diagnostics.insufficientFourHourHistory++;
      index++;
      continue;
    }

    const oneHourWindow = oneHourCandles.slice(
      index - WARMUP_CANDLES + 1,
      index + 1
    );

    const fourHourWindow = fourHourCandles.slice(
      fourHourIndex - WARMUP_CANDLES,
      fourHourIndex
    );

    if (
      oneHourWindow.length < WARMUP_CANDLES ||
      fourHourWindow.length < WARMUP_CANDLES
    ) {
      diagnostics.insufficientFourHourHistory++;
      index++;
      continue;
    }

    diagnostics.evaluatedCandles++;

    const options = {
      pipSize: instrument.pipSize,
      pricePrecision: instrument.pricePrecision,
    };

    const oneHour = analyzeStructure(
      oneHourWindow,
      options
    );

    const fourHour = analyzeStructure(
      fourHourWindow,
      options
    );

    if (oneHour.signal === "NO TRADE") {
      diagnostics.noSignal++;
      index++;
      continue;
    }

    if (!isTechnicalSetupValid(oneHour, fourHour)) {
      diagnostics.rejectedTechnicalConfirmation++;
      index++;
      continue;
    }

    const entryIndex = index + 1;
    const entryCandle = oneHourCandles[entryIndex];

    if (!entryCandle) {
      diagnostics.missingEntryCandle++;
      index++;
      continue;
    }

    const entryOpenTime = timestamp(entryCandle.time);

    /*
     * A valid entry must occur immediately after the
     * signal candle closes.
     *
     * This prevents stale signals from being entered
     * after missing candles, market closures or weekends.
     */
    if (entryOpenTime !== signalCloseTime) {
      diagnostics.delayedEntrySkipped++;
      index++;
      continue;
    }

    if (entryOpenTime >= testEndTime) {
      diagnostics.missingEntryCandle++;
      index++;
      continue;
    }

    const trade = simulateTrade({
      signal: oneHour.signal,
      signalCandle,
      entryCandle,
      entryIndex,
      candles: oneHourCandles,
      lastEligibleIndex,
      pipSize: instrument.pipSize,
      atrValue: oneHour.atr,
      spreadPips,
      slippagePips,
    });

    if (!trade) {
      index++;
      continue;
    }

    trades.push(trade);

    if (trade.exitReason === "end-of-data") {
      diagnostics.endOfDataClosedTrades++;
    }

    /*
     * One open position per instrument at a time.
     * Resume after the candle where the position closed.
     */
    const exitIndex = oneHourCandles.findIndex(
      (candle) => candle.time === trade.exitTime
    );

    index =
      exitIndex >= index
        ? exitIndex + 1
        : index + 1;
  }

  trades.sort(
    (a, b) =>
      timestamp(a.exitTime) - timestamp(b.exitTime)
  );

  return {
    symbol,

    strategy: "NSB existing technical strategy",
    mode: "TECHNICAL BASELINE",
    calendarReplayed: false,

    assumptions: [
      "Signals are evaluated only on completed 1H candles inside the selected test period.",
      "Entries occur at the immediately following 1H candle open.",
      "Signals are skipped if the next 1H candle does not open exactly when the signal candle closes.",
      "Up to 250 completed historical candles are used for indicator warm-up.",
      "Warm-up candles before the selected start date do not generate trades.",
      "Only completed 4H candles are used for confirmation.",
      "Historical OHLC values are treated as mid-market prices.",
      "A fixed spread estimates bid and ask prices.",
      "BUY positions enter at the ask and exit at the bid.",
      "SELL positions enter at the bid and exit at the ask.",
      "Slippage is applied adversely to entry and exit executions.",
      "Stop-loss triggers use the executable bid or ask side.",
      "If price opens beyond a stop-loss, the adverse opening price is used as the stop fill reference.",
      "Stop-loss is assumed to occur first if stop and target are touched in the same candle.",
      "One open position per instrument at a time.",
      "One-third of the position exits at each of 1R, 2R and 3R.",
      "The original stop-loss remains unchanged after partial exits.",
      "Remaining positions are closed at the last available completed candle when the test ends.",
      "Historical economic-calendar events are not replayed.",
    ],

    diagnostics,

    metrics: calculateBacktestMetrics(trades),

    trades,
  };
}
