import { describe, it, expect, vi } from "vitest";

const mockDb = {
  execute: vi.fn(),
};
vi.mock("../db/connection.js", () => ({ default: mockDb }));

const { buildSnapshot, partitionByExpiry, hydrateRecurringTombstones } =
  await import("./tombstones.js");

describe("buildSnapshot", () => {
  it("captures fields needed to rehydrate a completed recurring Todoist row", () => {
    const task = {
      id: "td-1",
      title: "Empty dishwasher",
      due_date: "2026-04-18",
      due_time: "8:00 AM",
      class_name: "Home",
      class_color: "#884dff",
      url: "https://app.todoist.com/app/task/empty-dishwasher-td-1",
      priority: 2,
      labels: ["chore"],
      description: "",
      source: "todoist",
      is_recurring: true,
    };
    const snap = buildSnapshot(task);
    expect(snap).toEqual({
      id: "td-1",
      title: "Empty dishwasher",
      due_date: "2026-04-18",
      due_time: "8:00 AM",
      class_name: "Home",
      class_color: "#884dff",
      url: "https://app.todoist.com/app/task/empty-dishwasher-td-1",
      priority: 2,
      labels: ["chore"],
      description: "",
      source: "todoist",
      is_recurring: true,
    });
  });

  it("drops transient runtime fields like _completing", () => {
    const task = {
      id: "td-1",
      title: "X",
      due_date: "2026-04-18",
      due_time: null,
      class_name: "Inbox",
      class_color: "#cba6da",
      url: "u",
      priority: null,
      labels: [],
      description: "",
      source: "todoist",
      is_recurring: true,
      _completing: true,
      status: "complete",
    };
    const snap = buildSnapshot(task);
    expect(snap._completing).toBeUndefined();
    expect(snap.status).toBeUndefined();
  });
});

describe("partitionByExpiry", () => {
  it("separates live (due_date >= today) from expired (due_date < today)", () => {
    const rows = [
      { todoist_id: "a", due_date: "2026-04-17" },
      { todoist_id: "b", due_date: "2026-04-18" },
      { todoist_id: "c", due_date: "2026-04-19" },
    ];
    const { live, expired } = partitionByExpiry(rows, "2026-04-18");
    expect(live.map((r) => r.todoist_id)).toEqual(["b", "c"]);
    expect(expired.map((r) => r.todoist_id)).toEqual(["a"]);
  });

  it("treats missing due_date as expired (defensive)", () => {
    const rows = [{ todoist_id: "x", due_date: null }];
    const { live, expired } = partitionByExpiry(rows, "2026-04-18");
    expect(live).toEqual([]);
    expect(expired).toHaveLength(1);
  });
});

describe("hydrateRecurringTombstones", () => {
  it("returns live tombstones as complete _tombstone rows and deletes expired ones", async () => {
    mockDb.execute.mockReset();
    mockDb.execute.mockImplementation(async ({ sql }) => {
      if (sql.startsWith("SELECT")) {
        return {
          rows: [
            {
              todoist_id: "live-1",
              due_date: "2099-01-01",
              snapshot_json: JSON.stringify({
                id: "live-1",
                title: "Future",
                due_date: "2099-01-01",
                source: "todoist",
                is_recurring: true,
              }),
            },
            {
              todoist_id: "expired-1",
              due_date: "1999-01-01",
              snapshot_json: JSON.stringify({ id: "expired-1", title: "Old" }),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const out = await hydrateRecurringTombstones("user-1");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("live-1");
    expect(out[0].status).toBe("complete");
    expect(out[0]._tombstone).toBe(true);

    const deleteCall = mockDb.execute.mock.calls.find(
      ([arg]) => arg.sql?.startsWith("DELETE"),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall[0].args).toContain("expired-1");
  });

  it("gracefully skips rows with malformed snapshot_json", async () => {
    mockDb.execute.mockReset();
    mockDb.execute.mockImplementation(async ({ sql }) => {
      if (sql.startsWith("SELECT")) {
        return {
          rows: [
            { todoist_id: "bad", due_date: "2099-01-01", snapshot_json: "{not json" },
            {
              todoist_id: "good",
              due_date: "2099-01-01",
              snapshot_json: JSON.stringify({ id: "good", title: "Valid", source: "todoist" }),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const out = await hydrateRecurringTombstones("user-1");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("good");
  });

  it("returns empty array and issues no DELETE when table is empty", async () => {
    mockDb.execute.mockReset();
    mockDb.execute.mockResolvedValue({ rows: [] });

    const out = await hydrateRecurringTombstones("user-1");
    expect(out).toEqual([]);

    const deleteCall = mockDb.execute.mock.calls.find(
      ([arg]) => arg.sql?.startsWith("DELETE"),
    );
    expect(deleteCall).toBeUndefined();
  });
});
