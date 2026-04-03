import { describe, it, expect, vi, afterEach } from "vitest";
import { getNextWeekRange } from "./calendar.js";

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

  it("startDate is at midnight, endDate is at 23:59:59.999", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T17:00:00Z"));
    const { startDate, endDate } = getNextWeekRange();
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(endDate.getHours()).toBe(23);
    expect(endDate.getMinutes()).toBe(59);
    expect(endDate.getSeconds()).toBe(59);
  });
});
