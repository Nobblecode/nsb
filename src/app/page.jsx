
"use client";
import EconomicCalendar from "@/components/EconomicCalendar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  Crosshair,
  ExternalLink,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldAlert,
  Wallet,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import Sidebar from "@/components/Sidebar";
import TradingChart from "@/components/TradingChart";
import { calculatePosition } from "@/lib/riskManagement";

const money = (n) =>
  n == null || !Number.isFinite(Number(n))
    ? "—"
    : Number(n).toFixed(5);

const storedRead = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

/* Shows every strategy condition returned by the analysis API. */

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
            Every required condition must pass before NSB permits a simulated trade.
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
        {checks.map((check) => (
          <div
            key={check.id}
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
                  {check.label}
                </p>

                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {check.detail}
                </p>

                <p
                  className={`mt-2 text-[10px] font-bold tracking-wider ${
                    check.passed
                      ? "text-emerald-300"
                      : "text-amber-300"
                  }`}
                >
                  {check.passed ? "PASSED" : "FAILED — TRADE BLOCKED"}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {failedCount > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
          <p className="text-sm font-semibold text-amber-200">
            {failedCount} condition{failedCount === 1 ? "" : "s"} still need
            to pass.
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            NSB will continue to show NO TRADE until every required condition
            passes. Do not force a signal just to open a simulated position.
          </p>
        </div>
      )}

      {failedCount === 0 && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
          <p className="text-sm font-semibold text-emerald-200">
            All required conditions passed.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            The strategy rules permit a directional setup. This does not
            guarantee a profitable trade.
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
    setTrades(storedRead("nsb-paper-trades", []));
    setBalance(storedRead("nsb-account-balance", "10000"));
  }, []);

  const fetchMarket = useCallback(async (tf = interval) => {
    setLoadingMarket(true);
    setMarketError("");

    try {
      const response = await fetch(`/api/market?interval=${tf}`);
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
      headers: {
        "Content-Type": "application/json",
      },
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


  const position = useMemo(() => {
    if (
      analysis?.trade?.entry == null ||
      analysis?.trade?.stopLoss == null ||
      analysis.trade.signal === "NO TRADE"
    ) {
      return null;
    }

    try {
      return calculatePosition({
        accountBalance: balance,
        riskPercent,
        entry: analysis.trade.entry,
        stopLoss: analysis.trade.stopLoss,
      });
    } catch {
      return null;
    }
  }, [analysis, balance, riskPercent]);

  const saveTrades = (nextTrades) => {
    setTrades(nextTrades);

    try {
      localStorage.setItem(
        "nsb-paper-trades",
        JSON.stringify(nextTrades)
      );
    } catch {
      // The current session still updates if browser storage is unavailable.
    }
  };

  const openPaperTrade = () => {
    if (
      !analysis?.trade ||
      analysis.trade.signal === "NO TRADE" ||
      !position
    ) {
      return;
    }

    const trade = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      signal: analysis.trade.signal,
      entry: analysis.trade.entry,
      stopLoss: analysis.trade.stopLoss,
      takeProfits: analysis.trade.takeProfits,
      riskAmount: position.riskAmount,
      lots: position.lots,
      status: "open",
      outcome: null,
    };

    saveTrades([trade, ...trades]);
  };

  const closePaperTrade = (id) => {
    saveTrades(
      trades.map((trade) =>
        trade.id === id
          ? {
              ...trade,
              status: "closed",
              outcome: tradeOutcome,
              closedAt: new Date().toISOString(),
            }
          : trade
      )
    );
  };

  const closedTrades = trades.filter(
    (trade) => trade.status === "closed"
  );

  const winRate = closedTrades.length
    ? Math.round(
        (closedTrades.filter((trade) => trade.outcome === "win").length /
          closedTrades.length) *
          100
      )
    : null;

  const price = market?.latest?.close;
  const signal = analysis?.combined?.signal || "Awaiting analysis";

  const validationChecks = analysis?.combined?.checks ?? [];

  return (
    <div className="min-h-screen">
      <Sidebar />

      <main className="mx-auto max-w-[1600px] px-4 py-5 md:ml-[230px] md:px-7 md:py-7">
        {/* Page header */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">
              Trading intelligence workspace
            </div>

            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
              Market analysis
            </h1>

            <p className="mt-2 text-sm text-slate-400">
              EUR/USD · structure + fundamentals · paper trading only
            </p>
          </div>

          <div className="flex items-center gap-2">
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
              Refresh
            </button>
          </div>
        </header>

        {/* Summary cards */}
        <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <div className="kpi">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                EUR/USD last close
              </span>
              <Activity size={16} className="text-blue-300" />
            </div>

            <div className="mt-3 text-2xl font-bold tabular-nums">
              {money(price)}
            </div>

            <div className="mt-1 text-xs text-slate-500">
              {market ? `Source: ${market.source}` : "No live data loaded"}
            </div>
          </div>

          <div className="kpi">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Combined signal
              </span>
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
              Strict confirmation rules enabled
            </div>
          </div>

          <div className="kpi">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Paper trades
              </span>
              <Wallet size={16} className="text-blue-300" />
            </div>

            <div className="mt-3 text-2xl font-bold">
              {trades.length}
            </div>

            <div className="mt-1 text-xs text-slate-500">
              {trades.filter((trade) => trade.status === "open").length} open
              {" · "}
              {closedTrades.length} closed
            </div>
          </div>

          <div className="kpi">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Paper win rate
              </span>
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

        {/* Chart and analysis controls */}
        
          <section className="panel p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  Analysis controls
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  Automatic market and fundamental analysis
                </p>
              </div>

              <Activity size={19} className="text-blue-300" />
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex items-center gap-2">
                  <Activity size={18} className="text-blue-300" />
                  <h3 className="font-semibold text-white">
                    Fully automatic analysis
                  </h3>
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-400">
                  NSB retrieves EUR/USD market candles and economic-calendar
                  data, evaluates technical structure and fundamental
                  conditions, and combines the results using your strategy
                  rules.
                </p>

                <div className="mt-4 space-y-2 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-blue-300" />
                    1H and 4H trend analysis
                  </div>

                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-blue-300" />
                    EMA, breakout and ATR-based levels
                  </div>

                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-blue-300" />
                    Automatic economic-calendar assessment
                  </div>

                  <div className="flex items-center gap-2">
                    <ShieldAlert size={15} className="text-amber-300" />
                    Missing data or failed checks can block a trade
                  </div>
                </div>
              </div>

              <button
                className="btn btn-primary w-full py-3"
                onClick={runAnalysis}
                disabled={analyzing}
              >
                {analyzing ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <Play size={16} />
                )}

                {analyzing
                  ? "Analyzing market and fundamentals..."
                  : "Analyze EUR/USD"}
              </button>

              {analysisError && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                  <b>Analysis failed</b>
                  <p className="mt-1">{analysisError}</p>
                </div>
              )}

              <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3">
                <div className="flex gap-2 text-xs font-semibold text-amber-100">
                  <ShieldAlert size={16} />
                  Validation and risk controls
                </div>

                <p className="mt-2 text-xs leading-5 text-slate-400">
                  NSB should show NO TRADE when required confirmations fail
                  or fundamental data is incomplete. Signals are not
                  guaranteed predictions.
                </p>
              </div>
            </div>
          </section>

        

        {/* Analysis report */}
        <section className="panel mt-5 p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Analysis report</h2>
              <p className="mt-1 text-xs text-slate-400">
                Rule-based structure analysis · not financial advice
              </p>
            </div>

            {analysis && (
              <span className="pill">
                Updated {new Date(analysis.generatedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          {!analysis ? (
            <div className="grid-lines rounded-xl border border-dashed border-[#2b3b55] px-5 py-10 text-center">
              <Crosshair
                className="mx-auto mb-3 text-slate-500"
                size={28}
              />

              <p className="font-semibold">No analysis report yet</p>

              <p className="mt-1 text-sm text-slate-500">
                Click Analyze EUR/USD to retrieve market data and assess the strategy automatically.
              </p>
            </div>
          ) : (
            <>
              {/* Timeframe and fundamentals summary */}
              <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="kpi">
                  <div className="text-xs text-slate-400">
                    1H trend / setup
                  </div>

                  <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
                    {analysis.oneHour.trend === "bullish" ? (
                      <TrendingUp className="text-emerald-300" />
                    ) : analysis.oneHour.trend === "bearish" ? (
                      <TrendingDown className="text-rose-300" />
                    ) : (
                      <Activity className="text-amber-200" />
                    )}

                    {analysis.oneHour.trend.toUpperCase()}
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {analysis.oneHour.structure}
                  </p>
                </div>

                <div className="kpi">
                  <div className="text-xs text-slate-400">
                    4H trend / context
                  </div>

                  <div className="mt-2 text-lg font-semibold">
                    {analysis.fourHour.trend.toUpperCase()}
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    EMA20 {money(analysis.fourHour.ema20)} · EMA50{" "}
                    {money(analysis.fourHour.ema50)}
                  </p>
                </div>

                
<div className="kpi">
  <div className="text-xs text-slate-400">
    Automatic fundamentals
  </div>

  <div className="mt-2 text-lg font-semibold capitalize">
    {analysis.fundamentals?.bias || "unknown"}
  </div>

  <p className="mt-1 text-xs text-slate-400">
    Event risk: {analysis.fundamentals?.eventRisk || "unknown"}
  </p>

  <p className="mt-2 text-xs leading-5 text-slate-400">
    Source: {analysis.fundamentals?.source || "Unavailable"}
  </p>

  {analysis.fundamentals?.note && (
    <p className="mt-2 text-xs leading-5 text-slate-300">
      {analysis.fundamentals.note}
    </p>
  )}
</div>


                  <div className="mt-2 text-lg font-semibold capitalize">
                    {analysis.fundamentals.bias} /{" "}
                    {analysis.fundamentals.eventRisk} risk
                  </div>

                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {analysis.fundamentals.source}
                  </p>
                </div>
              
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
                
<div className="mt-4 rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
  <AnalysisChecks checks={analysis.combined.checks || []} />
</div>

                {/* Decision and full checklist */}
                <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <div
                      className={`rounded-lg p-2 ${
                        analysis.combined.signal === "BUY"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : analysis.combined.signal === "SELL"
                            ? "bg-rose-500/10 text-rose-300"
                            : "bg-amber-500/10 text-amber-200"
                      }`}
                    >
                      {analysis.combined.signal === "BUY" ? (
                        <ArrowUpRight size={19} />
                      ) : analysis.combined.signal === "SELL" ? (
                        <ArrowDownRight size={19} />
                      ) : (
                        <AlertTriangle size={19} />
                      )}
                    </div>

                    <div>
                      <div className="text-xs text-slate-400">
                        Combined decision
                      </div>

                      <div className="text-xl font-bold">
                        {analysis.combined.signal}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm leading-6 text-slate-300">
                    {analysis.combined.reason}
                  </p>

                  {/* NEW: detailed pass/fail checklist */}
                  <AnalysisChecks checks={validationChecks} />

                  {analysis.fundamentals.caution && (
                    <p className="mt-3 text-xs text-amber-200">
                      {analysis.fundamentals.caution}
                    </p>
                  )}
                </div>

                {/* Trade levels */}
                <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
                  <h3 className="mb-3 font-semibold">Trade levels</h3>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-slate-400">
                        Entry / last close
                      </span>
                      <b className="tabular-nums">
                        {money(analysis.trade.entry)}
                      </b>
                    </div>

                    <div className="flex justify-between gap-3">
                      <span className="text-rose-300">Stop loss</span>
                      <b className="tabular-nums">
                        {money(analysis.trade.stopLoss)}
                      </b>
                    </div>

                    {(analysis.trade.takeProfits ?? []).map((value, index) => (
                      <div
                        className="flex justify-between gap-3"
                        key={index}
                      >
                        <span className="text-emerald-300">
                          Take profit {index + 1}
                        </span>
                        <b className="tabular-nums">{money(value)}</b>
                      </div>
                    ))}
                  </div>

                  <p className="mt-3 text-[11px] leading-5 text-slate-500">
                    Levels are ATR-based illustrations, not broker orders.
                    Entry is based on the latest candle supplied by the
                    analysis provider; verify whether it is completed.
                    NO TRADE hides all levels.
                  </p>
                </div>
              </div>

              {/* Risk calculator and validation status */}
              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.7fr)]">
                <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
                  <h3 className="mb-3 flex items-center gap-2 font-semibold">
                    <ShieldAlert size={17} className="text-blue-300" />
                    Risk calculator
                  </h3>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs text-slate-400">
                        Account balance (USD)
                      </label>

                      <input
                        className="field"
                        type="number"
                        min="1"
                        value={balance}
                        onChange={(event) => {
                          setBalance(event.target.value);

                          try {
                            localStorage.setItem(
                              "nsb-account-balance",
                              JSON.stringify(event.target.value)
                            );
                          } catch {
                            // Storage may be unavailable.
                          }
                        }}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-slate-400">
                        Risk per trade (%)
                      </label>

                      <select
                        className="field"
                        value={riskPercent}
                        onChange={(event) =>
                          setRiskPercent(event.target.value)
                        }
                      >
                        <option value="0.25">0.25%</option>
                        <option value="0.5">0.5%</option>
                        <option value="1">1%</option>
                        <option value="1.5">1.5%</option>
                        <option value="2">2% (max)</option>
                      </select>
                    </div>
                  </div>

                  {position ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <div className="kpi">
                        <div className="text-[10px] text-slate-400">
                          Risk amount
                        </div>
                        <div className="mt-1 font-semibold">
                          ${position.riskAmount}
                        </div>
                      </div>

                      <div className="kpi">
                        <div className="text-[10px] text-slate-400">
                          Stop distance
                        </div>
                        <div className="mt-1 font-semibold">
                          {position.stopPips} pips
                        </div>
                      </div>

                      <div className="kpi">
                        <div className="text-[10px] text-slate-400">
                          Approx. lots
                        </div>
                        <div className="mt-1 font-semibold">
                          {position.lots}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">
                      Risk estimate appears only when the combined decision
                      produces valid entry and stop levels.
                    </p>
                  )}

                  <p className="mt-3 text-[11px] leading-5 text-slate-500">
                    {position?.disclaimer ||
                      "The calculator estimates EUR/USD risk for a USD-denominated account. Actual execution costs may differ."}
                  </p>

                  <button
                    className="btn btn-primary mt-4 w-full"
                    onClick={openPaperTrade}
                    disabled={
                      analysis.trade.signal === "NO TRADE" || !position
                    }
                  >
                    <Play size={15} />
                    Open simulated trade
                  </button>
                </div>

                <div className="rounded-xl border border-[#26354c] bg-[#0b1525] p-4">
                  <h3 className="mb-3 font-semibold">Validation status</h3>

                  <div className="space-y-3 text-xs">
                    <div className="flex items-start gap-2">
                      <CheckCircle2
                        size={16}
                        className="mt-0.5 shrink-0 text-emerald-300"
                      />

                      <div>
                        <b>Price structure calculated</b>
                        <p className="mt-1 text-slate-400">
                          {analysis.oneHour.dataPoints} 1H candles and{" "}
                          {analysis.fourHour.dataPoints} 4H candles retrieved.
                        </p>
                      </div>
                    </div>

                    {/* Show every check again in the validation panel */}
                    {validationChecks.map((check) => (
                      <div
                        key={check.id}
                        className="flex items-start gap-2"
                      >
                        {check.passed ? (
                          <CheckCircle2
                            size={16}
                            className="mt-0.5 shrink-0 text-emerald-300"
                          />
                        ) : (
                          <AlertTriangle
                            size={16}
                            className="mt-0.5 shrink-0 text-amber-300"
                          />
                        )}

                        <div>
                          <b>
                            {check.label} —{" "}
                            {check.passed ? "PASSED" : "NOT PASSED"}
                          </b>

                          <p className="mt-1 text-slate-400">
                            {check.detail}
                          </p>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        size={16}
                        className="mt-0.5 shrink-0 text-amber-300"
                      />

                      <div>
                        <b>No backtested win rate yet</b>
                        <p className="mt-1 text-slate-400">
                          Signals have not yet been validated by a completed
                          backtest. The analysis score is not a proven win
                          rate.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <div className="mt-6">
  <EconomicCalendar />
</div>

        {/* Paper trading journal */}
        <section className="panel mt-5 p-4 md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                Paper trading journal
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                Saved in this browser only. No real orders are placed.
              </p>
            </div>

            <span className="pill">
              {trades.filter((trade) => trade.status === "open").length} open
              positions
            </span>
          </div>

          {trades.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#2b3b55] p-7 text-center text-sm text-slate-500">
              No simulated trades yet. Run an analysis and open a trade
              when the signal is not NO TRADE.
            </p>
          ) : (
            <div className="space-y-3">
              {trades.map((trade) => (
                <div
                  key={trade.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#26354c] bg-[#0b1525] p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-bold ${
                          trade.signal === "BUY"
                            ? "text-emerald-300"
                            : "text-rose-300"
                        }`}
                      >
                        {trade.signal}
                      </span>

                      <span className="pill">{trade.status}</span>
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                      Entry {money(trade.entry)} · SL{" "}
                      {money(trade.stopLoss)} · Risk ${trade.riskAmount} ·{" "}
                      {trade.lots} lots
                    </p>

                    <p className="mt-1 text-[11px] text-slate-500">
                      {new Date(trade.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {trade.status === "open" ? (
                    <div className="flex items-center gap-2">
                      <select
                        className="field !w-auto text-xs"
                        value={tradeOutcome}
                        onChange={(event) =>
                          setTradeOutcome(event.target.value)
                        }
                      >
                        <option value="win">Mark win</option>
                        <option value="loss">Mark loss</option>
                        <option value="breakeven">Mark breakeven</option>
                      </select>

                      <button
                        className="btn btn-secondary"
                        onClick={() => closePaperTrade(trade.id)}
                      >
                        Close trade
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-300">
                      Result: <b>{trade.outcome}</b>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-[11px] leading-5 text-slate-500">
            Paper trade outcomes are manually recorded. They do not
            automatically determine whether price hit a target or stop.
            Clearing browser storage can remove the journal.
          </p>
        </section>

        <footer className="px-1 py-6 text-center text-[11px] leading-5 text-slate-500">
          NSB is an educational analysis and paper-trading tool, not
          financial advice. Forex is high risk. Verify quotes and event
          risk independently; historical results do not guarantee future
          performance.
        </footer>
      </main>
    </div>
  );
}
