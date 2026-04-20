import { describe, it, expect, vi, afterEach } from "vitest";
import { getNextWeekRange, normalizeGoogleCalendarLink } from "./calendar.js";

describe("getNextWeekRange", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns next Sun–Sat when today is Thursday Apr 3 2026", () => {
    vi.useFakeTimers();
    // Thu Apr 3 2026, 10:00 AM Pacific (UTC-7)
    vi.setSystemTime(new Date("2026-04-03T17:00:00Z"));
    const { startDate, endDate } = getNextWeekRange();
    expect(startDate.getDay()).toBe(0); // Sunday
    expect(startDate.getDate()).toBe(5); // Apr 5
    expect(endDate.getDay()).toBe(6); // Saturday
    expect(endDate.getDate()).toBe(11); // Apr 11
  });

  it("returns next Sun–Sat when today is Saturday Apr 4 2026", () => {
    vi.useFakeTimers();
    // Sat Apr 4 2026, 10:00 AM Pacific
    vi.setSystemTime(new Date("2026-04-04T17:00:00Z"));
    const { startDate, endDate } = getNextWeekRange();
    expect(startDate.getDay()).toBe(0); // Sunday
    expect(startDate.getDate()).toBe(5); // Apr 5 (tomorrow)
    expect(endDate.getDay()).toBe(6); // Saturday
    expect(endDate.getDate()).toBe(11); // Apr 11
  });

  it("returns next Sun–Sat when today is Sunday Apr 5 2026", () => {
    vi.useFakeTimers();
    // Sun Apr 5 2026, 10:00 AM Pacific
    vi.setSystemTime(new Date("2026-04-05T17:00:00Z"));
    const { startDate, endDate } = getNextWeekRange();
    // Next week starts Apr 12 (next Sunday)
    expect(startDate.getDate()).toBe(12);
    expect(endDate.getDate()).toBe(18);
  });

  it("startDate and endDate are correct Pacific midnight boundaries regardless of server timezone", () => {
    vi.useFakeTimers();
    // Thu Apr 3 2026 — Pacific is UTC-7 (PDT)
    // Next Sunday is Apr 5, midnight Pacific = 07:00 UTC
    // Next Saturday is Apr 11, end-of-day Pacific = Apr 12 06:59:59.999 UTC
    vi.setSystemTime(new Date("2026-04-03T17:00:00Z"));
    const { startDate, endDate } = getNextWeekRange();
    // ISO string must show midnight Pacific as 07:00Z (UTC-7 offset)
    expect(startDate.toISOString()).toBe("2026-04-05T07:00:00.000Z");
    expect(endDate.toISOString()).toBe("2026-04-12T06:59:59.999Z");
  });
});

describe("normalizeGoogleCalendarLink", () => {
  it("adds authuser for Google Calendar links", () => {
    const result = normalizeGoogleCalendarLink(
      "https://calendar.google.com/calendar/u/0/r/eventedit/abc123",
      "me@example.com",
    );
    expect(result).toContain("authuser=me%40example.com");
  });

  it("normalizes generic Google event redirect links to calendar eventedit URLs", () => {
    const result = normalizeGoogleCalendarLink(
      "https://www.google.com/calendar/event?eid=abc123",
      "me@example.com",
    );
    expect(result).toContain("https://calendar.google.com/calendar/u/0/r/eventedit/abc123");
    expect(result).toContain("authuser=me%40example.com");
  });

  it("leaves non-Google links untouched", () => {
    expect(normalizeGoogleCalendarLink("https://example.com/event/123", "me@example.com"))
      .toBe("https://example.com/event/123");
  });
});
