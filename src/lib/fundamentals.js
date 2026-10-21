
import {
  assessAutomaticFundamentals,
} from "@/lib/automaticFundamentals";

/**
 * Legacy manual assessment.
 * Kept for manual override and backward compatibility.
 */
export function assessFundamentals(input = {}) {
  const bias = ["bullish", "bearish", "neutral"].includes(input.bias)
    ? input.bias
    : "neutral";

  const eventRisk = ["low", "medium", "high", "unknown"].includes(
    input.eventRisk
  )
    ? input.eventRisk
    : "unknown";

  const note = String(input.note || "").slice(0, 500);

  return {
    source: "Manual user input — not a live economic feed",
    mode: "manual",
    bias,
    eventRisk,
    note,
    complete: eventRisk !== "unknown" && Boolean(note.trim()),
    caution:
      eventRisk === "high"
        ? "High-impact event risk selected. Avoid entering immediately before major releases unless the strategy explicitly accounts for event volatility."
        : null,
  };
}

/**
 * Automatic assessment from economic-calendar events.
 */
export function assessFundamentalsAutomatically(events = []) {
  if (!Array.isArray(events) || events.length === 0) {
    return {
      source: "Finance Calendar",
      mode: "automatic",
      bias: "neutral",
      eventRisk: "unknown",
      note: "No economic-calendar events were available. Fundamental assessment is incomplete.",
      complete: false,
      upcomingHighImpactEvents: [],
      interpretations: [],
      caution: "Do not treat missing calendar data as a neutral fundamental outlook.",
    };
  }

  return assessAutomaticFundamentals(events);
}
