import { describe, it, expect } from "vitest";
import { phaseIndex, briefingPhaseLabel } from "./redesign-helpers";

// Helper: construct a Pacific-time Date at a given hour on a fixed day.
function atHourPacific(hour) {
  // 2026-04-17 08:00 Pacific == 15:00 UTC (DST in effect → UTC-7).
  // We just build an ISO instant and let phaseIndex re-read the Pacific hour.
  const utcHour = hour + 7;
  return new Date(Date.UTC(2026, 3, 17, utcHour, 0, 0));
}

describe("phaseIndex", () => {
  it("returns 0 for late-night hours (before 5 AM Pacific)", () => {
    expect(phaseIndex(atHourPacific(2))).toBe(0);
    expect(phaseIndex(atHourPacific(4))).toBe(0);
  });
  it("returns 1 for morning (5 AM – 11:59 AM Pacific)", () => {
    expect(phaseIndex(atHourPacific(5))).toBe(1);
    expect(phaseIndex(atHourPacific(11))).toBe(1);
  });
  it("returns 2 for afternoon (noon – 4:59 PM Pacific)", () => {
    expect(phaseIndex(atHourPacific(12))).toBe(2);
    expect(phaseIndex(atHourPacific(16))).toBe(2);
  });
  it("returns 3 for evening (5 PM – 8:59 PM Pacific)", () => {
    expect(phaseIndex(atHourPacific(17))).toBe(3);
    expect(phaseIndex(atHourPacific(20))).toBe(3);
  });
  it("returns 4 for night (9 PM onward Pacific)", () => {
    expect(phaseIndex(atHourPacific(21))).toBe(4);
    expect(phaseIndex(atHourPacific(23))).toBe(4);
  });
});

describe("briefingPhaseLabel", () => {
  it("returns fallback when ts is nullish", () => {
    expect(briefingPhaseLabel(null)).toBe("Since last briefing");
    expect(briefingPhaseLabel(undefined)).toBe("Since last briefing");
  });
  it("morning briefing → 'Since this morning's briefing'", () => {
    expect(briefingPhaseLabel(atHourPacific(8).getTime())).toBe("Since this morning's briefing");
  });
  it("afternoon briefing → 'Since this afternoon's briefing'", () => {
    expect(briefingPhaseLabel(atHourPacific(14).getTime())).toBe("Since this afternoon's briefing");
  });
  it("evening briefing → 'Since this evening's briefing'", () => {
    expect(briefingPhaseLabel(atHourPacific(19).getTime())).toBe("Since this evening's briefing");
  });
  it("late-night briefing → 'Since last night's briefing'", () => {
    expect(briefingPhaseLabel(atHourPacific(3).getTime())).toBe("Since last night's briefing");
  });
  it("night briefing → 'Since tonight's briefing'", () => {
    expect(briefingPhaseLabel(atHourPacific(22).getTime())).toBe("Since tonight's briefing");
  });
});
