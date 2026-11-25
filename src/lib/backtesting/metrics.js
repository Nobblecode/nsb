
const BREAKEVEN_THRESHOLD = 0.00001;

function parseTradeTime(value) {
  if (typeof value !== "string") {
    return NaN;
  }

  return Date.parse(`${value.replace(" ", "T")}Z`);
}

export function calculateBacktestMetrics(trades = []) {
  // Always calculate chronological drawdown and streaks.
  const orderedTrades = [...trades].sort((a, b) => {
    const aTime = parseTradeTime(a.exitTime);
    const bTime = parseTradeTime(b.exitTime);

    return aTime - bTime;
  });

  const totalTrades = orderedTrades.length;

  const winners = orderedTrades.filter(
    (trade) => trade.netR > BREAKEVEN_THRESHOLD
  );

  const losers = orderedTrades.filter(
    (trade) => trade.netR < -BREAKEVEN_THRESHOLD
  );

  const breakeven = orderedTrades.filter(
    (trade) =>
      Math.abs(trade.netR) <= BREAKEVEN_THRESHOLD
  );

  const grossProfitR = winners.reduce(
    (sum, trade) => sum + trade.netR,
    0
  );

  const grossLossR = Math.abs(
    losers.reduce(
      (sum, trade) => sum + trade.netR,
      0
    )
  );

  const netR = orderedTrades.reduce(
    (sum, trade) => sum + trade.netR,
    0
  );

  const netPips = orderedTrades.reduce(
    (sum, trade) => sum + trade.netPips,
    0
  );

  const profitFactor =
    grossLossR > 0
      ? grossProfitR / grossLossR
      : grossProfitR > 0
        ? null
        : 0;

  const profitFactorStatus =
    grossLossR > 0
      ? "finite"
      : grossProfitR > 0
        ? "infinite"
        : "no-profit-or-no-trades";

  const winRate =
    totalTrades > 0
      ? (winners.length / totalTrades) * 100
      : 0;

  const expectancyR =
    totalTrades > 0
      ? netR / totalTrades
      : 0;

  // Calculate cumulative R and maximum drawdown.
  let equity = 0;
  let peak = 0;
  let maximumDrawdownR = 0;

  let currentWins = 0;
  let currentLosses = 0;

  let maximumConsecutiveWins = 0;
  let maximumConsecutiveLosses = 0;

  for (const trade of orderedTrades) {
    equity += trade.netR;

    peak = Math.max(peak, equity);

    maximumDrawdownR = Math.max(
      maximumDrawdownR,
      peak - equity
    );

    if (trade.netR > BREAKEVEN_THRESHOLD) {
      currentWins++;
      currentLosses = 0;
    } else if (trade.netR < -BREAKEVEN_THRESHOLD) {
      currentLosses++;
      currentWins = 0;
    } else {
      currentWins = 0;
      currentLosses = 0;
    }

    maximumConsecutiveWins = Math.max(
      maximumConsecutiveWins,
      currentWins
    );

    maximumConsecutiveLosses = Math.max(
      maximumConsecutiveLosses,
      currentLosses
    );
  }

  const averageDuration =
    totalTrades > 0
      ? orderedTrades.reduce(
          (sum, trade) =>
            sum + trade.durationCandles,
          0
        ) / totalTrades
      : 0;

  const target1Hits = orderedTrades.filter(
    (trade) => trade.targetHits?.[0]
  ).length;

  const target2Hits = orderedTrades.filter(
    (trade) => trade.targetHits?.[1]
  ).length;

  const target3Hits = orderedTrades.filter(
    (trade) => trade.targetHits?.[2]
  ).length;

  function percentage(count) {
    return totalTrades > 0
      ? Number(
          ((count / totalTrades) * 100).toFixed(2)
        )
      : 0;
  }

  return {
    totalTrades,

    winningTrades: winners.length,
    losingTrades: losers.length,
    breakevenTrades: breakeven.length,

    winRate: Number(winRate.toFixed(2)),
    lossRate: percentage(losers.length),

    netR: Number(netR.toFixed(3)),
    netPips: Number(netPips.toFixed(1)),

    grossProfitR: Number(grossProfitR.toFixed(3)),
    grossLossR: Number(grossLossR.toFixed(3)),

    profitFactor:
      profitFactor == null
        ? null
        : Number(profitFactor.toFixed(3)),

    profitFactorStatus,

    expectancyR: Number(expectancyR.toFixed(3)),

    // Peak-to-trough decline in cumulative R.
    // This is not account-percentage drawdown.
    maximumDrawdownR: Number(
      maximumDrawdownR.toFixed(3)
    ),

    maximumConsecutiveWins,
    maximumConsecutiveLosses,

    averageDurationCandles: Number(
      averageDuration.toFixed(1)
    ),

    target1Hits,
    target2Hits,
    target3Hits,

    target1HitRate: percentage(target1Hits),
    target2HitRate: percentage(target2Hits),
    target3HitRate: percentage(target3Hits),
  };
}
