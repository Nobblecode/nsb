
"use client";

import { useCallback, useEffect, useState } from "react";

function formatEventTime(event) {
  const value =
    event.time_local ||
    event.release_at_utc ||
    event.time_utc;

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

function formatTimestamp(value) {
  if (!value) return "Unavailable";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Unavailable";

  return date.toLocaleString("en-GB", {
    timeZone: "Africa/Lagos",
  });
}

function impactStyle(impact) {
  const level = String(impact ?? "").toLowerCase();

  if (level === "high") {
    return "border-red-500/40 bg-red-500/10 text-red-300";
  }

  if (level === "medium") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }

  return "border-slate-500/40 bg-slate-500/10 text-slate-300";
}

export default function EconomicCalendar() {
  const [events, setEvents] = useState([]);
  const [impact, setImpact] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [providerUpdatedAt, setProviderUpdatedAt] = useState(null);

  const loadCalendar = useCallback(async ({ manual = false } = {}) => {
    if (manual) {
      setRefreshing(true);
    } else if (events.length === 0) {
      setLoading(true);
    }

    setError("");

    try {
      const response = await fetch(
        `/api/calendar?impact=${encodeURIComponent(impact)}`,
        {
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || `Calendar request failed (${response.status}).`
        );
      }

      setEvents(Array.isArray(data.events) ? data.events : []);
      setUpdatedAt(data.fetchedAt || new Date().toISOString());
      setProviderUpdatedAt(data.providerDataUpdatedAt || null);
    } catch (err) {
      setError(
        err.message || "Calendar unavailable. Please try again."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [impact]); // Filter changes request the corresponding event list.

  useEffect(() => {
    loadCalendar();

    const timer = setInterval(() => {
      loadCalendar();
    }, 5 * 60 * 1000);

    return () => clearInterval(timer);
  }, [loadCalendar]);

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Economic Calendar</h2>
          <p className="mt-1 text-sm text-slate-400">
            US and EU events · Times shown in Lagos time
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadCalendar({ manual: true })}
          disabled={loading || refreshing}
          className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          {refreshing ? "Refreshing..." : loading ? "Loading..." : "Refresh calendar"}
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
          <p>{error}</p>
          {events.length > 0 && (
            <p className="mt-1 text-xs">
              Previously loaded events are still displayed. They may be outdated.
            </p>
          )}
          <button
            type="button"
            onClick={() => loadCalendar({ manual: true })}
            disabled={refreshing}
            className="mt-2 underline disabled:opacity-50"
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
          No events were returned for this filter. This does not confirm that no economic releases are scheduled.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {events.map((event, index) => (
          <article
            key={event.id || `${event.title || event.name || "event"}-${index}`}
            className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {event.title ||
                    event.name ||
                    event.series_name ||
                    "Economic event"}
                </p>

                <p className="mt-1 text-sm text-slate-400">
                  {formatEventTime(event)} ·{" "}
                  {event.country || event.currency || "Currency unknown"}
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

      <div className="mt-4 space-y-1 text-xs text-slate-500">
        <p>Last successful fetch: {formatTimestamp(updatedAt)}</p>
        <p>Provider data update: {formatTimestamp(providerUpdatedAt)}</p>
        <p>
          A successful fetch does not guarantee the provider has published
          the latest events, actuals, or forecasts.
        </p>
      </div>

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
        . Verify important releases independently.
      </p>
    </section>
  );
}
