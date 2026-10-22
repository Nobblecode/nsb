
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CALENDAR_URL =
  "https://www.financecalendar.com/wp-json/fc/v1/calendar";

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

    const impact = ["all", "high", "medium", "low"].includes(
      requestedImpact
    )
      ? requestedImpact
      : "all";

    const url = new URL(CALENDAR_URL);
    url.searchParams.set("country", "US,EU");
    url.searchParams.set("tz", "Africa/Lagos");
    url.searchParams.set("limit", "100");

    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
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
          error: `Finance Calendar returned HTTP ${response.status}. Please try again later.`,
          providerStatus: response.status,
        },
        { status: 502 }
      );
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.events)) {
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
            "Finance Calendar returned an unexpected response. Please try again later.",
        },
        { status: 502 }
      );
    }

    // Apply the selected filter locally so it does not depend on
    // whether the upstream provider supports the impact parameter.
    const events =
      impact === "all"
        ? data.events
        : data.events.filter(
            (event) => normalizeImpact(event.impact) === impact
          );

    const fetchedAt = new Date().toISOString();

    console.info("Calendar request completed:", {
      requestId,
      totalEvents: data.events.length,
      filteredEvents: events.length,
      impact,
      fetchedAt,
    });

    return NextResponse.json(
      {
        success: true,
        requestId,
        source: "Finance Calendar",
        fetchedAt,
        eventCount: events.length,
        totalEventCount: data.events.length,
        impactFilter: impact,
        events,
        attribution: data.attribution || {
          source: "financecalendar.com",
          url: "https://www.financecalendar.com/",
        },
        coverageVerified: false,
        providerDataUpdatedAt:
          data.updated_at ||
          data.last_updated ||
          data.updatedAt ||
          null,
        note:
          "Fetch time indicates when NSB received this response. The provider's underlying data-update time may be unavailable, and calendar completeness has not been verified.",
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
