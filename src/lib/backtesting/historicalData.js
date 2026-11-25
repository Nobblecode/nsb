
const BASE_URL = "https://api.twelvedata.com/time_series";

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const CHUNK_MS = 180 * DAY_MS;
const WARMUP_DAYS = 120;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

const INTERVALS = {
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
};

// In-memory historical data cache.
const historicalChunkCache = new Map();

/**
 * Parse Twelve Data timestamps as UTC.
 * Example: 2026-08-29 00:00:00
 */
function parseUtcTime(time) {
  if (typeof time !== "string") {
    return NaN;
  }

  return Date.parse(`${time.replace(" ", "T")}Z`);
}

/**
 * Deriv EUR/USD trading schedule.
 *
 * All times are UTC/GMT.
 *
 * Sunday:          Opens at 22:10
 * Monday-Thursday: Closed 21:59-22:10
 * Friday:          Closes at 21:55
 * Saturday:        Closed
 */
function isDerivEurUsdMinuteOpen(timestamp) {
  const date = new Date(timestamp);

  const day = date.getUTCDay();

  const minuteOfDay =
    date.getUTCHours() * 60 +
    date.getUTCMinutes();

  // Sunday: opens at 22:10 UTC.
  if (day === 0) {
    return minuteOfDay >= 22 * 60 + 10;
  }

  // Monday to Thursday:
  // Daily break from 21:59 to 22:10 UTC.
  if (day >= 1 && day <= 4) {
    return (
      minuteOfDay < 21 * 60 + 59 ||
      minuteOfDay >= 22 * 60 + 10
    );
  }

  // Friday: closes at 21:55 UTC.
  if (day === 5) {
    return minuteOfDay < 21 * 60 + 55;
  }

  // Saturday: closed.
  return false;
}

/**
 * A candle is accepted only when every minute
 * inside that candle falls within trading hours.
 *
 * This is a conservative full-candle filter.
 */
function isDerivEurUsdCandleTradable(timestamp, interval) {
  const durationMs = INTERVALS[interval];

  if (!durationMs || !Number.isFinite(timestamp)) {
    return false;
  }

  const candleEnd = timestamp + durationMs;

  for (
    let minute = timestamp;
    minute < candleEnd;
    minute += MINUTE_MS
  ) {
    if (!isDerivEurUsdMinuteOpen(minute)) {
      return false;
    }
  }

  return true;
}

/**
 * Existing weekly-session filter for instruments
 * other than EUR/USD.
 *
 * This is not a confirmed individual Deriv schedule
 * for those other instruments.
 */
function isForexWeeklySessionOpen(timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));

  const weekday = parts.find(
    (part) => part.type === "weekday"
  )?.value;

  const hour = Number(
    parts.find((part) => part.type === "hour")?.value
  );

  // Closed all Saturday.
  if (weekday === "Sat") {
    return false;
  }

  // Sunday opens at 5 PM New York time.
  if (weekday === "Sun") {
    return hour >= 17;
  }

  // Friday closes at 5 PM New York time.
  if (weekday === "Fri") {
    return hour < 17;
  }

  return true;
}

function formatApiDate(timestamp) {
  return new Date(timestamp)
    .toISOString()
    .replace("T", " ")
    .slice(0, 19);
}

