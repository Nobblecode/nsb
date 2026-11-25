
const normalize = (value) =>
  String(value ?? "").trim().toLowerCase();

const CALENDAR_SOURCE = "ShowMyTrades";

const INSTRUMENT_CURRENCIES = {
  "EUR/USD": { base: "EUR", quote: "USD" },
  "XAU/USD": { base: "XAU", quote: "USD" },
  "USD/JPY": { base: "USD", quote: "JPY" },
  "AUD/JPY": { base: "AUD", quote: "JPY" },
};

function getTitle(event) {
  return (
    event.title ||
    event.name ||
    event.series_name ||
    "Economic event"
  );
}

function getCurrency(event) {
  const value = normalize(
    `${event.country ?? ""} ${event.currency ?? ""}`
  );

  if (/\b(usd|usa|us|united states|united states of america)\b/.test(value)) {
    return "USD";
  }

  if (/\b(eur|euro|eurozone|euro area|european union|eu)\b/.test(value)) {
    return "EUR";
  }

  if (/\b(jpy|japan|japanese yen)\b/.test(value)) {
    return "JPY";
  }

  if (/\b(aud|australia|australian dollar)\b/.test(value)) {
    return "AUD";
  }

  return null;
}

function getEventDate(event) {
  if (event.ts != null && event.ts !== "") {
    const timestamp = Number(event.ts);

    if (Number.isFinite(timestamp)) {
      // Support Unix seconds and Unix milliseconds.
      const date = new Date(
        timestamp < 100000000000
          ? timestamp * 1000
          : timestamp
      );

      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }
  }

  const value =
    event.time ??
    event.release_at_utc ??
    event.time_utc ??
    event.datetime ??
    event.date;

  if (!value) return null;

  let dateValue = value;

  // Preserve compatibility with the previous provider's
  // timezone-naive date strings.
  if (
    typeof dateValue === "string" &&
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(
      dateValue
    )
  ) {
    dateValue = `${dateValue.replace(" ", "T")}+01:00`;
  }

  const date = new Date(dateValue);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getImpact(event) {
  const value = normalize(
    event.impact ?? event.importance ?? event.volatility
  );

  if (
    ["high", "3", "red", "high impact"].includes(value)
  ) {
    return "high";
  }

  if (
    ["medium", "moderate", "2", "orange", "yellow"].includes(value)
  ) {
    return "medium";
  }

  if (
    ["low", "1", "green"].includes(value)
  ) {
    return "low";
  }

  return "unknown";
}

function getNumericValue(value) {
  if (
    value == null ||
    String(value).trim() === "" ||
    /^(n\/a|na|pending|unavailable|null|-)$/i.test(
      String(value).trim()
    )
  ) {
    return null;
  }

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/%/g, "")
    .trim();

  const match = cleaned.match(/^[+-]?\d*\.?\d+/);

  if (!match) return null;

  const number = Number(match[0]);

  return Number.isFinite(number) ? number : null;
}

function getActual(event) {
  return getNumericValue(
    event.actual ?? event.actual_value
  );
}

function getForecast(event) {
  return getNumericValue(
    event.forecast ??
    event.consensus ??
    event.forecast_value
  );
}

function getSurprise(event) {
  const actual = getActual(event);
  const forecast = getForecast(event);

  if (actual === null || forecast === null) return null;

  if (actual === forecast) return 0;

  return actual > forecast ? 1 : -1;
}

function getEventStatus(event) {
  const status = normalize(event.status);

  if (/cancel/.test(status)) return "cancelled";
  if (/mov/.test(status)) return "moved";
  if (/tentative|provisional/.test(status)) return "tentative";

  if (/release|actual|complete|published/.test(status)) {
    return "released";
  }

  // Some providers leave the status as "scheduled"
  // even after publishing actual economic figures.
  if (
    /schedul/.test(status) &&
    getActual(event) !== null
  ) {
    return "released";
  }

  if (/schedul/.test(status)) return "scheduled";

  return "unknown";
}

function getEventConfidence(event) {
  const confidence = normalize(event.confidence);

  if (
    [
      "official",
      "sources_agree",
      "single_source",
      "sources_disagree",
    ].includes(confidence)
  ) {
    return confidence;
  }

  return "unknown";
}

function interpretEvent(event) {
  const title = normalize(getTitle(event));
  const currency = getCurrency(event);
  const surprise = getSurprise(event);

  const confidence = getEventConfidence(event);

  // Conflicting sources must not create directional bias.
  if (confidence === "sources_disagree") return null;

  if (!currency || surprise === null) return null;

  let direction;

  if (
    /unemployment rate|jobless rate|jobless claims|initial jobless claims|continuing claims/.test(
      title
    )
  ) {
    direction = -surprise;
  } else if (
    /cpi|consumer price index|inflation rate|core inflation/.test(
      title
    )
  ) {
    direction = surprise;
  } else if (
    /gdp|retail sales|employment change|nonfarm payroll|non-farm payroll|pmi|purchasing managers|industrial production|average hourly earnings/.test(
      title
    )
  ) {
    direction = surprise;
  } else {
    return null;
  }

  return {
    currency,
    direction,
    title: getTitle(event),
    actual: getActual(event),
    forecast: getForecast(event),
    confidence,
    surprise:
      surprise === 0
        ? "in line with forecast"
        : surprise > 0
          ? "above forecast"
          : "below forecast",
  };
}

