
"use client";

import { useCallback, useEffect, useState } from "react";

function formatEventTime(event) {
  const value = event.time_local || event.release_at_utc || event.time_utc;

  if (!value) return event.date || "Time not available";

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return `${event.date || ""} ${value}`.trim();
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(parsed);
}

function impactStyle(impact) {
  if (impact === "high") {
    return "border-red-500/40 bg-red-500/10 text-red-300";
  }

  if (impact === "medium") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }

  return "border-slate-500/40 bg-slate-500/10 text-slate-300";
}

export default function EconomicCalendar() {
  const [events, setEvents] = useState([]);
  const [impact, setImpact] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const loadCalendar = useCallback(async () => {
    try {
      setError("");

      const response = await fetch(
        `/api/calendar?impact=${impact}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not load economic calendar.");
      }

      setEvents(data.events || []);
      setUpdatedAt(data.fetchedAt || "");
    } catch (err) {
      setError(err.message || "Calendar unavailable.");
    } finally {
      setLoading(false);
    }
  }, [impact]);

  useEffect(() => {
    loadCalendar();

    const timer = setInterval(loadCalendar, 5 * 60 * 1000);

    return () => clearInterval(timer);
  }, [loadCalendar]);

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Economic Calendar
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            EUR/USD events · Times shown in Lagos time
          </p>
        </div>

        <button
          type="button"
          onClick={loadCalendar}
          disabled={loading}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {["all", "high", "medium", "low"].map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => setImpact(level)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              impact === level
                ? "border-indigo-400 bg-indigo-500/20 text-indigo-200"
                : "border-slate-700 text-slate-300"
            }`}
          >
            {level === "all"
              ? "All impact levels"
              : `${level[0].toUpperCase()}${level.slice(1)} impact`}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
          <button
            type="button"
            onClick={loadCalendar}
            className="ml-2 underline"
          >
            Try again
          </button>
        </div>
      )}

      {!error && loading && events.length === 0 && (
        <p className="mt-5 text-sm text-slate-400">
          Loading economic events...
        </p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="mt-5 text-sm text-slate-400">
          No events were returned for these filters.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {events.map((event, index) => (
          <article
            key={event.id || `${event.title}-${index}`}
            className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {event.title || event.name || event.series_name || "Economic event"}
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  {formatEventTime(event)} · {event.country || "Currency unknown"}
                </p>
              </div>

              <span
                className={`rounded-full border px-2 py-1 text-xs ${impactStyle(event.impact)}`}
              >
                {event.impact || "Unknown"} impact
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
              <div>
                <p className="text-slate-500">Actual</p>
                <p>{event.actual ?? "Pending"}</p>
              </div>

              <div>
                <p className="text-slate-500">Forecast</p>
                <p>{event.consensus ?? "Unavailable"}</p>
              </div>

              <div>
                <p className="text-slate-500">Previous</p>
                <p>{event.prior ?? "Unavailable"}</p>
              </div>
            </div>

            {event.status && (
              <p className="mt-2 text-xs text-slate-500">
                Status: {event.status}
              </p>
            )}

            {event.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-sm text-indigo-300 hover:underline"
              >
                Event details ↗
              </a>
            )}
          </article>
        ))}
      </div>

      {updatedAt && (
        <p className="mt-4 text-xs text-slate-500">
          Last fetched: {new Date(updatedAt).toLocaleString("en-GB", {
            timeZone: "Africa/Lagos",
          })}
        </p>
      )}

      <p className="mt-4 border-t border-slate-800 pt-3 text-xs text-slate-400">
        Calendar data provided by{" "}
        <a
          href="https://www.financecalendar.com/"
          target="_blank"
          rel="noreferrer"
          className="text-indigo-300 underline"
        >
          Finance Calendar
        </a>
        . Events and forecasts may change; verify important releases.
      </p>
    </section>
  );
}
