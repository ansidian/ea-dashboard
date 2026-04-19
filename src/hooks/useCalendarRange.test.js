import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("../api", () => ({
  getCalendarRange: vi.fn(),
}));

const { getCalendarRange } = await import("../api");
const { default: useCalendarRange } = await import("./useCalendarRange");

describe("useCalendarRange", () => {
  beforeEach(() => {
    getCalendarRange.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when disabled", async () => {
    const { result } = renderHook(() => useCalendarRange({ disabled: true }));
    await act(async () => {
      const events = await result.current.ensureRange("2026-04-18", "2026-04-25");
      expect(events).toEqual([]);
    });
    expect(getCalendarRange).not.toHaveBeenCalled();
  });

  it("fetches a month range and caches by YYYY-MM", async () => {
    getCalendarRange.mockResolvedValue({
      events: [{ startMs: new Date("2026-04-20T18:00:00Z").getTime(), title: "E1", source: "s", color: "#1" }],
    });
    const { result } = renderHook(() => useCalendarRange({ disabled: false }));

    await act(async () => {
      await result.current.ensureRange("2026-04-18", "2026-04-25");
    });
    expect(getCalendarRange).toHaveBeenCalledTimes(1);

    // Second call in same month → cached, no new fetch
    await act(async () => {
      await result.current.ensureRange("2026-04-20", "2026-04-22");
    });
    expect(getCalendarRange).toHaveBeenCalledTimes(1);
  });

  it("fetches each month separately when range spans multiple months", async () => {
    getCalendarRange.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useCalendarRange({ disabled: false }));

    await act(async () => {
      await result.current.ensureRange("2026-04-28", "2026-05-03");
    });
    // Two months = two fetches
    expect(getCalendarRange).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent fetches for the same month", async () => {
    let resolve;
    getCalendarRange.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useCalendarRange({ disabled: false }));

    act(() => {
      result.current.ensureRange("2026-04-18", "2026-04-25");
      result.current.ensureRange("2026-04-18", "2026-04-25");
    });
    expect(getCalendarRange).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve({ events: [] });
    });
  });

  it("invalidate() clears the cache", async () => {
    getCalendarRange.mockResolvedValue({ events: [] });
    const { result } = renderHook(() => useCalendarRange({ disabled: false }));

    await act(async () => {
      await result.current.ensureRange("2026-04-18", "2026-04-25");
    });
    act(() => result.current.invalidate());
    await act(async () => {
      await result.current.ensureRange("2026-04-18", "2026-04-25");
    });
    expect(getCalendarRange).toHaveBeenCalledTimes(2);
  });

  it("returns trimmed events via ensureRange's resolved value", async () => {
    const before = { startMs: new Date("2026-04-17T18:00:00Z").getTime(), title: "before", source: "s", color: "#1" };
    const within = { startMs: new Date("2026-04-20T18:00:00Z").getTime(), title: "within", source: "s", color: "#1" };
    const after = { startMs: new Date("2026-04-28T18:00:00Z").getTime(), title: "after", source: "s", color: "#1" };
    getCalendarRange.mockResolvedValue({ events: [before, within, after] });
    const { result } = renderHook(() => useCalendarRange({ disabled: false }));

    const events = await act(async () =>
      result.current.ensureRange("2026-04-18", "2026-04-25"),
    );
    expect(events.map((e) => e.title)).toEqual(["within"]);
  });
});
