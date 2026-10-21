export function calculatePosition({ accountBalance, riskPercent, entry, stopLoss, unitsPerLot = 100000 }) {
  const balance = Number(accountBalance), risk = Number(riskPercent), e = Number(entry), s = Number(stopLoss);
  if (![balance,risk,e,s].every(Number.isFinite) || balance <= 0 || risk <= 0 || risk > 2 || e <= 0 || s <= 0 || e === s) {
    throw new Error("Enter a valid balance, a risk percentage from 0.01% to 2%, and valid entry/stop prices.");
  }
  const riskAmount = balance * risk / 100;
  // EUR/USD pip size is conventionally 0.0001. Pip value in USD for 1 standard lot is approximately $10.
  const stopPips = Math.abs(e-s) / 0.0001;
  const lots = riskAmount / (stopPips * 10);
  return { riskAmount: Number(riskAmount.toFixed(2)), stopPips: Number(stopPips.toFixed(1)), lots: Number(lots.toFixed(3)), units: Math.round(lots*unitsPerLot), disclaimer: "Approximation for EUR/USD in a USD-denominated account; spread, commission, slippage, leverage and broker contract rules can change actual risk." };
}
