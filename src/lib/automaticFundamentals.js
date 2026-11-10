
const normalize = (value) =>
  String(value ?? "").trim().toLowerCase();

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

  if (
    /\b(usd|usa|us|united states|united states of america)\b/.test(value)
  ) return "USD";

  if (
    /\b(eur|euro|eurozone|euro area|european union|eu)\b/.test(value)
  ) return "EUR";

  if (
    /\b(jpy|japan|japanese yen)\b/.test(value)
  ) return "JPY";

  if (
    /\b(aud|australia|australian dollar)\b/.test(value)
  ) return "AUD";

  return null;
}

function getEventDate(event) {
  const value =
    event.release_at_utc ??
    event.time_utc ??
    event.datetime ??
    event.date;

  if (!value) return null;

  let dateValue = value;

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

  if (/high|3|red/.test(value)) return "high";
  if (/medium|moderate|2|orange|yellow/.test(value)) return "medium";
  if (/low|1|green/.test(value)) return "low";

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
    event.consensus ??
    event.forecast ??
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

function interpretEvent(event) {
  const title = normalize(getTitle(event));
  const currency = getCurrency(event);
  const surprise = getSurprise(event);

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
    surprise:
      surprise === 0
        ? "in line with forecast"
        : surprise > 0
          ? "above forecast"
          : "below forecast",
  };
}

export function assessAutomaticFundamentals(
  events = [],
  symbol = "EUR/USD",
  now = new Date()
) {
  const instrument = INSTRUMENT_CURRENCIES[symbol];

  const emptyResult = {
    source: "Finance Calendar",
    mode: "automatic",
    symbol,
    bias: "unknown",
    eventRisk: "unknown",
    calendarAvailable: false,
    calendarCoverage: "unverified",
    upcomingHighImpactEvents: [],
    interpretations: [],
    complete: false,
    note:
      "No usable calendar events were returned. Fundamental bias and event risk cannot be verified.",
    caution:
      "Missing or incomplete calendar data must not be treated as neutral or safe.",
  };

  if (!instrument) {
    return {
      ...emptyResult,
      note: `No fundamental currency mapping is configured for ${symbol}.`,
    };
  }

  if (!Array.isArray(events) || events.length === 0) {
    return emptyResult;
  }

  const nowMs = now.getTime();

  if (!Number.isFinite(nowMs)) {
    return {
      ...emptyResult,
      calendarAvailable: true,
      note: "The analysis time is invalid, so event timing cannot be verified.",
    };
  }

  const minutesInDay = 60 * 24;
  const coverageWindowMinutes = 7 * minutesInDay;

  const relevantCurrencies =
    instrument.base === "XAU"
      ? ["USD"]
      : [instrument.base, instrument.quote];

  const datedEvents = [];
  const interpretations = [];

  for (const event of events) {
    const date = getEventDate(event);

    if (!date) continue;

    const minutesAway =
      (date.getTime() - nowMs) / 60000;

    const impact = getImpact(event);
    const currency = getCurrency(event);

    if (!currency || !relevantCurrencies.includes(currency)) {
      continue;
    }

    datedEvents.push({
      event,
      date,
      minutesAway,
      impact,
      currency,
    });

    if (
      minutesAway < 0 &&
      minutesAway >= -minutesInDay
    ) {
      const result = interpretEvent(event);

      if (result) interpretations.push(result);
    }
  }

  const blockBeforeMinutes = Math.max(
    0,
    Number(
      process.env.NSB_EVENT_BLOCK_BEFORE_MINUTES ?? 60
    ) || 0
  );

  const blockAfterMinutes = Math.max(
    0,
    Number(
      process.env.NSB_EVENT_BLOCK_AFTER_MINUTES ?? 30
    ) || 0
  );

  const upcomingHighImpactEvents = datedEvents
    .filter(
      (item) =>
        item.minutesAway >= -blockAfterMinutes &&
        item.minutesAway <= blockBeforeMinutes &&
        item.impact === "high"
    )
    .map((item) => ({
      title: getTitle(item.event),
      currency: item.currency,
      impact: item.impact,
      minutesAway: Math.round(item.minutesAway),
      releaseAt: item.date.toISOString(),
    }));

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

  // Both sides must have usable data before assigning
  // a directional currency-pair bias.
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

  const hasNearTermEvents = datedEvents.some(
    (item) =>
      item.minutesAway >= 0 &&
      item.minutesAway <= coverageWindowMinutes
  );

  const calendarCoverage = hasNearTermEvents
    ? "near-term-events-found-unverified"
    : "insufficient";

  const eventRisk =
    upcomingHighImpactEvents.length > 0
      ? "high"
      : "unknown";

  // Retrieved events do not prove complete provider coverage.
  // XAU also requires a separate gold-specific assessment.
  const complete = false;

  let note;

  if (instrument.base === "XAU") {
    note =
      "USD economic releases can be assessed, but this calendar does not provide a verified gold-specific fundamental assessment.";
  } else if (!hasNearTermEvents) {
    note =
      "No relevant dated events were found within the next seven days. Calendar coverage and event risk remain unverified.";
  } else if (bias === "unknown") {
    note =
      "Relevant calendar events were retrieved, but usable actual-versus-consensus data for both currencies was not available. Fundamental bias remains unknown.";
  } else {
    note =
      `Interpreted ${interpretations.length} recent economic release(s) for ${symbol}. The directional estimate is simplified and calendar completeness remains unverified.`;
  }

  return {
    source: "Finance Calendar",
    mode: "automatic",
    symbol,
    bias,
    eventRisk,
    calendarAvailable: true,
    calendarCoverage,
    upcomingHighImpactEvents,
    interpretations,
    complete,
    note,
    currencyScores,
    caution:
      eventRisk === "high"
        ? `A relevant high-impact event is inside the configured event window (${blockBeforeMinutes} minutes before / ${blockAfterMinutes} minutes after). NSB should block new setups.`
        : "Calendar coverage is unverified. The absence of a detected high-impact event does not establish that the market is low-risk.",
  };
}
