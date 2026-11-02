
"use client";

import EconomicCalendar from "@/components/EconomicCalendar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  History,
  BarChart3,
  CheckCircle2,
  Crosshair,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  Wallet,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";

import Sidebar from "@/components/Sidebar";
import { calculatePosition } from "@/lib/riskManagement";

const money = (value) => {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return Number(value).toFixed(5);
};

const storedRead = (key, fallback) => {
  try {
    if (typeof window === "undefined") return fallback;
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};


function parseCandleTime(value) {
  if (value == null || value === "") return NaN;

  if (typeof value === "number") {
    // Support Unix seconds and Unix milliseconds.
    const milliseconds =
      value < 1e12 ? value * 1000 : value;
    return Number.isFinite(milliseconds) ? milliseconds : NaN;
  }

  const text = String(value).trim();
  const normalized = text.includes("T")
    ? text
    : text.replace(" ", "T");

  // Preserve timestamps that already contain a timezone.
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);

  const parsed = Date.parse(
    hasTimezone ? normalized : `${normalized}Z`
  );

  return Number.isFinite(parsed) ? parsed : NaN;
}

function getCandleTime(candle) {
  return parseCandleTime(
    candle?.time ??
    candle?.datetime ??
    candle?.timestamp
  );
}

function validCandlePrices(candle) {
  const high = Number(candle?.high);
  const low = Number(candle?.low);

  return (
    Number.isFinite(high) &&
    Number.isFinite(low) &&
    high >= low &&
    low > 0
  );
}

function getTargetR(record) {
  const entry = Number(record.entry);
  const stop = Number(record.stopLoss);
  const target = Number(record.takeProfits?.[0]);
  const risk = Math.abs(entry - stop);

  if (
    !Number.isFinite(entry) ||
    !Number.isFinite(stop) ||
    !Number.isFinite(target) ||
    risk <= 0
  ) {
    return null;
  }

  const reward =
    record.signal === "BUY"
      ? target - entry
      : entry - target;

  if (reward <= 0) return null;

  return reward / risk;
}


