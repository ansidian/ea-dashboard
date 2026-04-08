import { describe, it, expect } from "vitest";

// Set dummy API key BEFORE importing claude.js — the module reads it at load time
process.env.ANTHROPIC_API_KEY = "test-key";

const { buildSlotCandidates } = await import("./claude.js");

describe("buildSlotCandidates", () => {
  it("returns empty dict on empty input", () => {
    const slots = buildSlotCandidates({});
    expect(slots).toEqual({});
  });

  it("mints ctm slots with stable IDs from source id", () => {
    const slots = buildSlotCandidates({
      ctmDeadlines: [
        { id: "hw42", title: "Problem Set 4", class_name: "Econ 101", due_date: "2026-04-12", due_time: "11:59 PM" },
      ],
    });
    expect(Object.keys(slots)).toEqual(["ctm_hw42"]);
    expect(slots.ctm_hw42.iso).toBe("2026-04-12");
    expect(slots.ctm_hw42.time).toBe("23:59");
    expect(slots.ctm_hw42.label).toMatch(/Problem Set 4/);
  });

  it("mints todoist slots with stable IDs", () => {
    const slots = buildSlotCandidates({
      todoistTasks: [
        { id: "task-99", title: "Order Poo-Pourri", class_name: "Inbox", due_date: "2026-04-09", due_time: null },
      ],
    });
    expect(Object.keys(slots)).toEqual(["tk_task_99"]);
    expect(slots.tk_task_99.iso).toBe("2026-04-09");
    expect(slots.tk_task_99.time).toBeUndefined();
  });

  it("mints bill slots with content-hash IDs", () => {
    const slots = buildSlotCandidates({
      upcomingBills: [
        { payee: "Electric Co", amount: 95.99, next_date: "2026-04-10" },
      ],
    });
    const keys = Object.keys(slots);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^bill_[a-f0-9]{8}$/);
    expect(slots[keys[0]].iso).toBe("2026-04-10");
    expect(slots[keys[0]].label).toBe("Electric Co $95.99");
  });

  it("mints calendar slots with UTC date for all-day events", () => {
    // _start is UTC midnight of the event date for all-day events
    const apr15Midnight = Date.UTC(2026, 3, 15); // Apr 15 00:00 UTC
    const slots = buildSlotCandidates({
      nextWeekCalendar: [
        { _start: apr15Midnight, _end: apr15Midnight + 86400000, title: "Tax Day", allDay: true },
      ],
    });
    const keys = Object.keys(slots);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^nwcal_[a-f0-9]{8}$/);
    expect(slots[keys[0]].iso).toBe("2026-04-15"); // NOT Apr 14 — UTC formatting applied
    expect(slots[keys[0]].time).toBeUndefined();
  });

  it("mints calendar slots with PT iso+time for timed events", () => {
    // 8pm PDT on Apr 8 2026 = 03:00 UTC Apr 9
    const apr8_8pmPDT = Date.UTC(2026, 3, 9, 3, 0);
    const slots = buildSlotCandidates({
      calendar: [
        { _start: apr8_8pmPDT, _end: apr8_8pmPDT + 3600000, title: "The Boys", allDay: false },
      ],
    });
    const keys = Object.keys(slots);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^cal_[a-f0-9]{8}$/);
    expect(slots[keys[0]].iso).toBe("2026-04-08");
    expect(slots[keys[0]].time).toBe("20:00");
  });

  it("skips items missing required date fields", () => {
    const slots = buildSlotCandidates({
      ctmDeadlines: [{ id: "x", title: "No date" }],
      todoistTasks: [{ id: "y", title: "No date" }],
      upcomingBills: [{ payee: "No date", amount: 1 }],
      calendar: [{ title: "No start", allDay: false }],
    });
    expect(slots).toEqual({});
  });

  it("parses 12-hour times correctly", () => {
    const slots = buildSlotCandidates({
      todoistTasks: [
        { id: "a", title: "Morning", due_date: "2026-04-09", due_time: "9:00 AM" },
        { id: "b", title: "Noon", due_date: "2026-04-09", due_time: "12:00 PM" },
        { id: "c", title: "Evening", due_date: "2026-04-09", due_time: "11:59 PM" },
        { id: "d", title: "Midnight", due_date: "2026-04-09", due_time: "12:00 AM" },
      ],
    });
    expect(slots.tk_a.time).toBe("09:00");
    expect(slots.tk_b.time).toBe("12:00");
    expect(slots.tk_c.time).toBe("23:59");
    expect(slots.tk_d.time).toBe("00:00");
  });
});
