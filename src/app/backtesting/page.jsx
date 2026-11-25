
"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FlaskConical,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const INSTRUMENTS = [
  "EUR/USD",
  "XAU/USD",
  "USD/JPY",
  "AUD/JPY",
];

const today = new Date();
const defaultEndDate = today.toISOString().slice(0, 10);

const defaultStart = new Date(today);
defaultStart.setUTCFullYear(defaultStart.getUTCFullYear() - 1);
const defaultStartDate = defaultStart.toISOString().slice(0, 10);

function formatNumber(value, digits = 2) {
  if (value == null || !Number.isFinite(Number(value))) {
    return "—";
  }

  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// Historical timestamps from the backtest engine are treated as UTC.
// Explicitly display UTC so the displayed time matches the engine's timestamps.
function formatDate(value) {
  if (!value) return "—";

  let normalized = String(value).trim();

  if (
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)
  ) {
    normalized = normalized.replace(" ", "T") + "Z";
  } else if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(normalized)
  ) {
    normalized += "Z";
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) return value;

  return (
    date.toLocaleString(undefined, {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }) + " UTC"
  );
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "blue",
}) {
  const tones = {
    blue: "border-blue-500/20 bg-blue-500/10 text-blue-300",
    green: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
    violet: "border-violet-500/20 bg-violet-500/10 text-violet-300",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  };

  return (
    <div className="rounded-2xl border border-[#26354c] bg-[#101b2d] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <div className={`rounded-lg border p-2 ${tones[tone]}`}>
          <Icon size={17} />
        </div>
      </div>

      <div className="mt-4 text-2xl font-bold tracking-tight text-white">
        {value}
      </div>

      {description && (
        <p className="mt-2 text-xs text-slate-500">{description}</p>
      )}
    </div>
  );
}

