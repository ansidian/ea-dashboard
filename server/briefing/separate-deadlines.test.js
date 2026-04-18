import { describe, it, expect, vi } from "vitest";

vi.mock("../db/connection.js", () => ({ default: {} }));
vi.mock("./encryption.js", () => ({ decrypt: () => "mocked" }));
vi.mock("./gmail.js", () => ({ fetchEmails: async () => [] }));
vi.mock("./icloud.js", () => ({ fetchEmails: async () => [] }));
vi.mock("./calendar.js", () => ({ fetchCalendar: async () => [] }));
vi.mock("./weather.js", () => ({ fetchWeather: async () => ({}) }));
vi.mock("./ctm.js", () => ({ fetchCTMDeadlines: async () => [] }));
vi.mock("./claude.js", () => ({ callClaude: async () => ({}) }));
vi.mock("./actual.js", () => ({ getCategories: async () => [] }));

const { separateDeadlines } = await import("./index.js");

describe("separateDeadlines", () => {
  it("keeps CTM tasks regardless of completion status (CTM API is the source of truth)", () => {
    const ctm = [
      { id: 1, title: "Active", status: "incomplete", due_date: "2026-04-17" },
      { id: 2, title: "Done in CTM", status: "complete", due_date: "2026-04-17" },
    ];
    const todoist = [];
    const completedIds = new Set();

    const out = separateDeadlines(ctm, todoist, completedIds);

    expect(out.ctm.map((t) => t.id)).toEqual([1, 2]);
    expect(out.ctm.find((t) => t.id === 2).status).toBe("complete");
  });

  it("does not drop a CTM task even when its todoist_id is in completedIds", () => {
    // Dashboard-initiated completions write to ea_completed_tasks, but the
    // CTM API will already report status=complete on next fetch. We must NOT
    // double-filter here, or the user loses the strikethrough row before the
    // day is past.
    const ctm = [
      { id: 1, title: "Linked", status: "complete", due_date: "2026-04-17", todoist_id: "td-1" },
    ];
    const todoist = [];
    const completedIds = new Set(["td-1"]);

    const out = separateDeadlines(ctm, todoist, completedIds);

    expect(out.ctm).toHaveLength(1);
    expect(out.ctm[0].status).toBe("complete");
  });

  it("still suppresses Todoist tasks whose id matches a CTM todoist_id (de-dup)", () => {
    const ctm = [
      { id: 1, title: "From CTM", status: "incomplete", due_date: "2026-04-17", todoist_id: "td-1" },
    ];
    const todoist = [
      { id: "td-1", title: "Mirror in Todoist", due_date: "2026-04-17" },
      { id: "td-2", title: "Native Todoist", due_date: "2026-04-17" },
    ];

    const out = separateDeadlines(ctm, todoist, new Set());

    expect(out.todoist.map((t) => t.id)).toEqual(["td-2"]);
  });

  it("filters Todoist by completedIds (no API truth available for completed Todoist tasks)", () => {
    const ctm = [];
    const todoist = [
      { id: "td-1", title: "Active" },
      { id: "td-2", title: "Done in app" },
    ];
    const completedIds = new Set(["td-2"]);

    const out = separateDeadlines(ctm, todoist, completedIds);

    expect(out.todoist.map((t) => t.id)).toEqual(["td-1"]);
  });
});