function getWindowMinutes(value, fallback) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? Math.max(0, parsed)
    : fallback;
}

export function assessAutomaticFundamentals(
  events = [],
  symbol = "EUR/USD",
  now = new Date()
) {
  const instrument = INSTRUMENT_CURRENCIES[symbol];

  const emptyResult = {
    source: CALENDAR_SOURCE,
    mode: "automatic",
    symbol,
    bias: "unknown",
    eventRisk: "unknown",
    calendarAvailable: false,
    calendarCoverage: "unverified",
    upcomingHighImpactEvents: [],
    recentReleasedHighImpactEvents: [],
    uncertainEvents: [],
    interpretations: [],
    currencyScores: {},
    eventCounts: {
      retrieved: 0,
      relevant: 0,
      dated: 0,
      upcoming: 0,
      recentReleased: 0,
      uncertain: 0,
    },
    complete: false,
    note:
      "Calendar data is unavailable or insufficient. Fundamental bias and event risk cannot be verified.",
    caution:
      "Missing or incomplete calendar data must not be treated as neutral or safe.",
  };

  if (!instrument) {
    return {
      ...emptyResult,
      note: `No fundamental currency mapping is configured for ${symbol}.`,
    };
  }

  if (!Array.isArray(events)) {
    return emptyResult;
  }

  const currentDate = new Date(now);
  const nowMs = currentDate.getTime();

  if (!Number.isFinite(nowMs)) {
    return {
      ...emptyResult,
      calendarAvailable: true,
      note:
        "The analysis time is invalid, so event timing cannot be verified.",
    };
  }

  const minutesInDay = 60 * 24;
  const coverageWindowMinutes = 7 * minutesInDay;

  const relevantCurrencies =
    instrument.base === "XAU"
      ? ["USD"]
      : [instrument.base, instrument.quote];

  const blockBeforeMinutes = getWindowMinutes(
    process.env.NSB_EVENT_BLOCK_BEFORE_MINUTES,
    60
  );

  const blockAfterMinutes = getWindowMinutes(
    process.env.NSB_EVENT_BLOCK_AFTER_MINUTES,
    30
  );

  const datedEvents = [];
  const interpretations = [];
  const uncertainEvents = [];

  for (const event of events) {
    const currency = getCurrency(event);

    if (!currency || !relevantCurrencies.includes(currency)) {
      continue;
    }

    const date = getEventDate(event);
    const impact = getImpact(event);
    const status = getEventStatus(event);
    const confidence = getEventConfidence(event);

    if (!date) {
      uncertainEvents.push({
        title: getTitle(event),
        currency,
        impact,
        reason: "Event date or timestamp is unavailable.",
      });

      continue;
    }

    const minutesAway =
      (date.getTime() - nowMs) / 60000;

    const item = {
      event,
      date,
      minutesAway,
      impact,
      currency,
      status,
      confidence,
    };

    datedEvents.push(item);

    if (
      status === "tentative" ||
      status === "moved" ||
      status === "unknown" ||
      confidence === "sources_disagree" ||
      impact === "unknown"
    ) {
      uncertainEvents.push({
        title: getTitle(event),
        currency,
        impact,
        status,
        confidence,
        releaseAt: date.toISOString(),
        reason:
          "Event metadata requires additional verification.",
      });
    }

    // Only recent past events with actual values are considered
    // for directional fundamental interpretation.
    if (
      minutesAway < 0 &&
      minutesAway >= -minutesInDay &&
      getActual(event) !== null
    ) {
      const result = interpretEvent(event);

      if (result) {
        interpretations.push(result);
      }
    }
  }

  const relevantUpcomingEvents = datedEvents.filter(
    (item) =>
      item.minutesAway >= 0 &&
      item.minutesAway <= coverageWindowMinutes
  );

  const isUncertainEvent = (item) =>
  item.status === "tentative" ||
  item.status === "moved" ||
  item.status === "unknown" ||
  item.confidence === "sources_disagree" ||
  item.confidence === "unknown" ||
  item.impact === "unknown";

const isInsideProtectionWindow = (item) =>
  item.minutesAway >= -blockAfterMinutes &&
  item.minutesAway <= blockBeforeMinutes;

const protectedHighImpactEvents = datedEvents.filter(
  (item) =>
    item.impact === "high" &&
    item.status !== "cancelled" &&
    isInsideProtectionWindow(item)
);

const upcomingHighImpactEvents = protectedHighImpactEvents
  .filter(
    (item) =>
      item.minutesAway >= 0 &&
      !isUncertainEvent(item)
  )
  .map((item) => ({
    title: getTitle(item.event),
    currency: item.currency,
    impact: item.impact,
    minutesAway: Math.round(item.minutesAway),
    releaseAt: item.date.toISOString(),
    status: item.status,
    confidence: item.confidence,
  }));

const recentReleasedHighImpactEvents = protectedHighImpactEvents
  .filter(
    (item) =>
      item.minutesAway < 0 &&
      !isUncertainEvent(item)
  )
  .map((item) => ({
    title: getTitle(item.event),
    currency: item.currency,
    impact: item.impact,
    minutesAgo: Math.round(Math.abs(item.minutesAway)),
    releaseAt: item.date.toISOString(),
    status: item.status,
    confidence: item.confidence,
  }));

const uncertainProtectedEvents = protectedHighImpactEvents
  .filter(isUncertainEvent)
  .map((item) => ({
    title: getTitle(item.event),
    currency: item.currency,
    impact: item.impact,
    status: item.status,
    confidence: item.confidence,
    releaseAt: item.date.toISOString(),
    minutesAway: Math.round(item.minutesAway),
    reason: "High-impact event falls within the protection window, but its metadata is uncertain.",
  }));

const allUncertainEvents = [
  ...uncertainEvents,
  ...uncertainProtectedEvents,
];

  const currencyScores = {};

  for (const currency of relevantCurrencies) {
    currencyScores[currency] = 0;
  }

  for (const item of interpretations) {
    currencyScores[item.currency] += item.direction;
  }

  const hasBaseData =
    instrument.base !== "XAU" &&
    interpretations.some(
      (item) => item.currency === instrument.base
    );

  const hasQuoteData = interpretations.some(
    (item) => item.currency === instrument.quote
  );

  let bias = "unknown";

  if (hasBaseData && hasQuoteData) {
    const difference =
      currencyScores[instrument.base] -
      currencyScores[instrument.quote];

    bias =
      difference > 0
        ? "bullish"
        : difference < 0
          ? "bearish"
          : "neutral";
  }

  // An event inside either protection window creates high risk.
  // Otherwise risk remains unknown, never automatically low.
  const eventRisk =
  protectedHighImpactEvents.length > 0
    ? "high"
    : "unknown";

  // ShowMyTrades does not guarantee complete calendar coverage.
  // Never promote this feed to verified based only on a successful fetch.
  const calendarCoverage = "unverified";
  const complete = false;

  let note;

  if (instrument.base === "XAU") {
    note =
      "USD economic releases are assessed for XAU/USD. This calendar does not establish complete gold-specific fundamental coverage.";
  } else if (eventRisk === "high") {
    note =
      `${upcomingHighImpactEvents.length} upcoming and ${recentReleasedHighImpactEvents.length} recently released high-impact event(s) fall within the configured protection windows.`;
  } else if (relevantUpcomingEvents.length === 0) {
    note =
      "No relevant dated events were found within the next seven days. Calendar coverage and event risk remain unverified.";
  } else if (bias === "unknown") {
    note =
      "Relevant events were retrieved, but usable actual-versus-forecast data for both currencies was not available. Fundamental bias remains unknown.";
  } else {
    note =
      `Interpreted ${interpretations.length} recent economic release(s) for ${symbol}. The directional estimate is simplified and calendar completeness remains unverified.`;
  }

  const caution =
    eventRisk === "high"
      ? "A relevant high-impact event is inside the configured protection window. NSB must block new setups."
      : uncertainEvents.length > 0
        ? `${uncertainEvents.length} relevant event(s) have uncertain metadata. Calendar coverage remains unverified, so NSB must block new setups.`
        : "No high-impact event was detected inside the configured protection window. This does not establish that the calendar is complete or that event risk is low.";

  return {
    source: CALENDAR_SOURCE,
    mode: "automatic",
    symbol,
    bias,
    eventRisk,
    calendarAvailable: true,
    calendarCoverage,
    upcomingHighImpactEvents,
    recentReleasedHighImpactEvents,
    uncertainEvents: allUncertainEvents,
    interpretations,
    currencyScores,
    eventCounts: {
      retrieved: events.length,
      relevant: datedEvents.length + uncertainEvents.filter(
        (item) => !item.releaseAt
      ).length,
      dated: datedEvents.length,
      upcoming: relevantUpcomingEvents.length,
      recentReleased: recentReleasedHighImpactEvents.length,
        uncertain: allUncertainEvents.length,
    },
    complete,
    note,
    caution,
    protectionWindow: {
      beforeMinutes: blockBeforeMinutes,
      afterMinutes: blockAfterMinutes,
    },
  };
}
