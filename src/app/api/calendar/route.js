
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CALENDAR_URL =
  "https://showmytrades.com/api/public/calendar/v1";

const CALENDAR_CURRENCIES = "USD,EUR,JPY,AUD";

function normalizeImpact(value) {
  return String(value ?? "").trim().toLowerCase();
}

export async function GET(request) {
  const requestId = crypto.randomUUID();

  try {
    const incomingUrl = new URL(request.url);

    const requestedImpact = normalizeImpact(
      incomingUrl.searchParams.get("impact") || "all"
    );

    const impact = [
      "all",
      "high",
      "medium",
      "low",
    ].includes(requestedImpact)
      ? requestedImpact
      : "all";

    const url = new URL(CALENDAR_URL);

    url.searchParams.set(
      "currency",
      CALENDAR_CURRENCIES
    );

    url.searchParams.set("impact", "all");
    url.searchParams.set("days", "7");
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error("Calendar provider HTTP error:", {
        requestId,
        status: response.status,
      });

      return NextResponse.json(
        {
          success: false,
          requestId,
          error: `ShowMyTrades calendar returned HTTP ${response.status}. Please try again later.`,
          providerStatus: response.status,
        },
        { status: 502 }
      );
    }

    const data = await response.json();


    if (
      !data ||
      !Array.isArray(data.events)
    ) {
      console.error("Unexpected calendar response:", {
        requestId,
        responseKeys:
          data && typeof data === "object"
            ? Object.keys(data)
            : [],
      });

      return NextResponse.json(
        {
          success: false,
          requestId,
          error:
            "ShowMyTrades returned an unexpected calendar response.",
        },
        { status: 502 }
      );
    }

    // Apply the selected impact filter locally.
    const events =
      impact === "all"
        ? data.events
        : data.events.filter(
            (event) =>
              normalizeImpact(event.impact) === impact
          );

    const fetchedAt = new Date().toISOString();

    console.info("Calendar request completed:", {
      requestId,
      totalEvents: data.events.length,
      filteredEvents: events.length,
      impact,
      fetchedAt,
      providerGeneratedAt: data.generated_at || null,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        source: "ShowMyTrades",
        fetchedAt,
        serverTime:
  data.serverTime ??
  data.server_time ??
  null,

serverTimeISO:
  data.serverTimeISO ??
  data.server_time_iso ??
  null,
        eventCount: events.length,
        totalEventCount: data.events.length,
        impactFilter: impact,
        events,
        attribution: data.attribution || {
          source: "ShowMyTrades",
          url: "https://showmytrades.com/tools/economic-calendar",
        },
        coverageVerified: false,
        providerDataUpdatedAt:
  data.generatedAt ??
  data.generated_at ??
  data.fetchedAt ??
  null,
        note:
          "Calendar data is supplied by ShowMyTrades. Fetch time indicates when NSB received the response. Provider data is cached and calendar completeness is not guaranteed.",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    const timedOut =
      error?.name === "TimeoutError" ||
      error?.name === "AbortError";

    console.error("Economic calendar request failed:", {
      requestId,
      name: error?.name,
      message: error?.message,
    });

    return NextResponse.json(
      {
        success: false,
        requestId,
        error: timedOut
          ? "The economic calendar request timed out. Check your connection and try again."
          : "The economic calendar could not be reached. Please try again later.",
      },
      { status: 502 }
    );
  }
}
