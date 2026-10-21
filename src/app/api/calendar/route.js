
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const incomingUrl = new URL(request.url);
    const impact = incomingUrl.searchParams.get("impact") || "all";

    const url = new URL(
      "https://www.financecalendar.com/wp-json/fc/v1/calendar"
    );

    url.searchParams.set("country", "US,EU");
    url.searchParams.set("tz", "Africa/Lagos");
    url.searchParams.set("limit", "100");

    if (["high", "medium", "low"].includes(impact)) {
      url.searchParams.set("impact", impact);
    }

    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(
        `Calendar provider returned HTTP ${response.status}`
      );
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.events)) {
      throw new Error(
        "Calendar provider returned an unexpected response format"
      );
    }

    // Temporary debugging: inspect the first event.
    console.log(
      "Finance Calendar sample event:",
      JSON.stringify(data.events[0] ?? null, null, 2)
    );

    return NextResponse.json({
      success: true,
      source: "Finance Calendar",
      fetchedAt: new Date().toISOString(),
      eventCount: data.events.length,
      events: data.events,
      attribution: data.attribution || {
        source: "financecalendar.com",
        url: "https://www.financecalendar.com/",
      },
      coverageVerified: false,
      note:
        "Events were retrieved successfully, but calendar completeness has not been verified.",
    });
  } catch (error) {
    console.error("Economic calendar error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error.name === "TimeoutError"
            ? "The economic calendar request timed out. Try again."
            : error.message ||
              "Unable to retrieve economic calendar data.",
      },
      { status: 502 }
    );
  }
}
