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

  it("prunes tombstones whose task id is absent from the live Todoist set", async () => {
    mockDb.execute.mockReset();
    mockDb.execute.mockImplementation(async ({ sql }) => {
      if (sql.startsWith("SELECT")) {
        return {
          rows: [
            {
              todoist_id: "still-there",
              due_date: "2099-01-01",
              snapshot_json: JSON.stringify({ id: "still-there", title: "Kept", source: "todoist", is_recurring: true }),
            },
            {
              todoist_id: "deleted-in-todoist",
              due_date: "2099-01-01",
              snapshot_json: JSON.stringify({ id: "deleted-in-todoist", title: "Gone", source: "todoist", is_recurring: true }),
            },
          ],
        };
      }
      return { rows: [] };
    });

    const liveIds = new Set(["still-there"]);
    const out = await hydrateRecurringTombstones("user-1", liveIds);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("still-there");

    const deleteCall = mockDb.execute.mock.calls.find(
      ([arg]) => arg.sql?.startsWith("DELETE"),
    );
    expect(deleteCall).toBeDefined();
    expect(deleteCall[0].args).toContain("deleted-in-todoist");
    expect(deleteCall[0].args).not.toContain("still-there");
  });

  it("retains yesterday's tombstone but filters per view: today hides it, yesterday shows it", async () => {
    // Pin clock so "today" / "yesterday" are stable.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-18T16:00:00Z")); // midday Pacific on 2026-04-18

    mockDb.execute.mockReset();
    mockDb.execute.mockImplementation(async ({ sql }) => {
      if (sql.startsWith("SELECT")) {
        return {
          rows: [
            {
              todoist_id: "yesterday-task",
              due_date: "2026-04-17",
              snapshot_json: JSON.stringify({ id: "yesterday-task", title: "Y", source: "todoist", is_recurring: false }),
            },
            {
              todoist_id: "today-task",
              due_date: "2026-04-18",
              snapshot_json: JSON.stringify({ id: "today-task", title: "T", source: "todoist", is_recurring: false }),
            },
            {
              todoist_id: "two-days-ago",
              due_date: "2026-04-16",
              snapshot_json: JSON.stringify({ id: "two-days-ago", title: "Old", source: "todoist" }),
            },
          ],
        };
      }
      return { rows: [] };
    });

    // Deadlines view: today gate. Yesterday filtered out IN MEMORY but
    // retained in DB for calendar's benefit. Two-days-ago deleted from DB.
    const deadlinesOut = await hydrateRecurringTombstones("user-1", null, { viewBoundary: "today" });
    expect(deadlinesOut.map((t) => t.id)).toEqual(["today-task"]);

    const firstDelete = mockDb.execute.mock.calls.find(
      ([arg]) => arg.sql?.startsWith("DELETE"),
    );
    expect(firstDelete).toBeDefined();
    expect(firstDelete[0].args).toContain("two-days-ago");
    // Crucially: yesterday's tombstone survives the deadlines pass.
    expect(firstDelete[0].args).not.toContain("yesterday-task");

    // Calendar view: yesterday gate. Sees both today AND yesterday.
    mockDb.execute.mockClear();
    mockDb.execute.mockImplementation(async ({ sql }) => {
      if (sql.startsWith("SELECT")) {
        // Simulate post-deadlines-cleanup state (two-days-ago already gone).
        return {
          rows: [
            {
              todoist_id: "yesterday-task",
              due_date: "2026-04-17",
              snapshot_json: JSON.stringify({ id: "yesterday-task", title: "Y", source: "todoist" }),
            },
            {
              todoist_id: "today-task",
              due_date: "2026-04-18",
              snapshot_json: JSON.stringify({ id: "today-task", title: "T", source: "todoist" }),
            },
          ],
        };
      }
      return { rows: [] };
    });
    const calendarOut = await hydrateRecurringTombstones("user-1", null, { viewBoundary: "yesterday" });
    expect(calendarOut.map((t) => t.id).sort()).toEqual(["today-task", "yesterday-task"]);

    vi.useRealTimers();
  });

  it("skips orphan pruning when liveTodoistIds is null (can't verify)", async () => {
    mockDb.execute.mockReset();
    mockDb.execute.mockImplementation(async ({ sql }) => {
      if (sql.startsWith("SELECT")) {
        return {
          rows: [
            {
              todoist_id: "td-1",
              due_date: "2099-01-01",
              snapshot_json: JSON.stringify({ id: "td-1", title: "X", source: "todoist" }),
            },
          ],
        };
      }
      return { rows: [] };
    });

    // Explicit null — callers pass this when Todoist fetch failed, so we
    // must not wipe tombstones just because we couldn't check them.
    const out = await hydrateRecurringTombstones("user-1", null);
    expect(out).toHaveLength(1);

    const deleteCall = mockDb.execute.mock.calls.find(
      ([arg]) => arg.sql?.startsWith("DELETE"),
    );
    expect(deleteCall).toBeUndefined();
  });
});