function StatusPill({ value }) {
  const styles = {
    WIN: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    LOSS: "border-red-500/20 bg-red-500/10 text-red-300",
    BREAKEVEN: "border-slate-500/20 bg-slate-500/10 text-slate-300",
    BUY: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
    SELL: "border-red-500/20 bg-red-500/10 text-red-300",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${
        styles[value] || styles.BREAKEVEN
      }`}
    >
      {value}
    </span>
  );
}

function DiagnosticCard({ label, value }) {
  return (
    <div className="rounded-xl bg-[#0a1322] p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-white">
        {value ?? "—"}
      </p>
    </div>
  );
}

export default function BacktestingPage() {
  const [symbol, setSymbol] = useState("EUR/USD");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [spreadPips, setSpreadPips] = useState("0");
  const [slippagePips, setSlippagePips] = useState("0");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState(null);

  const result = response?.result;
  const metrics = result?.metrics;
  const trades = result?.trades || [];

  // Preserve the exact settings used for the completed test.
  // Changing the form after a test will not change its displayed assumptions.
  const testConfig = response?.testConfig;

  const dateRangeValid = useMemo(() => {
    if (!startDate || !endDate) return false;

    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T23:59:59Z`);

    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start < end &&
      (end - start) / 86400000 <= 370
    );
  }, [startDate, endDate]);

  const costsAreZero =
    spreadPips.trim() !== "" &&
    slippagePips.trim() !== "" &&
    Number(spreadPips) === 0 &&
    Number(slippagePips) === 0;

  async function runBacktest(event) {
    event.preventDefault();

    setError("");
    setResponse(null);

    if (!dateRangeValid) {
      setError(
        "Choose a valid date range. The first backtest supports up to approximately 12 months."
      );
      return;
    }

    if (
      spreadPips.trim() === "" ||
      slippagePips.trim() === "" ||
      !Number.isFinite(Number(spreadPips)) ||
      Number(spreadPips) < 0 ||
      !Number.isFinite(Number(slippagePips)) ||
      Number(slippagePips) < 0
    ) {
      setError(
        "Enter valid non-negative numbers for spread and slippage."
      );
      return;
    }

    const submittedConfig = {
      symbol,
      startDate,
      endDate,
      spreadPips: Number(spreadPips),
      slippagePips: Number(slippagePips),
    };

    setLoading(true);

    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(submittedConfig),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "The backtest could not be completed."
        );
      }

      setResponse({
        ...data,
        testConfig: submittedConfig,
      });
    } catch (err) {
      setError(
        err.message || "An unexpected backtesting error occurred."
      );
    } finally {
      setLoading(false);
    }
  }

  function downloadTrades() {
    if (!trades.length) return;

    const headers = [
      "Direction",
      "Signal time",
      "Entry time",
      "Exit time",
      "Entry",
      "Stop loss",
      "Net R",
      "Net pips",
      "Outcome",
      "Exit reason",
      "Target 1 hit",
      "Target 2 hit",
      "Target 3 hit",
    ];

    const rows = trades.map((trade) => [
      trade.direction,
      trade.signalTime,
      trade.entryTime,
      trade.exitTime,
      trade.entry,
      trade.stopLoss,
      trade.netR,
      trade.netPips,
      trade.outcome,
      trade.exitReason,
      trade.targetHits?.[0],
      trade.targetHits?.[1],
      trade.targetHits?.[2],
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map(
            (value) =>
              `"${String(value ?? "").replaceAll('"', '""')}"`
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `NSB-${symbol.replace("/", "-")}-backtest.csv`;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    // Give the browser time to start the download before releasing the URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const diagnostics = result?.diagnostics || {};

  const profitFactorDisplay =
    metrics?.profitFactorStatus === "infinite"
      ? "∞"
      : metrics?.profitFactor == null
        ? "N/A"
        : formatNumber(metrics.profitFactor, 3);

  return (
    <main className="min-h-screen bg-[#0a1322] px-4 py-6 text-slate-100 md:ml-[230px] md:px-8 md:py-8">
      <div className="mx-auto max-w-[1500px] space-y-7">
        {/* Header */}
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-violet-300">
              <FlaskConical size={15} />
              NSB Strategy Laboratory
            </div>

            <h1 className="text-3xl font-black tracking-tight text-white">
              Backtesting
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Test the existing NSB technical strategy against historical
              market data before making changes to live trading rules.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-200">
              <Activity size={14} />
              Technical baseline
            </span>

            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">
              <ShieldAlert size={14} />
              Simulation only
            </span>
          </div>
        </header>

        {/* Strategy notice */}
        <section className="rounded-2xl border border-blue-400/20 bg-blue-500/[0.07] p-4">
          <div className="flex items-start gap-3">
            <FlaskConical
              className="mt-0.5 shrink-0 text-blue-300"
              size={19}
            />
            <div>
              <h2 className="text-sm font-bold text-blue-200">
                Existing NSB strategy
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                1H breakout strategy with EMA20, ATR and candle-strength
                confirmation, supported by 1H and completed 4H swing
                structure. This initial test does not replay historical
                economic-calendar events.
              </p>
            </div>
          </div>
        </section>

        {/* Controls */}
        <section className="rounded-2xl border border-[#26354c] bg-[#101b2d] p-5">
          <div className="mb-5 flex items-center gap-2">
            <BarChart3 size={18} className="text-blue-300" />
            <h2 className="font-bold text-white">
              Backtest configuration
            </h2>
          </div>

          <form onSubmit={runBacktest} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Trading instrument
                </span>
                <select
                  value={symbol}
                  onChange={(event) => setSymbol(event.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#34445e] bg-[#0a1322] px-3 py-3 text-sm text-white outline-none focus:border-blue-400"
                >
                  {INSTRUMENTS.map((instrument) => (
                    <option key={instrument} value={instrument}>
                      {instrument}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <CalendarDays size={14} />
                  Start date
                </span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#34445e] bg-[#0a1322] px-3 py-3 text-sm text-white outline-none focus:border-blue-400"
                />
              </label>

              <label className="space-y-2">
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-400">
                  <CalendarDays size={14} />
                  End date
                </span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  max={defaultEndDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#34445e] bg-[#0a1322] px-3 py-3 text-sm text-white outline-none focus:border-blue-400"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Spread (pips)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={spreadPips}
                  onChange={(event) => setSpreadPips(event.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#34445e] bg-[#0a1322] px-3 py-3 text-sm text-white outline-none focus:border-blue-400"
                />
              </label>

              <label className="space-y-2">
                <span className="text-xs font-semibold text-slate-400">
                  Slippage (pips)
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={slippagePips}
                  onChange={(event) => setSlippagePips(event.target.value)}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#34445e] bg-[#0a1322] px-3 py-3 text-sm text-white outline-none focus:border-blue-400"
                />
              </label>
            </div>

            {costsAreZero && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/[0.07] p-3 text-xs leading-5 text-amber-200">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                Spread and slippage are both zero. Results may overstate
                real-world performance. Enter realistic trading costs before
                using results to evaluate the strategy.
              </div>
            )}

            {!dateRangeValid && (
              <p className="text-xs text-red-300">
                Select a valid date range of no more than approximately
                12 months.
              </p>
            )}

            <div className="flex flex-col gap-3 border-t border-[#26354c] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                Historical data: Twelve Data · 1H + 4H · Maximum 12 months
              </p>

              <button
                type="submit"
                disabled={loading || !dateRangeValid}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <LoaderCircle size={17} className="animate-spin" />
                    Running backtest...
                  </>
                ) : (
                  <>
                    <RefreshCw size={17} />
                    Run Backtest
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">
                Backtest could not be completed
              </p>
              <p className="mt-1 text-xs leading-5 text-red-200/80">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="rounded-2xl border border-[#26354c] bg-[#101b2d] p-10 text-center">
            <LoaderCircle
              className="mx-auto animate-spin text-blue-300"
              size={32}
            />
            <h3 className="mt-4 font-semibold text-white">
              Processing historical market data
            </h3>
            <p className="mt-2 text-xs text-slate-400">
              Retrieving 1H and 4H candles and simulating historical trades.
              This may take some time.
            </p>
          </div>
        )}

        {/* Results */}
        {result && metrics && (
          <>
            <section className="space-y-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className="text-emerald-300"
                      size={18}
                    />
                    <h2 className="text-lg font-bold text-white">
                      Backtest results
                    </h2>
                  </div>

                  <p className="mt-1 text-xs text-slate-400">
                    {testConfig?.symbol || symbol} ·{" "}
                    {testConfig?.startDate || startDate} to{" "}
                    {testConfig?.endDate || endDate}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={downloadTrades}
                  disabled={!trades.length}
                  className="rounded-xl border border-[#34445e] px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-[#18263b] disabled:opacity-40"
                >
                  Export trade history CSV
                </button>
              </div>

              {/* Actual test settings */}
              <div className="rounded-2xl border border-[#26354c] bg-[#101b2d] p-4">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-blue-300" />
                  <h3 className="text-sm font-bold text-white">
                    Execution settings used for this test
                  </h3>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[#0a1322] p-3">
                    <p className="text-xs text-slate-500">Instrument</p>
                    <p className="mt-1 font-bold text-white">
                      {testConfig?.symbol || symbol}
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#0a1322] p-3">
                    <p className="text-xs text-slate-500">
                      Spread assumption
                    </p>
                    <p className="mt-1 font-bold text-white">
                      {testConfig
                        ? `${formatNumber(testConfig.spreadPips, 1)} pips`
                        : "Not recorded"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-[#0a1322] p-3">
                    <p className="text-xs text-slate-500">
                      Slippage assumption
                    </p>
                    <p className="mt-1 font-bold text-white">
                      {testConfig
                        ? `${formatNumber(testConfig.slippagePips, 1)} pips`
                        : "Not recorded"}
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-[11px] leading-5 text-slate-500">
                  These are the settings submitted for this specific test.
                  They are not historical broker spread measurements.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Win rate"
                  value={`${formatNumber(metrics.winRate)}%`}
                  description={`${metrics.winningTrades} winning trades out of ${metrics.totalTrades}`}
                  icon={Target}
                  tone="blue"
                />

                <MetricCard
                  label="Profit factor"
                  value={profitFactorDisplay}
                  description="Gross profit divided by gross loss"
                  icon={BarChart3}
                  tone="violet"
                />

                <MetricCard
                  label="Net performance"
                  value={`${metrics.netR >= 0 ? "+" : ""}${formatNumber(metrics.netR, 2)}R`}
                  description="Net result after simulated costs"
                  icon={metrics.netR >= 0 ? TrendingUp : TrendingDown}
                  tone={metrics.netR >= 0 ? "green" : "red"}
                />

                <MetricCard
                  label="Expectancy"
                  value={`${metrics.expectancyR >= 0 ? "+" : ""}${formatNumber(metrics.expectancyR, 3)}R`}
                  description="Average net R per trade"
                  icon={Activity}
                  tone={metrics.expectancyR >= 0 ? "green" : "red"}
                />

                <MetricCard
                  label="Maximum drawdown"
                  value={`${formatNumber(metrics.maximumDrawdownR, 2)}R`}
                  description="Largest peak-to-trough decline in cumulative R"
                  icon={ArrowDownRight}
                  tone="red"
                />

                <MetricCard
                  label="Total trades"
                  value={metrics.totalTrades}
                  description={`${metrics.losingTrades} losses · ${metrics.breakevenTrades} breakeven`}
                  icon={FlaskConical}
                  tone="blue"
                />

                <MetricCard
                  label="Net pips"
                  value={`${metrics.netPips >= 0 ? "+" : ""}${formatNumber(metrics.netPips, 1)}`}
                  description="Net simulated price movement in pips"
                  icon={ArrowUpRight}
                  tone={metrics.netPips >= 0 ? "green" : "red"}
                />

                <MetricCard
                  label="Average duration"
                  value={`${formatNumber(metrics.averageDurationCandles, 1)} candles`}
                  description="Average time in a simulated position"
                  icon={Clock3}
                  tone="amber"
                />
              </div>
            </section>

            {/* Target performance */}
            <section className="rounded-2xl border border-[#26354c] bg-[#101b2d] p-5">
              <h2 className="font-bold text-white">
                Partial take-profit performance
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Number of trades that reached each target. Percentages use
                all completed trades as the denominator.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                {[
                  {
                    label: "Target 1",
                    multiple: "1R",
                    hits: metrics.target1Hits,
                  },
                  {
                    label: "Target 2",
                    multiple: "2R",
                    hits: metrics.target2Hits,
                  },
                  {
                    label: "Target 3",
                    multiple: "3R",
                    hits: metrics.target3Hits,
                  },
                ].map((target) => (
                  <div
                    key={target.label}
                    className="rounded-xl border border-[#26354c] bg-[#0a1322] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-300">
                        {target.label}
                      </span>
                      <span className="rounded-lg bg-blue-500/10 px-2 py-1 text-xs font-bold text-blue-300">
                        {target.multiple}
                      </span>
                    </div>

                    <p className="mt-3 text-2xl font-bold text-white">
                      {target.hits ?? 0}
                    </p>

                    <p className="mt-1 text-xs text-slate-500">
                      {metrics.totalTrades > 0
                        ? `${formatNumber(((target.hits || 0) / metrics.totalTrades) * 100)}% of trades`
                        : "No trades"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* Diagnostics */}
            <section className="rounded-2xl border border-[#26354c] bg-[#101b2d] p-5">
              <h2 className="font-bold text-white">
                Backtest diagnostics
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Data coverage and signal-processing counts for this run.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <DiagnosticCard
                  label="1H candles"
                  value={response.data?.oneHour?.candleCount}
                />
                <DiagnosticCard
                  label="4H candles"
                  value={response.data?.fourHour?.candleCount}
                />
                <DiagnosticCard
                  label="1H data requests"
                  value={response.data?.oneHour?.requestCount}
                />
                <DiagnosticCard
                  label="4H data requests"
                  value={response.data?.fourHour?.requestCount}
                />
                <DiagnosticCard
                  label="Evaluated candles"
                  value={diagnostics.evaluatedCandles}
                />
                <DiagnosticCard
                  label="No signal"
                  value={diagnostics.noSignal}
                />
                <DiagnosticCard
                  label="Rejected confirmations"
                  value={diagnostics.rejectedTechnicalConfirmation}
                />
                <DiagnosticCard
                  label="Insufficient 4H history"
                  value={diagnostics.insufficientFourHourHistory}
                />
                <DiagnosticCard
                  label="Delayed entry skipped"
                  value={diagnostics.delayedEntrySkipped}
                />
                <DiagnosticCard
                  label="Missing entry candle"
                  value={diagnostics.missingEntryCandle}
                />
                <DiagnosticCard
                  label="Trades closed at end of data"
                  value={diagnostics.endOfDataClosedTrades}
                />
                <DiagnosticCard
                  label="Completed trades"
                  value={metrics.totalTrades}
                />
              </div>

              <p className="mt-4 text-[11px] leading-5 text-slate-500">
                A delayed entry is skipped when the next candle does not
                begin exactly at the signal candle's close. This prevents
                the engine from entering late on a stale signal.
              </p>
            </section>

            {/* Trade history */}
            <section className="overflow-hidden rounded-2xl border border-[#26354c] bg-[#101b2d]">
              <div className="flex flex-col justify-between gap-3 border-b border-[#26354c] p-5 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-bold text-white">Trade history</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {trades.length} simulated trades · Sorted chronologically
                    · Times shown in UTC
                  </p>
                </div>

                <button
                  type="button"
                  onClick={downloadTrades}
                  disabled={!trades.length}
                  className="rounded-lg border border-[#34445e] px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-[#18263b] disabled:opacity-40"
                >
                  Download CSV
                </button>
              </div>

              {trades.length === 0 ? (
                <div className="p-10 text-center">
                  <BarChart3
                    size={30}
                    className="mx-auto text-slate-600"
                  />
                  <p className="mt-3 font-semibold text-slate-300">
                    No qualifying trades found
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    The strategy did not generate trades under the selected
                    conditions and historical data.
                  </p>
                </div>
              ) : (
                <div className="max-h-[650px] overflow-auto">
                  <table className="w-full min-w-[1150px] text-left text-xs">
                    <thead className="sticky top-0 bg-[#0a1322] text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-semibold">#</th>
                        <th className="px-4 py-3 font-semibold">Direction</th>
                        <th className="px-4 py-3 font-semibold">Entry time</th>
                        <th className="px-4 py-3 font-semibold">Exit time</th>
                        <th className="px-4 py-3 font-semibold">Entry</th>
                        <th className="px-4 py-3 font-semibold">Stop loss</th>
                        <th className="px-4 py-3 font-semibold">Targets hit</th>
                        <th className="px-4 py-3 font-semibold">Net R</th>
                        <th className="px-4 py-3 font-semibold">Net pips</th>
                        <th className="px-4 py-3 font-semibold">Outcome</th>
                        <th className="px-4 py-3 font-semibold">Exit reason</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#26354c]">
                      {trades.map((trade, index) => (
                        <tr
                          key={`${trade.entryTime}-${index}`}
                          className="transition hover:bg-white/[0.025]"
                        >
                          <td className="px-4 py-3 text-slate-500">
                            {index + 1}
                          </td>

                          <td className="px-4 py-3">
                            <StatusPill value={trade.direction} />
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                            {formatDate(trade.entryTime)}
                          </td>

                          <td className="whitespace-nowrap px-4 py-3 text-slate-300">
                            {formatDate(trade.exitTime)}
                          </td>

                          <td className="px-4 py-3 font-mono text-slate-200">
                            {trade.entry}
                          </td>

                          <td className="px-4 py-3 font-mono text-red-300">
                            {trade.stopLoss}
                          </td>

                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {trade.targetHits?.some(Boolean) ? (
                                trade.targetHits.map((hit, i) =>
                                  hit ? (
                                    <span
                                      key={i}
                                      className="rounded bg-emerald-500/15 px-2 py-1 font-bold text-emerald-300"
                                    >
                                      {i + 1}R
                                    </span>
                                  ) : null
                                )
                              ) : (
                                <span className="text-slate-500">
                                  None
                                </span>
                              )}
                            </div>
                          </td>

                          <td
                            className={`px-4 py-3 font-bold ${
                              trade.netR > 0
                                ? "text-emerald-300"
                                : trade.netR < 0
                                  ? "text-red-300"
                                  : "text-slate-300"
                            }`}
                          >
                            {trade.netR > 0 ? "+" : ""}
                            {formatNumber(trade.netR, 2)}R
                          </td>

                          <td className="px-4 py-3 font-mono text-slate-300">
                            {trade.netPips > 0 ? "+" : ""}
                            {formatNumber(trade.netPips, 1)}
                          </td>

                          <td className="px-4 py-3">
                            <StatusPill value={trade.outcome} />
                          </td>

                          <td className="px-4 py-3 text-slate-400">
                            {trade.exitReason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Assumptions */}
            <section className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle
                  size={17}
                  className="text-amber-300"
                />
                <h2 className="font-bold text-amber-200">
                  Simulation assumptions and limitations
                </h2>
              </div>

              <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-400">
                {(result.assumptions || []).map((assumption, index) => (
                  <li key={index} className="flex gap-2">
                    <span className="text-amber-300">•</span>
                    {assumption}
                  </li>
                ))}
              </ul>

              <p className="mt-4 border-t border-amber-400/10 pt-3 text-xs leading-5 text-amber-200/80">
                Historical simulation is not a guarantee of future
                performance. These results are a technical baseline, not
                verified live trading accuracy or a complete
                technical-plus-fundamental backtest.
              </p>
            </section>
          </>
        )}

        {/* Empty state */}
        {!result && !loading && !error && (
          <section className="rounded-2xl border border-dashed border-[#34445e] bg-[#101b2d]/60 px-5 py-14 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300">
              <FlaskConical size={27} />
            </div>

            <h2 className="mt-5 text-lg font-bold text-white">
              Ready to test your strategy?
            </h2>

            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
              Select an instrument, review the historical date range and
              configure realistic transaction costs. Then run your first
              NSB backtest.
            </p>
          </section>
        )}

        <footer className="border-t border-[#26354c] pt-5 text-center text-[11px] text-slate-600">
          NSB SMART BROKER · Backtesting laboratory · Paper simulation only
        </footer>
      </div>
    </main>
  );
}
