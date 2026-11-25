/**
 * Paper-trading position sizing for NSB.
 * P/L is calculated in the instrument's quote currency and converted to USD.
 * Forex standard lot = 100,000 base units; XAU/USD standard lot = 100 troy oz.
 */
export function calculatePosition({
  accountBalance,
  riskPercent,
  entry,
  stopLoss,
  symbol = "EUR/USD",
  pipSize,
  unitsPerLot,
  quoteToUsdRate = 1,
}) {
  const specs = {
    "EUR/USD": { pipSize: 0.0001, unitsPerLot: 100000, quote: "USD" },
    "XAU/USD": { pipSize: 0.01, unitsPerLot: 100, quote: "USD" },
    "USD/JPY": { pipSize: 0.01, unitsPerLot: 100000, quote: "JPY" },
    "AUD/JPY": { pipSize: 0.01, unitsPerLot: 100000, quote: "JPY" },
  };
  const spec = specs[symbol];
  if (!spec) throw new Error(`Unsupported instrument: ${symbol}`);

  const balance = Number(accountBalance);
  const risk = Number(riskPercent);
  const e = Number(entry);
  const s = Number(stopLoss);
  const pip = Number(pipSize ?? spec.pipSize);
  const units = Number(unitsPerLot ?? spec.unitsPerLot);
  const conversion = Number(quoteToUsdRate);

  if (![balance, risk, e, s, pip, units, conversion].every(Number.isFinite) ||
      balance <= 0 || risk <= 0 || risk > 2 || e <= 0 || s <= 0 || e === s ||
      pip <= 0 || units <= 0 || conversion <= 0) {
    throw new Error("Enter valid balance, risk (0.01%-2%), entry, stop, and conversion values.");
  }

  const riskAmount = balance * risk / 100;
  const stopDistance = Math.abs(e - s);
  const riskPerLotUsd = stopDistance * units * conversion;
  if (!(riskPerLotUsd > 0)) throw new Error("Unable to calculate instrument risk.");
  const lots = riskAmount / riskPerLotUsd;

  return {
    symbol,
    riskAmount: Number(riskAmount.toFixed(2)),
    stopPips: Number((stopDistance / pip).toFixed(1)),
    lots: Number(lots.toFixed(4)),
    units: Math.round(lots * units),
    unitsPerLot: units,
    quoteToUsdRate: conversion,
    riskPerLotUsd: Number(riskPerLotUsd.toFixed(2)),
    disclaimer: "Paper estimate using standard contract assumptions. Spread, commission, slippage, broker contract rules and conversion-rate movement can change actual results.",
  };
}

export function calculateTradePnl({
  symbol = "EUR/USD",
  signal,
  entry,
  exitPrice,
  lots,
  unitsPerLot,
  quoteToUsdRate = 1,
}) {
  const defaults = { "EUR/USD": 100000, "XAU/USD": 100, "USD/JPY": 100000, "AUD/JPY": 100000 };
  const e = Number(entry), x = Number(exitPrice), l = Number(lots);
  const units = Number(unitsPerLot ?? defaults[symbol]);
  const conversion = Number(quoteToUsdRate);
  if (![e, x, l, units, conversion].every(Number.isFinite) || e <= 0 || x <= 0 || l < 0 || units <= 0 || conversion <= 0) {
    throw new Error("Invalid trade values for P/L calculation.");
  }
  const direction = signal === "BUY" ? 1 : signal === "SELL" ? -1 : 0;
  if (!direction) throw new Error("Trade direction must be BUY or SELL.");
  const pnl = (x - e) * direction * l * units * conversion;
  return Number(pnl.toFixed(2));
}