function validateDate(value, name) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    throw new Error(`${name} must use YYYY-MM-DD format.`);
  }

  const timestamp = Date.parse(`${value}T00:00:00Z`);

  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Invalid ${name}.`);
  }

  return timestamp;
}

function normalizeCandle(candle) {
  const result = {
    time: candle.datetime,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),

    volume:
      candle.volume == null || candle.volume === ""
        ? null
        : Number(candle.volume),
  };

  const prices = [
    result.open,
    result.high,
    result.low,
    result.close,
  ];

  const validPrices = prices.every(Number.isFinite);

  const validTime =
    typeof result.time === "string" &&
    Number.isFinite(parseUtcTime(result.time));

  const validOHLC =
    validPrices &&
    result.high >= Math.max(
      result.open,
      result.close,
      result.low
    ) &&
    result.low <= Math.min(
      result.open,
      result.close,
      result.high
    );

  if (!validTime || !validOHLC) {
    return null;
  }

  return result;
}

function getCachedChunk(key) {
  const cached = historicalChunkCache.get(key);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt > CACHE_TTL_MS) {
    historicalChunkCache.delete(key);
    return null;
  }

  // Refresh insertion order for simple LRU behaviour.
  historicalChunkCache.delete(key);
  historicalChunkCache.set(key, cached);

  return cached.candles;
}

function saveCachedChunk(key, candles) {
  historicalChunkCache.delete(key);

  historicalChunkCache.set(key, {
    candles,
    createdAt: Date.now(),
  });

  while (historicalChunkCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = historicalChunkCache.keys().next().value;
    historicalChunkCache.delete(oldestKey);
  }
}

/**
 * Fetch one historical data chunk from Twelve Data.
 */
async function fetchHistoricalChunk({
  symbol,
  interval,
  start,
  end,
  apiKey,
}) {
  const cacheKey = [
    symbol,
    interval,
    start,
    end,
  ].join("|");

  const cached = getCachedChunk(cacheKey);

  if (cached) {
    return {
      candles: cached,
      cacheHit: true,
      requestCount: 0,
    };
  }

  const url = new URL(BASE_URL);

  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("format", "JSON");
  url.searchParams.set("order", "ASC");
  url.searchParams.set("start_date", formatApiDate(start));
  url.searchParams.set("end_date", formatApiDate(end));
  url.searchParams.set("apikey", apiKey);

  let response;
  let data;

  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });

    data = await response.json();
  } catch (error) {
    const requestError = new Error(
      `Historical data request failed: ${error.message}`
    );

    requestError.status = 502;
    throw requestError;
  }

  // Handle Twelve Data rate limits.
  if (
    response.status === 429 ||
    Number(data?.code) === 429
  ) {
    const error = new Error(
      "Twelve Data rate limit reached. Wait for your API credit allowance to reset before retrying."
    );

    error.status = 429;
    throw error;
  }

  // Validate the API response before accessing data.values.
  if (
    !response.ok ||
    data?.status === "error" ||
    !Array.isArray(data?.values)
  ) {
    const error = new Error(
      data?.message ||
      `Twelve Data historical request failed for ${symbol} ${interval}.`
    );

    error.status =
      Number(data?.code) || response.status || 502;

    throw error;
  }

  const candles = data.values
    .map(normalizeCandle)
    .filter(Boolean);

  saveCachedChunk(cacheKey, candles);

  return {
    candles,
    cacheHit: false,
    requestCount: 1,
  };
}

/**
 * Retrieve historical candles for backtesting.
 */
export async function getHistoricalCandles({
  symbol,
  interval,
  startDate,
  endDate,
}) {
  // Validate interval.
  if (!INTERVALS[interval]) {
    throw new Error(
      "Only 1h and 4h historical intervals are supported."
    );
  }

  // Validate API key.
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    const error = new Error(
      "TWELVE_DATA_API_KEY is missing."
    );

    error.status = 503;
    throw error;
  }

  // Validate selected dates.
  const requestedStart = validateDate(
    startDate,
    "Start date"
  );

  const requestedEnd = validateDate(
    endDate,
    "End date"
  );

  const endExclusive = requestedEnd + DAY_MS;

  if (requestedStart >= endExclusive) {
    throw new Error(
      "Start date must be earlier than end date."
    );
  }

  const intervalMs = INTERVALS[interval];

  // Extra history is used for indicator warm-up.
  // It must not generate trades before the selected start date.
  const fetchStart =
    requestedStart - WARMUP_DAYS * DAY_MS;

  const fetchEnd = endExclusive - 1000;

  const candleMap = new Map();

  let cursor = fetchStart;
  let requestCount = 0;
  let cacheHits = 0;
  let chunkCount = 0;

  // Fetch historical data in chunks.
  while (cursor <= fetchEnd) {
    const chunkEnd = Math.min(
      cursor + CHUNK_MS - 1000,
      fetchEnd
    );

    const result = await fetchHistoricalChunk({
      symbol,
      interval,
      start: cursor,
      end: chunkEnd,
      apiKey,
    });

    requestCount += result.requestCount;

    if (result.cacheHit) {
      cacheHits++;
    }

    chunkCount++;

    for (const candle of result.candles) {
      const candleStart = parseUtcTime(candle.time);
      const candleEnd = candleStart + intervalMs;

      // Keep candles inside the requested and warm-up period.
      // Exclude incomplete candles and candles beyond the end date.
      if (
        candleStart < fetchStart ||
        candleEnd > endExclusive ||
        candleEnd > Date.now()
      ) {
        continue;
      }

      candleMap.set(candleStart, candle);
    }

    cursor = chunkEnd + 1000;
  }

  // Normalize the instrument symbol.
  const normalizedSymbol = String(symbol)
    .replace(/[^A-Z]/gi, "")
    .toUpperCase();

  // Sort candles and apply the appropriate session filter.
  const candles = [...candleMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([timestamp]) => {
      if (normalizedSymbol === "EURUSD") {
        return isDerivEurUsdCandleTradable(
          timestamp,
          interval
        );
      }

      // Keep the previous weekly filter for other instruments.
      // Their individual Deriv trading schedules still need verification.
      return isForexWeeklySessionOpen(timestamp);
    })
    .map(([, candle]) => candle);

  // Diagnostic information.
  console.log("FINAL HISTORICAL DATA CHECK:", {
    symbol,
    interval,
    totalCandles: candles.length,
    requestCount,
    cacheHits,
    chunkCount,
  });

  // Ensure enough historical candles remain after filtering.
  if (candles.length < 250) {
    const error = new Error(
      `Only ${candles.length} completed ${interval} candles were retrieved for ${symbol} after session filtering. At least 250 are required.`
    );

    error.status = 502;
    throw error;
  }

  return {
    candles,

    metadata: {
      symbol,
      interval,
      startDate,
      endDate,

      dataStartDate: new Date(fetchStart)
        .toISOString()
        .slice(0, 10),

      warmupDays: WARMUP_DAYS,

      candleCount: candles.length,
      requestCount,
      cacheHits,
      chunkCount,

      source: "Twelve Data",
    },
  };
}
