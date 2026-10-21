
const normalize = (value) =>
  String(value ?? "").trim().toLowerCase();

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
    /\b(usd|usa|us|united states|united states of america)\b/.test(
      value
    )
  ) {
    return "USD";
  }

  if (
    /\b(eur|euro|eurozone|euro area|european union|eu)\b/.test(
      value
    )
  ) {
    return "EUR";
  }

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

  // Interpret a timezone-free date/time as Lagos local time.
  // Timestamps with Z or an explicit offset remain unchanged.
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

  if (/medium|moderate|2|orange|yellow/.test(value)) {
    return "medium";
  }

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

  // Remove common formatting characters while preserving
  // decimal points and negative signs.
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
  // Finance Calendar uses "consensus" for the market forecast.
  return getNumericValue(
    event.consensus ??
      event.forecast ??
      event.forecast_value
  );
}

function getSurprise(event) {
  const actual = getActual(event);
  const forecast = getForecast(event);

  if (actual === null || forecast === null) {
    return null;
  }

  if (actual === forecast) return 0;

  return actual > forecast ? 1 : -1;
}

function interpretEvent(event) {
  const title = normalize(getTitle(event));
  const currency = getCurrency(event);
  const surprise = getSurprise(event);

  // Do not infer a bias without both actual and forecast data.
  if (!currency || surprise === null) return null;

  let direction;

  if (
    /unemployment rate|jobless rate|jobless claims|initial jobless claims|continuing claims/.test(
      title
    )
  ) {
    // Higher unemployment or claims are generally weaker
    // for the currency.
    direction = -surprise;
  } else if (
    /cpi|consumer price index|inflation rate|core inflation/.test(
      title
    )
  ) {
    // Simplified interpretation; central-bank context matters.
    direction = surprise;
  } else if (
    /gdp|retail sales|employment change|nonfarm payroll|non-farm payroll|pmi|purchasing managers|industrial production|average hourly earnings/.test(
      title
    )
  ) {
    direction = surprise;
  } else {
    // Unsupported event types do not contribute to the bias.
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
  now = new Date()
) {
  const emptyResult = {
    source: "Finance Calendar",
    mode: "automatic",
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

  const datedEvents = [];
  const interpretations = [];

  for (const event of events) {
    const date = getEventDate(event);

    if (!date) continue;

    const minutesAway =
      (date.getTime() - nowMs) / 60000;

    const impact = getImpact(event);
    const currency = getCurrency(event);

    datedEvents.push({
      event,
      date,
      minutesAway,
      impact,
      currency,
    });

    // Interpret only supported releases from the last 24 hours.
    if (
      minutesAway < 0 &&
      minutesAway >= -minutesInDay &&
      currency
    ) {
      const result = interpretEvent(event);

      if (result) {
        interpretations.push(result);
      }
    }
  }

  const upcomingHighImpactEvents = datedEvents
    .filter(
      (item) =>
        item.minutesAway >= 0 &&
        item.minutesAway <= 60 &&
        item.impact === "high" &&
        item.currency
    )
    .map((item) => ({
      title: getTitle(item.event),
      currency: item.currency,
      impact: item.impact,
      minutesAway: Math.round(item.minutesAway),
      releaseAt: item.date.toISOString(),
    }));

  let eurScore = 0;
  let usdScore = 0;

  for (const item of interpretations) {
    if (item.currency === "EUR") {
      eurScore += item.direction;
    }

    if (item.currency === "USD") {
      usdScore += item.direction;
    }
  }

  const hasUsableSurprises = interpretations.length > 0;
  const difference = eurScore - usdScore;

  let bias = "unknown";

  if (hasUsableSurprises) {
    bias =
      difference > 0
        ? "bullish"
        : difference < 0
          ? "bearish"
          : "neutral";
  }

  // Finding events in the next seven days does NOT prove that
  // the provider returned every relevant event.
  const hasNearTermEvents = datedEvents.some(
    (item) =>
      item.minutesAway >= 0 &&
      item.minutesAway <= coverageWindowMinutes
  );

  const calendarCoverage = hasNearTermEvents
    ? "near-term-events-found-unverified"
    : "insufficient";

  
let eventRisk = "unknown";

if (upcomingHighImpactEvents.length > 0) {
  eventRisk = "high";
} else {
  // We have not independently verified calendar completeness.
  // Do not label the market as low-risk based only on returned events.
  eventRisk = "unknown";
}

const complete =
  hasUsableSurprises &&
  hasNearTermEvents &&
  eventRisk !== "unknown";


  if (upcomingHighImpactEvents.length > 0) {
    eventRisk = "high";
  } else if (hasNearTermEvents) {
    // This is a limited assessment of returned data, not proof
    // that the next hour is free of high-impact releases.
    eventRisk = "low";
  }

 

  let note;

  if (!hasNearTermEvents) {
    note =
      "No dated events were found within the next seven days. Calendar coverage and event risk remain unverified.";
  } else if (!hasUsableSurprises) {
    note =
      "Calendar events were retrieved, but no supported recent actual-versus-consensus surprises were available. Fundamental bias remains unknown.";
  } else {
    note =
      `Interpreted ${interpretations.length} recent economic release(s). ` +
      "The bias is a simplified estimate and calendar completeness has not been verified.";
  }

  return {
    source: "Finance Calendar",
    mode: "automatic",
    bias,
    eventRisk,
    calendarAvailable: true,
    calendarCoverage,
    upcomingHighImpactEvents,
    interpretations,
    complete,
    note,
    caution:
      eventRisk === "high"
        ? "A high-impact EUR/USD event appears scheduled within the next 60 minutes. NSB should block new setups."
        : eventRisk === "unknown"
          ? "Event risk cannot be verified from the available calendar data."
          : "No qualifying high-impact event was found within the next hour in the returned data. This does not guarantee low volatility or complete calendar coverage.",
  };
}
