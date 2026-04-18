import { describe, it, expect, vi } from "vitest";

const mockDb = { execute: vi.fn() };
vi.mock("../db/connection.js", () => ({ default: mockDb }));
vi.mock("./encryption.js", () => ({ decrypt: () => "mocked" }));
vi.mock("./gmail.js", () => ({ fetchEmails: async () => [] }));
vi.mock("./icloud.js", () => ({ fetchEmails: async () => [] }));
vi.mock("./calendar.js", () => ({ fetchCalendar: async () => [] }));
vi.mock("./weather.js", () => ({ fetchWeather: async () => ({}) }));
vi.mock("./ctm.js", () => ({ fetchCTMDeadlines: async () => [] }));
vi.mock("./claude.js", () => ({ callClaude: async () => ({}) }));
vi.mock("./actual.js", () => ({ getCategories: async () => [] }));

const { separateDeadlines, computeDeadlineStats } = await import("./index.js");
const { hydrateRecurringTombstones } = await import("./tombstones.js");

describe("tombstone injection composition", () => {
  it("coexists with a live next-occurrence row sharing the same task id", async () => {
    mockDb.execute.mockReset();
    mockDb.execute.mockImplementation(async ({ sql }) => {
      if (sql.startsWith("SELECT")) {
        return {
          rows: [
            {
              todoist_id: "td-1",
              due_date: "2099-01-01",
              snapshot_json: JSON.stringify({
                id: "td-1",
                title: "Empty dishwasher",
                due_date: "2099-01-01",
                source: "todoist",
                is_recurring: true,
              }),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const liveTodoist = [
      {
        id: "td-1",
        title: "Empty dishwasher",
        due_date: "2099-01-02",
        status: "incomplete",
        source: "todoist",
        is_recurring: true,
      },
    ];
    const completedIds = new Set();
    const separated = separateDeadlines([], liveTodoist, completedIds);
    const tombstones = await hydrateRecurringTombstones("user-1");
    const final = [...separated.todoist, ...tombstones];

    expect(final).toHaveLength(2);
    const tomb = final.find((t) => t._tombstone);
    const live = final.find((t) => !t._tombstone);
    expect(tomb.id).toBe("td-1");
    expect(tomb.status).toBe("complete");
    expect(live.id).toBe("td-1");
    expect(live.status).toBe("incomplete");

    const stats = computeDeadlineStats(final);
    expect(stats.incomplete).toBe(1);
  });
});