function AnalysisChecks({ checks = [] }) {
  if (!checks.length) {
    return (
      <p className="text-sm text-slate-400">
        No validation checks were returned. Run the analysis again.
      </p>
    );
  }

  const passedCount = checks.filter((check) => check.passed).length;
  const failedCount = checks.length - passedCount;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-white">
            Strategy validation checklist
          </h3>
          <p className="mt-1 text-xs text-slate-400">
Technical confirmations and verified event risk determine whether a setup qualifies.
Incomplete fundamentals may allow technical-only analysis, but unverified calendar risk blocks new paper trades.
          </p>
        </div>

        <span
          className={`rounded-lg px-3 py-2 text-xs font-semibold ${
            failedCount === 0
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-amber-500/10 text-amber-300"
          }`}
        >
          {passedCount}/{checks.length} passed
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {checks.map((check, index) => (
          <div
            key={check.id || `${check.label}-${index}`}
            className={`rounded-xl border p-3 ${
              check.passed
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-amber-500/25 bg-amber-500/5"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  check.passed
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {check.passed ? (
                  <CheckCircle2 size={17} />
                ) : (
                  <AlertTriangle size={17} />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-100">
                  {check.label || "Validation check"}
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {check.detail || "No additional details were provided."}
                </p>

                <p
                  className={`mt-2 text-[10px] font-bold tracking-wider ${
                    check.passed
                      ? "text-emerald-300"
                      : "text-amber-300"
                  }`}
                >
                  {check.passed ? "PASSED" : "FAILED — REVIEW REQUIRED"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {failedCount > 0 ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
          <p className="text-sm font-semibold text-amber-200">
            {failedCount} validation check{failedCount === 1 ? "" : "s"} did
            not pass.
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Review the failed checks. A failed mandatory technical
            confirmation or a confirmed high-impact event can prevent a
            qualifying setup.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <p className="text-sm font-semibold text-emerald-200">
            All reported checks passed.
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            This does not guarantee profitability. Check the event-risk
            status and execution conditions before opening a paper trade.
          </p>
        </div>
      )}
    </div>
  );
}



function BreakoutMonitor({ diagnostics, oneHour }) {
  const closeValue = diagnostics?.latestCandleClose;
  const buyValue = diagnostics?.potentialBuyLevel;
  const sellValue = diagnostics?.potentialSellLevel;

  const close =
    closeValue == null || closeValue === "" ? NaN : Number(closeValue);

  const buyLevel =
    buyValue == null || buyValue === "" ? NaN : Number(buyValue);

  const sellLevel =
    sellValue == null || sellValue === "" ? NaN : Number(sellValue);

  const validClose = Number.isFinite(close);
  const validBuy = Number.isFinite(buyLevel);
  const validSell = Number.isFinite(sellLevel);

  const buyDistance =
    validClose && validBuy
      ? Math.max(0, buyLevel - close) * 10000
      : null;

  const sellDistance =
    validClose && validSell
      ? Math.max(0, close - sellLevel) * 10000
      : null;

  const buyLevelReached = validClose && validBuy && close >= buyLevel;
  const sellLevelReached = validClose && validSell && close <= sellLevel;

  const breakoutStatus =
    diagnostics?.breakoutStatus || "Awaiting breakout diagnostics";

  const confirmedSignal = ["BUY", "SELL"].includes(oneHour?.signal)
    ? oneHour.signal
    : null;

  return (
    <section className="panel mt-5 p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">1H Breakout Monitor</h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Monitors the recent 19-candle range. Reaching a level does not
            automatically authorize a trade.
          </p>
        </div>

        <span className="rounded-lg border border-[#334155] bg-[#111d30] px-3 py-2 text-xs font-semibold text-slate-200">
          {breakoutStatus}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
          <p className="text-xs text-slate-400">Latest 1H close</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-white">
            {validClose ? close.toFixed(5) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Completed candle data
          </p>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs text-emerald-200">Potential BUY level</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-emerald-200">
            {validBuy ? buyLevel.toFixed(5) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {buyDistance == null
              ? "Distance unavailable"
              : buyLevelReached
                ? "Level reached / price above level"
                : `${buyDistance.toFixed(1)} pips to level`}
          </p>
        </div>

        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <p className="text-xs text-rose-200">Potential SELL level</p>
          <p className="mt-2 text-xl font-bold tabular-nums text-rose-200">
            {validSell ? sellLevel.toFixed(5) : "—"}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {sellDistance == null
              ? "Distance unavailable"
              : sellLevelReached
                ? "Level reached / price below level"
                : `${sellDistance.toFixed(1)} pips to level`}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
        <p className="text-sm font-semibold text-white">
          {confirmedSignal
            ? `${confirmedSignal} reported by the 1H analysis`
            : "No confirmed directional setup"}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          {confirmedSignal
            ? "Review the combined decision and validation checks before opening a paper trade."
            : "Wait for the required candle-close, trend, structure, and combined-analysis confirmations."}
        </p>
      </div>
    </section>
  );
}



function SignalPerformanceDashboard({
  analysisHistory = [],
  trades = [],
  signalPerformance = [],
}) {
  const totalAnalyses = analysisHistory.length;

  const buySignals = analysisHistory.filter(
    (item) => item.signal === "BUY"
  ).length;

  const sellSignals = analysisHistory.filter(
    (item) => item.signal === "SELL"
  ).length;

  const noTradeSignals = analysisHistory.filter(
    (item) => item.signal === "NO TRADE"
  ).length;

  const closedTrades = trades.filter(
    (item) => item.status === "closed"
  );

  const openTrades = trades.filter(
    (item) => item.status === "open"
  );

  const manualWins = closedTrades.filter(
    (item) => item.outcome === "win"
  ).length;

  const manualLosses = closedTrades.filter(
    (item) => item.outcome === "loss"
  ).length;

  const manualBreakeven = closedTrades.filter(
    (item) => item.outcome === "breakeven"
  ).length;

  const manuallyGraded =
    manualWins + manualLosses + manualBreakeven;

  const manualWinRate =
    manuallyGraded > 0
      ? (manualWins / manuallyGraded) * 100
      : null;

  const automaticWins = signalPerformance.filter(
    (item) => item.outcome === "win"
  );

  const automaticLosses = signalPerformance.filter(
    (item) => item.outcome === "loss"
  );

  const ambiguous = signalPerformance.filter(
    (item) => item.outcome === "ambiguous"
  );

  const expired = signalPerformance.filter(
    (item) => item.outcome === "expired"
  );

  const pending = signalPerformance.filter(
    (item) => item.outcome === "pending"
  );

  const resolved = signalPerformance.filter((item) =>
    ["win", "loss", "ambiguous"].includes(item.outcome)
  );

  const automaticWinRate =
    resolved.length > 0
      ? (automaticWins.length / resolved.length) * 100
      : null;

  const realizedRs = resolved
    .map((item) => Number(item.realizedR))
    .filter(Number.isFinite);

  const netR = realizedRs.reduce((sum, value) => sum + value, 0);

  const grossProfitR = realizedRs
    .filter((value) => value > 0)
    .reduce((sum, value) => sum + value, 0);

  const grossLossR = Math.abs(
    realizedRs
      .filter((value) => value < 0)
      .reduce((sum, value) => sum + value, 0)
  );

  const profitFactor =
    grossLossR > 0
      ? grossProfitR / grossLossR
      : grossProfitR > 0
        ? Infinity
        : null;

  let runningR = 0;
  let peakR = 0;
  let maxDrawdownR = 0;

  // Use chronological order for the equity curve.
  const chronological = [...signalPerformance]
    .filter((item) =>
      ["win", "loss", "ambiguous"].includes(item.outcome) &&
      Number.isFinite(Number(item.realizedR))
    )
    .sort(
      (a, b) =>
        parseCandleTime(a.candleTime) -
        parseCandleTime(b.candleTime)
    );

  chronological.forEach((item) => {
    runningR += Number(item.realizedR);
    peakR = Math.max(peakR, runningR);
    maxDrawdownR = Math.max(maxDrawdownR, peakR - runningR);
  });

  const directionalRate =
    totalAnalyses > 0
      ? ((buySignals + sellSignals) / totalAnalyses) * 100
      : null;

  const cards = [
    {
      label: "Analyses recorded",
      value: totalAnalyses,
      detail: "All saved analysis decisions",
      color: "text-white",
    },
    {
      label: "BUY decisions",
      value: buySignals,
      detail: "From analysis history",
      color: "text-emerald-300",
    },
    {
      label: "SELL decisions",
      value: sellSignals,
      detail: "From analysis history",
      color: "text-rose-300",
    },
    {
      label: "NO TRADE decisions",
      value: noTradeSignals,
      detail: "No qualifying setup",
      color: "text-amber-200",
    },
    {
      label: "Directional rate",
      value: directionalRate == null ? "—" : `${directionalRate.toFixed(1)}%`,
      detail: "Directional decisions ÷ all analyses",
      color: "text-blue-300",
    },
    {
      label: "Manual paper win rate",
      value: manualWinRate == null ? "—" : `${manualWinRate.toFixed(1)}%`,
      detail: "Based on manually graded trades",
      color: "text-violet-300",
    },
  ];

  return (
    <section className="panel mt-5 p-4 md:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Signal Performance Dashboard
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Automatic signal outcomes are tracked separately from manually
            graded paper trades. Historical results do not guarantee future
            performance.
          </p>
        </div>
        <span className="pill">EUR/USD · PAPER MODE</span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="kpi">
            <p className="text-xs text-slate-400">{card.label}</p>
            <p className={`mt-3 text-2xl font-bold tabular-nums ${card.color}`}>
              {card.value}
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {card.detail}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5">
        <h3 className="mb-3 font-semibold text-white">
          Automatic signal outcomes
        </h3>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            ["Tracked", signalPerformance.length, "text-white"],
            ["Pending", pending.length, "text-blue-300"],
            ["Wins", automaticWins.length, "text-emerald-300"],
            ["Losses", automaticLosses.length, "text-rose-300"],
            ["Ambiguous", ambiguous.length, "text-amber-200"],
            ["Expired", expired.length, "text-slate-300"],
          ].map(([label, value, color]) => (
            <div key={label} className="kpi">
              <p className="text-xs text-slate-400">{label}</p>
              <p className={`mt-2 text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="kpi">
            <p className="text-xs text-slate-400">Automatic win rate</p>
            <p className="mt-2 text-xl font-bold text-emerald-300">
              {automaticWinRate == null ? "—" : `${automaticWinRate.toFixed(1)}%`}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Wins ÷ resolved signals
            </p>
          </div>

          <div className="kpi">
            <p className="text-xs text-slate-400">Net realized R</p>
            <p className={`mt-2 text-xl font-bold ${netR >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {resolved.length ? `${netR >= 0 ? "+" : ""}${netR.toFixed(2)}R` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Resolved outcomes only
            </p>
          </div>

          <div className="kpi">
            <p className="text-xs text-slate-400">Profit factor</p>
            <p className="mt-2 text-xl font-bold text-blue-300">
              {profitFactor == null
                ? "—"
                : profitFactor === Infinity
                  ? "∞"
                  : profitFactor.toFixed(2)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Gross gains ÷ gross losses in R
            </p>
          </div>

          <div className="kpi">
            <p className="text-xs text-slate-400">Maximum drawdown</p>
            <p className="mt-2 text-xl font-bold text-amber-200">
              {resolved.length ? `${maxDrawdownR.toFixed(2)}R` : "—"}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Peak-to-trough R drawdown
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          Automatic results assume entry at the recorded signal entry and
          evaluation at TP1 or stop-loss. They do not include spread, slippage,
          commissions, or partial exits. Ambiguous same-candle results are
          conservatively recorded as losses. Expired signals are excluded from
          win rate and net R.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
          <h3 className="font-semibold text-white">Paper-trading status</h3>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-400">Open positions</span>
            <span className="font-semibold text-blue-300">{openTrades.length}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-slate-400">Closed positions</span>
            <span className="font-semibold text-slate-200">{closedTrades.length}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-slate-400">Manually graded outcomes</span>
            <span className="font-semibold text-slate-200">{manuallyGraded}</span>
          </div>
        </div>

        <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
          <h3 className="font-semibold text-white">How results are measured</h3>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Each eligible signal is recorded once per candle and direction.
            TP1 reward is measured against the original entry-to-stop distance.
            A signal expires after 72 subsequent candles if neither level is
            reached. These are rule-based estimates, not broker execution records.
          </p>
        </div>
      </div>

      {signalPerformance.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-3 font-semibold text-white">
            Recent automatic signals
          </h3>
          <div className="space-y-2">
            {signalPerformance.slice(0, 10).map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#26354c] bg-[#0b1525] p-3"
              >
                <div>
                  <span className={`font-semibold ${item.signal === "BUY" ? "text-emerald-300" : "text-rose-300"}`}>
                    {item.signal}
                  </span>
                  <span className="ml-3 text-xs text-slate-400">
                    {item.candleTime || "Time unavailable"}
                  </span>
                  <p className="mt-1 text-xs text-slate-500">
                    Entry {Number(item.entry).toFixed(5)} · SL {Number(item.stopLoss).toFixed(5)} · TP1 {Number(item.takeProfits?.[0]).toFixed(5)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${
                    item.outcome === "win" ? "text-emerald-300" :
                    item.outcome === "loss" || item.outcome === "ambiguous" ? "text-rose-300" :
                    "text-amber-200"
                  }`}>
                    {(item.outcome || "pending").toUpperCase()}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {Number.isFinite(Number(item.realizedR))
                      ? `${Number(item.realizedR) >= 0 ? "+" : ""}${Number(item.realizedR).toFixed(2)}R`
                      : item.outcome === "pending"
                        ? `${item.evaluatedCandles || 0}/72 candles checked`
                        : "No realized R"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}



export default function Home() {
  const [interval, setInterval] = useState("1h");

  const [market, setMarket] = useState(null);
  const [marketError, setMarketError] = useState("");
  const [loadingMarket, setLoadingMarket] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysisError, setAnalysisError] = useState("");

  const [balance, setBalance] = useState("10000");
  const [riskPercent, setRiskPercent] = useState("1");

  const [trades, setTrades] = useState([]);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [signalPerformance, setSignalPerformance] = useState([]);
  const [tradeOutcome, setTradeOutcome] = useState("win");
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [calendarExpanded, setCalendarExpanded] = useState(false);

  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const savedTrades = storedRead("nsb-paper-trades", []);
    const savedBalance = storedRead("nsb-account-balance", "10000");

    setTrades(Array.isArray(savedTrades) ? savedTrades : []);
    setBalance(String(savedBalance));
    const savedAnalysis = storedRead("nsb-analysis-history", []);
setAnalysisHistory(
  Array.isArray(savedAnalysis) ? savedAnalysis : []
);
const savedPerformance = storedRead(
  "nsb-signal-performance",
  []
);

setSignalPerformance(
  Array.isArray(savedPerformance) ? savedPerformance : []
);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("nsb-account-balance", JSON.stringify(balance));
    } catch {
      // The current session still works if browser storage is unavailable.
    }
  }, [balance]);

  const evaluateSignalOutcomes = useCallback(async () => {
  try {
    const response = await fetch("/api/market?interval=1h", {
      cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok || !Array.isArray(data.candles)) {
      throw new Error(data.error || "Could not retrieve 1H candles.");
    }

    const candles = data.candles
      .filter((candle) =>
        Number.isFinite(getCandleTime(candle)) &&
        validCandlePrices(candle)
      )
      .sort((a, b) => getCandleTime(a) - getCandleTime(b));

    if (!candles.length) {
      throw new Error("The 1H response contained no valid candles.");
    }

    setSignalPerformance((current) => {
      let changed = false;

      const next = current.map((record) => {
        if (record.outcome !== "pending") return record;

        const signalTimestamp = parseCandleTime(record.candleTime);
        const entry = Number(record.entry);
        const stopLoss = Number(record.stopLoss);
        const target = Number(record.takeProfits?.[0]);
        const risk = Math.abs(entry - stopLoss);
        const targetR = getTargetR(record);

        if (
          !Number.isFinite(signalTimestamp) ||
          !Number.isFinite(entry) ||
          !Number.isFinite(stopLoss) ||
          !Number.isFinite(target) ||
          risk <= 0 ||
          targetR == null
        ) {
          changed = true;
          return {
            ...record,
            outcome: "invalid",
            resolution: "invalid-signal-data",
            resolvedAt: new Date().toISOString(),
          };
        }

        // Never evaluate the candle that generated the signal.
        const futureCandles = candles.filter(
          (candle) => getCandleTime(candle) > signalTimestamp
        );

        const candlesToCheck = futureCandles.slice(0, 72);

        if (!candlesToCheck.length) return record;

        const isBuy = record.signal === "BUY";

        for (let i = 0; i < candlesToCheck.length; i++) {
          const candle = candlesToCheck[i];
          const high = Number(candle.high);
          const low = Number(candle.low);

          const stopHit = isBuy
            ? low <= stopLoss
            : high >= stopLoss;

          const targetHit = isBuy
            ? high >= target
            : low <= target;

          const base = {
            ...record,
            evaluatedCandles: i + 1,
            resolvedAt: new Date().toISOString(),
          };

          // OHLC candles do not reveal the order of intrabar touches.
          if (stopHit && targetHit) {
            changed = true;
            return {
              ...base,
              outcome: "ambiguous",
              realizedR: -1,
              resolution: "stop-and-target-same-candle",
            };
          }

          if (stopHit) {
            changed = true;
            return {
              ...base,
              outcome: "loss",
              realizedR: -1,
              resolution: "stop-loss",
            };
          }

          if (targetHit) {
            changed = true;
            return {
              ...base,
              outcome: "win",
              realizedR: targetR,
              resolution: "take-profit-1",
            };
          }
        }

        const evaluatedCount = candlesToCheck.length;

        if (evaluatedCount >= 72) {
          changed = true;
          return {
            ...record,
            outcome: "expired",
            realizedR: null,
            resolution: "72-candle-limit",
            evaluatedCandles: 72,
            resolvedAt: new Date().toISOString(),
          };
        }

        if (record.evaluatedCandles !== evaluatedCount) {
          changed = true;
          return {
            ...record,
            evaluatedCandles: evaluatedCount,
          };
        }

        return record;
      });

      if (changed) {
        try {
          window.localStorage.setItem(
            "nsb-signal-performance",
            JSON.stringify(next)
          );
        } catch (error) {
          console.error("Could not update signal performance:", error);
        }
      }

      return next;
    });
  } catch (error) {
    console.error("Signal outcome evaluation failed:", error);
  }
}, []);

  const fetchMarket = useCallback(async (tf = interval) => {
    setLoadingMarket(true);
    setMarketError("");

    try {
      const response = await fetch(
        `/api/market?interval=${encodeURIComponent(tf)}`,
        { cache: "no-store" }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(
          json.error || `Market data failed (${response.status})`
        );
      }

      setMarket(json);
      if (tf === "1h") {
  void evaluateSignalOutcomes();
}
      setLastUpdated(
        json.fetchedAt ? new Date(json.fetchedAt) : new Date()
      );
    } catch (error) {
      setMarketError(error.message || "Market data unavailable");
    } finally {
      setLoadingMarket(false);
    }
  }, [interval, evaluateSignalOutcomes]);

  useEffect(() => {
    fetchMarket(interval);
  }, [interval, fetchMarket]);

  // Re-grade pending signals periodically even when the user does not click Analyze.
  useEffect(() => {
    void evaluateSignalOutcomes();
    const intervalId = window.setInterval(() => {
      void evaluateSignalOutcomes();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [evaluateSignalOutcomes]);

  
const recordAnalysis = (result) => {
  const combined = result.combined || {};
  const oneHour = result.oneHour || {};
  const fourHour = result.fourHour || {};
  const fundamentals = result.fundamentals || {};
  const reportedTrade = result.trade || {};

  const finalSignal = ["BUY", "SELL"].includes(combined.signal)
    ? combined.signal
    : "NO TRADE";

  const validTrade =
    finalSignal !== "NO TRADE" &&
    reportedTrade.signal === finalSignal &&
    Number.isFinite(Number(reportedTrade.entry)) &&
    Number.isFinite(Number(reportedTrade.stopLoss)) &&
    Array.isArray(reportedTrade.takeProfits) &&
    reportedTrade.takeProfits.length === 3 &&
    reportedTrade.takeProfits.every(
      (target) =>
        target != null &&
        Number.isFinite(Number(target))
    );

  const record = {
    id: crypto.randomUUID(),
    analyzedAt: new Date().toISOString(),

    signal: validTrade ? finalSignal : "NO TRADE",

    oneHourTrend: oneHour.trend || "unknown",
    oneHourStructure: oneHour.structureTrend || "unknown",
    fourHourTrend: fourHour.trend || "unknown",
    fourHourStructure: fourHour.structureTrend || "unknown",

    entry: validTrade ? Number(reportedTrade.entry) : null,
    stopLoss: validTrade ? Number(reportedTrade.stopLoss) : null,
    takeProfits: validTrade
      ? reportedTrade.takeProfits.map(Number)
      : [],

    reason:
      combined.reason ||
      oneHour.reason ||
      "No analysis reason was returned.",

    fundamentalBias: fundamentals.bias || "unknown",
    eventRisk: fundamentals.eventRisk || combined.eventRisk || "unknown",
    analysisMode: combined.analysisMode || "TECHNICAL ONLY",

    failedChecks: Array.isArray(combined.failedChecks)
      ? combined.failedChecks.map(
          (check) => check.label || check.id || "Validation check"
        )
      : [],
  };

  const nextHistory = [record, ...analysisHistory].slice(0, 200);

  setAnalysisHistory(nextHistory);

  try {
    window.localStorage.setItem(
      "nsb-analysis-history",
      JSON.stringify(nextHistory)
    );
  } catch (error) {
    console.error("Could not save NSB analysis history:", error);
  }
};



const saveEligibleSignal = (result) => {
  const combined = result?.combined || {};
  const reportedTrade = result?.trade || {};
  const oneHour = result?.oneHour || {};

  const signal = combined.signal;
  const rawCandleTime =
    oneHour.lastCandleTime ??
    oneHour.lastCandle?.time ??
    oneHour.lastCandle?.datetime;

  const candleTimestamp = parseCandleTime(rawCandleTime);

  if (!["BUY", "SELL"].includes(signal)) return;
  if (!Number.isFinite(candleTimestamp)) {
    console.warn(
      "Signal not saved: API did not provide a valid 1H candle timestamp."
    );
    return;
  }

  const entry = Number(reportedTrade.entry);
  const stopLoss = Number(reportedTrade.stopLoss);
  const targets = reportedTrade.takeProfits;

  const validLevels =
    reportedTrade.signal === signal &&
    Number.isFinite(entry) &&
    Number.isFinite(stopLoss) &&
    entry > 0 &&
    stopLoss > 0 &&
    entry !== stopLoss &&
    Array.isArray(targets) &&
    targets.length === 3 &&
    targets.every(
      (target) => target != null && Number.isFinite(Number(target))
    ) &&
    (signal === "BUY"
      ? Number(targets[0]) > entry && stopLoss < entry
      : Number(targets[0]) < entry && stopLoss > entry);

  if (!validLevels) {
    console.warn("Signal not saved: trade levels are invalid.");
    return;
  }

  const candleTime = new Date(candleTimestamp).toISOString();
  const id = `${candleTime}-${signal}`;

  setSignalPerformance((current) => {
    if (current.some((item) => item.id === id)) return current;

    const record = {
      id,
      candleTime,
      recordedAt: new Date().toISOString(),
      signal,
      entry,
      stopLoss,
      takeProfits: targets.map(Number),
      outcome: "pending",
      realizedR: null,
      resolution: null,
      evaluatedCandles: 0,
    };

    const next = [record, ...current].slice(0, 500);

    try {
      window.localStorage.setItem(
        "nsb-signal-performance",
        JSON.stringify(next)
      );
    } catch (error) {
      console.error("Could not save signal performance:", error);
    }

    return next;
  });
};




  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        cache: "no-store",
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Analysis failed");
      }

     setAnalysis(json);
recordAnalysis(json);
saveEligibleSignal(json);

// Refresh outcomes using subsequent completed 1H candles.
await evaluateSignalOutcomes();
    } catch (error) {
      setAnalysisError(error.message || "Automatic analysis failed");
      setAnalysis(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const combined = analysis?.combined;
  const oneHour = analysis?.oneHour;
  const fourHour = analysis?.fourHour;
  const fundamentals = analysis?.fundamentals;
  const oneHourDiagnostics = analysis?.dataDiagnostics?.oneHour;

  const signal = combined?.signal || "Awaiting analysis";
  const validationChecks = combined?.checks || [];

  // Use the combined decision as the final authority for the paper trade.
  const trade = useMemo(() => {
  if (!analysis) return null;

  const finalSignal = analysis.combined?.signal;

  // Never expose trade levels when the combined decision
  // does not authorize a directional setup.
  if (!["BUY", "SELL"].includes(finalSignal)) {
    return {
      signal: "NO TRADE",
      entry: null,
      stopLoss: null,
      takeProfits: [],
    };
  }

  // For a valid directional signal, use only the levels
  // explicitly returned by the API.
  const reportedTrade = analysis.trade;

  if (
    !reportedTrade ||
    reportedTrade.signal !== finalSignal ||
    !Number.isFinite(Number(reportedTrade.entry)) ||
    !Number.isFinite(Number(reportedTrade.stopLoss)) ||
    !Array.isArray(reportedTrade.takeProfits) ||
    reportedTrade.takeProfits.length !== 3 ||
    !reportedTrade.takeProfits.every((target) =>
      Number.isFinite(Number(target))
    )
  ) {
    return {
      signal: "NO TRADE",
      entry: null,
      stopLoss: null,
      takeProfits: [],
    };
  }

  return {
    signal: finalSignal,
    entry: Number(reportedTrade.entry),
    stopLoss: Number(reportedTrade.stopLoss),
    takeProfits: reportedTrade.takeProfits.map(Number),
  };
}, [analysis]);

  const position = useMemo(() => {
    if (
      !trade ||
      !["BUY", "SELL"].includes(trade.signal) ||
      trade.entry == null ||
      trade.stopLoss == null
    ) {
      return null;
    }

    try {
      return calculatePosition({
        accountBalance: balance,
        riskPercent,
        entry: trade.entry,
        stopLoss: trade.stopLoss,
      });
    } catch {
      return null;
    }
  }, [trade, balance, riskPercent]);

  const clearAnalysisHistory = () => {
    const confirmed = window.confirm(
      "Clear all saved analysis history from this browser? This cannot be undone."
    );

    if (!confirmed) return;

    setAnalysisHistory([]);

    try {
      window.localStorage.removeItem("nsb-analysis-history");
    } catch (error) {
      console.error("Could not clear NSB analysis history:", error);
    }
  };

  const saveTrades = (nextTrades) => {
    setTrades(nextTrades);

    try {
      window.localStorage.setItem(
        "nsb-paper-trades",
        JSON.stringify(nextTrades)
      );
    } catch {
      // Keep the updated trades in the current session.
    }
  };

  const openPaperTrade = () => {
    const currentEventRisk =
      fundamentals?.eventRisk || combined?.eventRisk || "unknown";
    const mandatoryChecksPassed =
      Array.isArray(combined?.checks) &&
      combined.checks.every((check) => check.passed === true);

    // Fail closed: never open a new paper position with unverified calendar risk.
    if (
      !trade ||
      !["BUY", "SELL"].includes(trade.signal) ||
      !position ||
      currentEventRisk === "unknown" ||
      currentEventRisk === "high" ||
      !mandatoryChecksPassed
    ) {
      return;
    }

    const paperTrade = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      signal: trade.signal,
      entry: trade.entry,
      stopLoss: trade.stopLoss,
      takeProfits: trade.takeProfits,
      riskAmount: position.riskAmount,
      lots: position.lots,
      status: "open",
      outcome: null,
    };

    saveTrades([paperTrade, ...trades]);
  };

  const closePaperTrade = (id) => {
    saveTrades(
      trades.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "closed",
              outcome: tradeOutcome,
              closedAt: new Date().toISOString(),
            }
          : item
      )
    );
  };

  const closedTrades = trades.filter((item) => item.status === "closed");
  const openTrades = trades.filter((item) => item.status === "open");

  const winRate = closedTrades.length
    ? Math.round(
        (closedTrades.filter((item) => item.outcome === "win").length /
          closedTrades.length) *
          100
      )
    : null;

  const price = market?.latest?.close;
  const eventRisk = fundamentals?.eventRisk || combined?.eventRisk || "unknown";
  const analysisMode =
    combined?.analysisMode ||
    (combined?.fundamentalsComplete
      ? "TECHNICAL + FUNDAMENTAL"
      : "TECHNICAL ONLY");

  return (
    <div className="min-h-screen">
      <Sidebar />

      <main className="mx-auto max-w-[1600px] px-4 py-5 md:ml-[230px] md:px-7 md:py-7">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">
              Trading intelligence workspace
            </div>

            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Market analysis
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              EUR/USD · 1H technical setup + 4H context · paper trading only
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="pill">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
              PAPER MODE
            </span>

            <button
              className="btn btn-secondary"
              onClick={() => fetchMarket(interval)}
              disabled={loadingMarket}
            >
              <RefreshCw
                size={15}
                className={loadingMarket ? "animate-spin" : ""}
              />
              Refresh market
            </button>
          </div>
        </header>

        <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="kpi">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">EUR/USD last close</span>
              <Activity size={16} className="text-blue-300" />
            </div>

            <div className="mt-3 text-2xl font-bold tabular-nums">
              {money(price)}
            </div>

            <div className="mt-1 text-xs text-slate-500">
              {market ? `Source: ${market.source || "Market provider"}` : "No market data loaded"}
            </div>
          </div>

          <div className="kpi">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Combined signal</span>
              <Crosshair size={16} className="text-violet-300" />
            </div>

            <div
              className={`mt-3 text-xl font-bold ${
                signal === "BUY"
                  ? "text-emerald-300"
                  : signal === "SELL"
                    ? "text-rose-300"
                    : "text-amber-200"
              }`}
            >
              {signal}
            </div>

            <div className="mt-1 text-xs text-slate-500">
              Strict technical confirmations enabled
            </div>
          </div>

          <div className="kpi">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Paper trades</span>
              <Wallet size={16} className="text-blue-300" />
            </div>

            <div className="mt-3 text-2xl font-bold">{trades.length}</div>

            <div className="mt-1 text-xs text-slate-500">
              {openTrades.length} open · {closedTrades.length} closed
            </div>
          </div>

          <div className="kpi">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Paper win rate</span>
              <BarChart3 size={16} className="text-emerald-300" />
            </div>

            <div className="mt-3 text-2xl font-bold">
              {winRate == null ? "—" : `${winRate}%`}
            </div>

            <div className="mt-1 text-xs text-slate-500">
              {closedTrades.length} manually graded trades
            </div>
          </div>
        </section>

        <section className="panel p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Analysis controls</h2>
              <p className="mt-1 text-xs text-slate-400">
                Automatic market and economic-calendar assessment
              </p>
            </div>

            <Activity size={19} className="text-blue-300" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-blue-300" />
                <h3 className="font-semibold text-white">
                  Automatic analysis
                </h3>
              </div>

              <p className="mt-2 text-xs leading-5 text-slate-400">
                NSB retrieves market candles and evaluates the 1H technical
                setup, 4H trend context, and available fundamental and
                economic-calendar information.
              </p>

              <div className="mt-4 space-y-2 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-blue-300" />
                  EMA, breakout, and ATR-based levels
                </div>

                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-blue-300" />
                  1H setup with 4H trend context
                </div>

                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-blue-300" />
                  Automatic economic-calendar assessment
                </div>

                <div className="flex items-center gap-2">
                  <ShieldAlert size={15} className="text-amber-300" />
                  Incomplete fundamentals are identified, not assumed
                </div>
              </div>

              <button
                className="btn btn-primary mt-5 w-full py-3"
                onClick={runAnalysis}
                disabled={analyzing}
              >
                {analyzing ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <Play size={16} />
                )}

                {analyzing ? "Analyzing market and fundamentals..." : "Analyze EUR/USD"}
              </button>

              {analysisError && (
                <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                  <b>Analysis failed</b>
                  <p className="mt-1">{analysisError}</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
                <h3 className="font-semibold text-white">Market data status</h3>

                <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                  <span className="text-slate-400">Market timeframe</span>
                  <select
                    className="rounded-lg border border-[#334155] bg-[#111d30] px-3 py-2 text-white"
                    value={interval}
                    onChange={(event) => setInterval(event.target.value)}
                  >
                    <option value="1h">1 hour</option>
                    <option value="4h">4 hours</option>
                  </select>
                </div>

                <p className="mt-3 text-xs text-slate-400">
                  {lastUpdated
                    ? `Last market refresh: ${lastUpdated.toLocaleTimeString()}`
                    : "Market data has not been refreshed yet."}
                </p>

                {marketError && (
                  <p className="mt-2 text-xs text-rose-300">{marketError}</p>
                )}
              </div>

              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
                <div className="flex gap-2 text-xs font-semibold text-amber-100">
                  <ShieldAlert size={16} />
                  Validation and risk controls
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-400">
                  A failed mandatory technical confirmation can block a
                  setup. Incomplete fundamentals may permit technical-only
                  analysis, while a confirmed high-impact event blocks new
                  setups under the current strategy rules. Unknown event risk
                  is unverified, not safe.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="panel mt-5 p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Analysis report</h2>
              <p className="mt-1 text-xs text-slate-400">
                Rule-based analysis · not financial advice
              </p>
            </div>

            {analysis?.generatedAt && (
              <span className="pill">
                Updated {new Date(analysis.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {!analysis ? (
            <div className="grid-lines rounded-xl border border-dashed border-[#2b3b55] px-5 py-10 text-center">
              <Crosshair className="mx-auto mb-3 text-slate-500" size={28} />
              <p className="font-semibold">No analysis report yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Click Analyze EUR/USD to retrieve the latest analysis.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="kpi">
                  <div className="text-xs text-slate-400">1H trend / setup</div>

                  <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
                    {oneHour?.trend === "bullish" ? (
                      <TrendingUp className="text-emerald-300" />
                    ) : oneHour?.trend === "bearish" ? (
                      <TrendingDown className="text-rose-300" />
                    ) : (
                      <Activity className="text-amber-200" />
                    )}
                    {(oneHour?.trend || "unknown").toUpperCase()}
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {oneHour?.structure || oneHour?.reason || "No structure details returned."}
                  </p>
                </div>

                <div className="kpi">
                  <div className="text-xs text-slate-400">4H trend / context</div>

                  <div className="mt-2 text-lg font-semibold">
                    {(fourHour?.trend || "unknown").toUpperCase()}
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    EMA20 {money(fourHour?.ema20)} · EMA50 {money(fourHour?.ema50)}
                  </p>
                </div>

                <div className="kpi">
                  <div className="text-xs text-slate-400">Automatic fundamentals</div>

                  <div className="mt-2 text-lg font-semibold capitalize">
                    {fundamentals?.bias || combined?.bias || "unknown"}
                  </div>

                  <p className="mt-1 text-xs text-slate-400">
                    Event risk: {eventRisk}
                  </p>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    Source: {fundamentals?.source || "Unavailable"}
                  </p>

                  <p className="mt-2 text-xs text-slate-400">
                    Mode: {analysisMode}
                  </p>

                  {fundamentals?.note && (
                    <p className="mt-2 text-xs leading-5 text-slate-300">
                      {fundamentals.note}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
                <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
                  <AnalysisChecks checks={validationChecks} />
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
                    <h3 className="font-semibold text-white">Combined decision</h3>

                    <div
                      className={`mt-3 text-2xl font-bold ${
                        signal === "BUY"
                          ? "text-emerald-300"
                          : signal === "SELL"
                            ? "text-rose-300"
                            : "text-amber-200"
                      }`}
                    >
                      {signal}
                    </div>

                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {combined?.reason || "No combined decision details were returned."}
                    </p>

                    <div className="mt-4 border-t border-[#26354c] pt-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-400">Analysis mode</span>
                        <span className="font-medium text-slate-200">
                          {analysisMode}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                        <span className="text-slate-400">Event risk</span>
                        <span
                          className={`font-medium ${
                            eventRisk === "high"
                              ? "text-rose-300"
                              : eventRisk === "unknown"
                                ? "text-amber-200"
                                : "text-slate-200"
                          }`}
                        >
                          {eventRisk}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
                    <h3 className="font-semibold text-white">Trade plan</h3>

                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-slate-400">Entry</p>
                        <p className="mt-1 font-semibold">{money(trade?.entry)}</p>
                      </div>

                      <div>
                        <p className="text-xs text-slate-400">Stop loss</p>
                        <p className="mt-1 font-semibold">{money(trade?.stopLoss)}</p>
                      </div>

                      {(trade?.takeProfits || []).map((target, index) => (
                        <div key={`tp-${index}`}>
                          <p className="text-xs text-slate-400">Take profit {index + 1}</p>
                          <p className="mt-1 font-semibold">{money(target)}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 border-t border-[#26354c] pt-4">
                      <h4 className="text-sm font-semibold">Paper position sizing</h4>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <label className="text-xs text-slate-400">
                          Account balance
                          <input
                            className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111d30] px-3 py-2 text-sm text-white"
                            type="number"
                            min="0"
                            value={balance}
                            onChange={(event) => setBalance(event.target.value)}
                          />
                        </label>

                        <label className="text-xs text-slate-400">
                          Risk percentage
                          <input
                            className="mt-1 w-full rounded-lg border border-[#334155] bg-[#111d30] px-3 py-2 text-sm text-white"
                            type="number"
                            min="0.1"
                            max="10"
                            step="0.1"
                            value={riskPercent}
                            onChange={(event) => setRiskPercent(event.target.value)}
                          />
                        </label>
                      </div>

                      {position ? (
                        <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-slate-800/60 p-3">
                          <div>
                            <p className="text-xs text-slate-400">Risk amount</p>
                            <p className="mt-1 font-semibold">
                              {Number(position.riskAmount).toFixed(2)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Estimated lots</p>
                            <p className="mt-1 font-semibold">
                              {Number(position.lots).toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs leading-5 text-slate-400">
                          Position sizing appears when a BUY or SELL decision
                          has valid entry and stop-loss levels.
                        </p>
                      )}

                      <button
                        className="btn btn-primary mt-4 w-full"
                        onClick={openPaperTrade}
                        disabled={
                          !trade ||
                          !["BUY", "SELL"].includes(trade.signal) ||
                          !position
                        }
                      >
                        Open paper trade
                      </button>

                      {signal === "NO TRADE" && (
                        <p className="mt-2 text-xs text-amber-200">
                          No paper position can be opened while the combined
                          decision is NO TRADE.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <BreakoutMonitor
  diagnostics={oneHourDiagnostics}
  oneHour={oneHour}
/>

<SignalPerformanceDashboard
  analysisHistory={analysisHistory}
  trades={trades}
  signalPerformance={signalPerformance}
/>


        <section className="panel mt-5 p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
              onClick={() => setHistoryExpanded((expanded) => !expanded)}
              aria-expanded={historyExpanded}
              aria-controls="analysis-history-content"
            >
              <History className="mt-1 shrink-0 text-blue-300" size={20} />
              <span>
                <span className="flex items-center gap-2 text-lg font-semibold">
                  Analysis history
                  <ChevronDown className={`transition-transform ${historyExpanded ? "rotate-180" : ""}`} size={18} />
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  Saved analysis decisions from this browser, including NO TRADE results. Most recent analyses appear first.
                </span>
              </span>
            </button>

            <div className="flex items-center gap-3">
              <span className="pill">
                {analysisHistory.length} / 200 records
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearAnalysisHistory}
                disabled={analysisHistory.length === 0}
              >
                Clear history
              </button>
            </div>
          </div>

          {historyExpanded && <div id="analysis-history-content" className="space-y-3">
          {analysisHistory.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2b3b55] px-5 py-8 text-center">
              <Activity className="mx-auto mb-3 text-slate-500" size={26} />
              <p className="font-semibold">No analysis history yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Click Analyze EUR/USD to save the next decision here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {analysisHistory.map((item) => (
                <article
                  key={item.id}
                  className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-lg px-3 py-1 text-xs font-bold ${
                            item.signal === "BUY"
                              ? "bg-emerald-500/10 text-emerald-300"
                              : item.signal === "SELL"
                                ? "bg-rose-500/10 text-rose-300"
                                : "bg-amber-500/10 text-amber-200"
                          }`}
                        >
                          {item.signal || "NO TRADE"}
                        </span>
                        <span className="text-xs text-slate-500">
                          {item.analyzedAt
                            ? new Date(item.analyzedAt).toLocaleString()
                            : "Time unavailable"}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                        <div>
                          <p className="text-xs text-slate-500">1H trend</p>
                          <p className="mt-1 font-medium capitalize text-slate-200">
                            {item.oneHourTrend || "unknown"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">1H structure</p>
                          <p className="mt-1 font-medium capitalize text-slate-200">
                            {item.oneHourStructure || "unknown"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">4H trend</p>
                          <p className="mt-1 font-medium capitalize text-slate-200">
                            {item.fourHourTrend || "unknown"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500">4H structure</p>
                          <p className="mt-1 font-medium capitalize text-slate-200">
                            {item.fourHourStructure || "unknown"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
                        <span>
                          Fundamental bias:{" "}
                          <span className="capitalize text-slate-200">
                            {item.fundamentalBias || "unknown"}
                          </span>
                        </span>
                        <span>
                          Event risk:{" "}
                          <span
                            className={`capitalize ${
                              item.eventRisk === "high"
                                ? "text-rose-300"
                                : item.eventRisk === "unknown"
                                  ? "text-amber-200"
                                  : "text-slate-200"
                            }`}
                          >
                            {item.eventRisk || "unknown"}
                          </span>
                        </span>
                        <span>
                          Mode:{" "}
                          <span className="text-slate-200">
                            {item.analysisMode || "TECHNICAL ONLY"}
                          </span>
                        </span>
                      </div>

                      {item.signal === "BUY" || item.signal === "SELL" ? (
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
                          <div>
                            <p className="text-xs text-slate-500">Entry</p>
                            <p className="mt-1 text-slate-200">{money(item.entry)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Stop loss</p>
                            <p className="mt-1 text-slate-200">{money(item.stopLoss)}</p>
                          </div>
                          {(item.takeProfits || []).map((target, index) => (
                            <div key={`${item.id}-tp-${index}`}>
                              <p className="text-xs text-slate-500">Take profit {index + 1}</p>
                              <p className="mt-1 text-slate-200">{money(target)}</p>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-3 border-t border-[#26354c] pt-3">
                        <p className="text-xs font-semibold text-slate-300">
                          Decision reason
                        </p>
                        <p className="mt-1 text-sm leading-5 text-slate-400">
                          {item.reason || "No reason was recorded."}
                        </p>
                      </div>

                      {Array.isArray(item.failedChecks) && item.failedChecks.length > 0 ? (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-amber-200">
                            Checks to review
                          </p>
                          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-slate-400">
                            {item.failedChecks.map((check, index) => (
                              <li key={`${item.id}-check-${index}`}>{check}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          </div>}
        </section>

        <section className="panel mt-5 p-4 md:p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Paper trading journal</h2>
            <p className="mt-1 text-xs text-slate-400">
              Simulated positions saved in this browser only.
            </p>
          </div>

          {trades.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#2b3b55] px-5 py-8 text-center">
              <Wallet className="mx-auto mb-3 text-slate-500" size={26} />
              <p className="font-semibold">No paper trades yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Run an analysis and open a simulated position when a qualifying
                setup is available.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {trades.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold ${
                            item.signal === "BUY"
                              ? "text-emerald-300"
                              : "text-rose-300"
                          }`}
                        >
                          {item.signal}
                        </span>

                        <span className="text-xs text-slate-500">
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-slate-400">Entry</p>
                          <p className="mt-1">{money(item.entry)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Stop loss</p>
                          <p className="mt-1">{money(item.stopLoss)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Risk amount</p>
                          <p className="mt-1">
                            {Number(item.riskAmount || 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Lots</p>
                          <p className="mt-1">
                            {Number(item.lots || 0).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-2 sm:items-end">
                      <span
                        className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                          item.status === "open"
                            ? "bg-blue-500/10 text-blue-300"
                            : "bg-slate-500/10 text-slate-300"
                        }`}
                      >
                        {item.status.toUpperCase()}
                      </span>

                      {item.status === "closed" && (
                        <span className="text-xs text-slate-400">
                          Outcome: {item.outcome || "ungraded"}
                        </span>
                      )}
                    </div>
                  </div>

                  {item.status === "open" && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#26354c] pt-3">
                      <label className="text-xs text-slate-400">
                        Grade outcome
                        <select
                          className="ml-2 rounded-lg border border-[#334155] bg-[#111d30] px-3 py-2 text-white"
                          value={tradeOutcome}
                          onChange={(event) => setTradeOutcome(event.target.value)}
                        >
                          <option value="win">Win</option>
                          <option value="loss">Loss</option>
                          <option value="breakeven">Breakeven</option>
                        </select>
                      </label>

                      <button
                        className="btn btn-secondary"
                        onClick={() => closePaperTrade(item.id)}
                      >
                        Close and record
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel mt-5 p-4 md:p-5">
          <button
            type="button"
            className="flex w-full items-center gap-3 text-left"
            onClick={() => setCalendarExpanded((expanded) => !expanded)}
            aria-expanded={calendarExpanded}
            aria-controls="economic-calendar-content"
          >
            <CalendarDays className="shrink-0 text-blue-300" size={20} />
            <span className="flex-1">
              <span className="flex items-center gap-2 text-lg font-semibold">
                Economic Calendar
                <ChevronDown className={`transition-transform ${calendarExpanded ? "rotate-180" : ""}`} size={18} />
              </span>
              <span className="mt-1 block text-xs text-slate-400">US and EU economic events · Times shown in Lagos time</span>
            </span>
          </button>
          {calendarExpanded && <div id="economic-calendar-content" className="mt-4"><EconomicCalendar /></div>}
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-slate-500">
          NSB SMART BROKER is an educational analysis and paper-trading tool.
          Signals and position estimates are not guaranteed outcomes or
          financial advice.
        </p>
      </main>
    </div>
  );
}
