// Scenario overlays for dev mock briefings.
// Each scenario is a small function that patches the base fixture
// to test a specific feature without modifying dev-fixture.js.
//
// Usage: ?mock=1&scenario=urgent-flags,noise-preview,bill-match

import urgentFlags from "./urgent-flags.js";
import noisePreview from "./noise-preview.js";
import bills from "./bills.js";
import billMatch from "./bill-match.js";
import nextWeek from "./next-week.js";
import tomorrowEvents from "./tomorrow-events.js";
import noBills from "./no-bills.js";
import slotInsights from "./slot-insights.js";
import recurringTombstone from "./recurring-tombstone.js";
import calendarCrud from "./calendar-crud.js";

const scenarios = {
  "urgent-flags": urgentFlags,
  "noise-preview": noisePreview,
  "bills": bills,
  "bill-match": billMatch,
  "next-week": nextWeek,
  "tomorrow-events": tomorrowEvents,
  "no-bills": noBills,
  "slot-insights": slotInsights,
  "recurring-tombstone": recurringTombstone,
  "calendar-crud": calendarCrud,
};

// Returns list of available scenario names + descriptions
export function listScenarios() {
  return Object.entries(scenarios).map(([key, fn]) => ({
    key,
    name: fn.name || key,
    description: fn.description || "",
    category: fn.category || "Other",
  }));
}

// Apply selected scenarios to a base briefing (mutates in place)
export function applyScenarios(briefing, scenarioKeys) {
  if (!scenarioKeys?.length) return briefing;
  for (const key of scenarioKeys) {
    const fn = scenarios[key];
    if (fn) fn(briefing);
  }
  return briefing;
}
