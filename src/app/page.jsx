
"use client";

import EconomicCalendar from "@/components/EconomicCalendar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
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
            Technical confirmations determine whether a setup qualifies.
            Incomplete fundamentals may allow technical-only analysis.
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
  const [tradeOutcome, setTradeOutcome] = useState("win");

  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const savedTrades = storedRead("nsb-paper-trades", []);
    const savedBalance = storedRead("nsb-account-balance", "10000");

    setTrades(Array.isArray(savedTrades) ? savedTrades : []);
    setBalance(String(savedBalance));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("nsb-account-balance", JSON.stringify(balance));
    } catch {
      // The current session still works if browser storage is unavailable.
    }
  }, [balance]);

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
      setLastUpdated(
        json.fetchedAt ? new Date(json.fetchedAt) : new Date()
      );
    } catch (error) {
      setMarketError(error.message || "Market data unavailable");
    } finally {
      setLoadingMarket(false);
    }
  }, [interval]);

  useEffect(() => {
    fetchMarket(interval);
  }, [interval, fetchMarket]);

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

  const signal = combined?.signal || "Awaiting analysis";
  const validationChecks = combined?.checks || [];

  // Use the combined decision as the final authority for the paper trade.
  const trade = useMemo(() => {
    if (!analysis) return null;

    const reportedTrade = analysis.trade || {};
    const finalSignal = analysis.combined?.signal || "NO TRADE";

    return {
      ...reportedTrade,
      signal: finalSignal,
      entry: reportedTrade.entry ?? analysis.oneHour?.entry ?? null,
      stopLoss:
        reportedTrade.stopLoss ?? analysis.oneHour?.stopLoss ?? null,
      takeProfits:
        reportedTrade.takeProfits ?? analysis.oneHour?.takeProfits ?? [],
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
    if (
      !trade ||
      !["BUY", "SELL"].includes(trade.signal) ||
      !position
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

        <section className="mt-5">
          <EconomicCalendar />
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
