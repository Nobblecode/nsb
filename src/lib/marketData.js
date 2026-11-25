
const BASE_URL = "https://api.twelvedata.com/time_series";

const CACHE_TTL_MS = 60_000;

// Supported instruments and their Twelve Data symbols.
export const INSTRUMENTS = {
  "EUR/USD": {
    symbol: "EUR/USD",
    name: "Euro / US Dollar",
    type: "forex",
    pricePrecision: 5,
    pipSize: 0.0001,
  },
  "XAU/USD": {
    symbol: "XAU/USD",
    name: "Gold / US Dollar",
    type: "commodity",
    pricePrecision: 2,
    pipSize: 0.01,
  },
  "USD/JPY": {
    symbol: "USD/JPY",
    name: "US Dollar / Japanese Yen",
    type: "forex",
    pricePrecision: 3,
    pipSize: 0.01,
  },
  "AUD/JPY": {
    symbol: "AUD/JPY",
    name: "Australian Dollar / Japanese Yen",
    type: "forex",
    pricePrecision: 3,
    pipSize: 0.01,
  },
};

const candleCache = new Map();
const pendingRequests = new Map();

function getIntervalMs(interval) {
  const match = /^(\d+)(min|h|day|week|month)$/.exec(interval);

  if (!match) {
    throw new Error(`Unsupported candle interval: ${interval}`);
  }

  const amount = Number(match[1]);

  const unitMs = {
    min: 60_000,
    h: 60 * 60_000,
    day: 24 * 60 * 60_000,
    week: 7 * 24 * 60 * 60_000,
    month: null,
  };

  if (match[2] === "month") {
    throw new Error(
      "Monthly candles need calendar-month boundary handling."
    );
  }

  return amount * unitMs[match[2]];
}

function parseUtcTime(time) {
  return Date.parse(`${time.replace(" ", "T")}Z`);
}

export async function getCandles(
  interval = "1h",
  outputsize = 250,
  instrument = "EUR/USD"
) {
  // Also accept the instrument as the second argument for convenience.
  if (typeof outputsize === "string") {
    const suppliedInstrument = outputsize;
    outputsize = typeof instrument === "number" ? instrument : 250;
    instrument = suppliedInstrument;
  }

  const selectedInstrument = INSTRUMENTS[instrument];

  if (!selectedInstrument) {
    const error = new Error(
      `Unsupported instrument: ${instrument}. Supported instruments: ${Object.keys(INSTRUMENTS).join(", ")}`
    );
    error.status = 400;
    throw error;
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    const error = new Error(
      "TWELVE_DATA_API_KEY is missing. Add it to .env.local and restart the dev server."
    );
    error.status = 503;
    throw error;
  }

  const intervalMs = getIntervalMs(interval);

  // Include instrument in the cache key to prevent cross-pair data mixing.
  const cacheKey = `${selectedInstrument.symbol}:${interval}:${outputsize}`;

  const cached = candleCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.candles;
  }

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    const url = new URL(BASE_URL);

    url.searchParams.set("symbol", selectedInstrument.symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("outputsize", String(outputsize));
    url.searchParams.set("timezone", "UTC");
    url.searchParams.set("format", "JSON");
    url.searchParams.set("apikey", apiKey);

    const response = await fetch(url, {
      cache: "no-store",
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      const error = new Error(
        `Twelve Data returned HTTP ${response.status} for ${selectedInstrument.symbol}.`
      );
      error.status = response.status;
      throw error;
    }

    if (!json || json.status === "error" || !Array.isArray(json.values)) {
      const error = new Error(
        json?.message ||
        `No candle data returned by Twelve Data for ${selectedInstrument.symbol}.`
      );

      error.status = Number(json?.code) || 502;
      throw error;
    }

    const candles = json.values
      .map((c) => ({
        time: c.datetime,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume:
          c.volume == null || c.volume === ""
            ? null
            : Number(c.volume),
      }))
      .filter((c) => {
        const prices = [c.open, c.high, c.low, c.close];

        const validPrices = prices.every(Number.isFinite);

        const validTime =
          typeof c.time === "string" &&
          Number.isFinite(parseUtcTime(c.time));

        const validOHLC =
          validPrices &&
          c.high >= Math.max(c.open, c.close, c.low) &&
          c.low <= Math.min(c.open, c.close, c.high);

        if (!validTime || !validOHLC) {
          return false;
        }

        // Keep only candles whose entire interval has elapsed.
        const candleStart = parseUtcTime(c.time);
        const candleEnd = candleStart + intervalMs;

        return candleEnd <= Date.now();
      })
      .reverse();

    // Ensure timestamps are strictly increasing.
    for (let i = 1; i < candles.length; i++) {
      if (
        parseUtcTime(candles[i].time) <=
        parseUtcTime(candles[i - 1].time)
      ) {
        throw new Error(
          `Candle timestamps are duplicated or not chronological for ${selectedInstrument.symbol}.`
        );
      }
    }

    if (candles.length < 60) {
      const error = new Error(
        `Only ${candles.length} completed, valid candles were returned for ${selectedInstrument.symbol} ${interval}; at least 60 are required.`
      );
      error.status = 502;
      throw error;
    }

    console.log("Completed candle data:", {
      instrument: selectedInstrument.symbol,
      interval,
      candleCount: candles.length,
      latestCompletedCandle: candles.at(-1),
    });

    candleCache.set(cacheKey, {
      timestamp: Date.now(), 
      candles,
    });

    return candles;
  })();

  pendingRequests.set(cacheKey, requestPromise);

  try {
    return await requestPromise;
  } finally {
    pendingRequests.delete(cacheKey);
  }
}
