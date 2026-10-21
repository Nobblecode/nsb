
const BASE_URL = "https://api.twelvedata.com/time_series";

const CACHE_TTL_MS = 60_000; // Cache successful data for 60 seconds

const candleCache = new Map();
const pendingRequests = new Map();

export async function getCandles(interval = "1h", outputsize = 250) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    const error = new Error(
      "TWELVE_DATA_API_KEY is missing. Add it to .env.local and restart the dev server."
    );
    error.status = 503;
    throw error;
  }

  const cacheKey = `${interval}:${outputsize}`;
  const cached = candleCache.get(cacheKey);

  // Reuse recently fetched candles.
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.candles;
  }

  // Reuse an in-progress request instead of sending duplicates.
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    const url = new URL(BASE_URL);

    url.searchParams.set("symbol", "EUR/USD");
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
        `Twelve Data returned HTTP ${response.status}.`
      );
      error.status = response.status;
      throw error;
    }

    if (!json || json.status === "error" || !Array.isArray(json.values)) {
      const error = new Error(
        json?.message || "No candle data returned by Twelve Data."
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
        const validPrices = [
          c.open,
          c.high,
          c.low,
          c.close,
        ].every(Number.isFinite);

        const validTime =
          typeof c.time === "string" &&
          !Number.isNaN(Date.parse(c.time));

        const validOHLC =
          c.high >= Math.max(c.open, c.close, c.low) &&
          c.low <= Math.min(c.open, c.close, c.high);

        return validPrices && validTime && validOHLC;
      })
      .reverse();

    if (candles.length < 2) {
      const error = new Error(
        "Not enough valid candles were returned to display the chart."
      );
      error.status = 502;
      throw error;
    }

    // Cache only successful responses.
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
