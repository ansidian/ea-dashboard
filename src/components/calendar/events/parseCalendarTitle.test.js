import { describe, expect, it } from "vitest";
import { parseCalendarTitle } from "./parseCalendarTitle";

describe("parseCalendarTitle", () => {
  it("consumes date/time tokens from the title and builds a schedule preview", () => {
    const parsed = parseCalendarTitle("Dinner on Tue at 5pm", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-20",
    });

    expect(parsed.cleanTitle).toBe("Dinner");
    expect(parsed.locationQuery).toBe("");
    expect(parsed.parsedDateTime).toMatchObject({
      startDate: "2026-04-21",
      endDate: "2026-04-21",
      startTime: "17:00",
      endTime: "17:30",
    });
    expect(parsed.preview).toMatch(/Tue, Apr 21, 2026/i);
  });

  it("uses the selected day as the fallback date for bare times", () => {
    const parsed = parseCalendarTitle("Dinner 5pm", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-29",
    });

    expect(parsed.cleanTitle).toBe("Dinner");
    expect(parsed.parsedDateTime).toMatchObject({
      startDate: "2026-04-29",
      endDate: "2026-04-29",
      startTime: "17:00",
      endTime: "17:30",
    });
  });

  it("extracts a trailing location query after removing time tokens", () => {
    const parsed = parseCalendarTitle("Dinner @McDonald's tomorrow 5pm", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-20",
    });

    expect(parsed.cleanTitle).toBe("Dinner");
    expect(parsed.locationQuery).toBe("McDonald's");
    expect(parsed.parsedDateTime).toMatchObject({
      startDate: "2026-04-21",
      startTime: "17:00",
    });
  });

  it("does not let @location consume trailing time tokens", () => {
    const parsed = parseCalendarTitle("Dinner @McDonald's at 5pm", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-20",
    });

    expect(parsed.cleanTitle).toBe("Dinner");
    expect(parsed.locationQuery).toBe("McDonald's");
    expect(parsed.parsedDateTime).toMatchObject({
      startDate: "2026-04-20",
      endDate: "2026-04-20",
      startTime: "17:00",
      endTime: "17:30",
    });
    expect(parsed.titleAfterLocationCommit).toBe("Dinner at 5pm ");
  });

  it("does not treat plain 'at' as a location producer", () => {
    const parsed = parseCalendarTitle("Dinner at McDonald's tomorrow 5pm", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-20",
    });

    expect(parsed.locationQuery).toBe("");
  });

  it("extracts a trailing calendar source query", () => {
    const parsed = parseCalendarTitle("Dinner tomorrow 5pm cal personal", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-20",
    });

    expect(parsed.cleanTitle).toBe("Dinner");
    expect(parsed.sourceQuery).toBe("personal");
    expect(parsed.titleAfterSourceCommit).toBe("Dinner tomorrow 5pm ");
  });

  it("does not let @location consume trailing source tokens", () => {
    const parsed = parseCalendarTitle("Dinner 5pm @McDonald's cal school", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-20",
    });

    expect(parsed.cleanTitle).toBe("Dinner");
    expect(parsed.locationQuery).toBe("McDonald's");
    expect(parsed.sourceQuery).toBe("school");
    expect(parsed.parsedDateTime).toMatchObject({
      startTime: "17:00",
      endTime: "17:30",
    });
  });

  it("does not let cal consume trailing time tokens", () => {
    const parsed = parseCalendarTitle("Dinner cal school at 2pm", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-20",
    });

    expect(parsed.cleanTitle).toBe("Dinner");
    expect(parsed.sourceQuery).toBe("school");
    expect(parsed.parsedDateTime).toMatchObject({
      startDate: "2026-04-20",
      endDate: "2026-04-20",
      startTime: "14:00",
      endTime: "14:30",
    });
    expect(parsed.titleAfterSourceCommit).toBe("Dinner at 2pm ");
  });

  it("does not let cal with no source name consume the following temporal token", () => {
    const parsed = parseCalendarTitle("Dinner cal at 2pm", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-20",
    });
    expect(parsed.sourceQuery).toBe("");
    expect(parsed.parsedDateTime).toMatchObject({ startTime: "14:00" });
  });

  it("keeps live source and location queries trimmed while typing temporal suffixes", () => {
    const locationParsed = parseCalendarTitle("Dinner @McDonald's at", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-20",
    });
    const sourceParsed = parseCalendarTitle("Dinner cal school at", {
      now: new Date("2026-04-20T19:00:00.000Z").getTime(),
      baseDate: "2026-04-20",
    });

    expect(locationParsed.locationQuery).toBe("McDonald's");
    expect(sourceParsed.sourceQuery).toBe("school");
  });
});
