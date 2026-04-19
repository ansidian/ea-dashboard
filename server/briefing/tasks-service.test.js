import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { execute: vi.fn() };
vi.mock("../db/connection.js", () => ({ default: mockDb }));
vi.mock("./todoist.js", () => ({
  completeTodoistTask: vi.fn(),
  deleteTodoistTask: vi.fn(),
  fetchTodoistProjects: vi.fn(),
  fetchTodoistLabels: vi.fn(),
  createTodoistTask: vi.fn(),
  updateTodoistTask: vi.fn(),
}));
vi.mock("./ctm.js", () => ({ updateCTMEventStatus: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./tombstones.js", () => ({ buildSnapshot: (t) => ({ snap: t.id }) }));
vi.mock("./stored-briefing-service.js", () => ({
  applyTaskCompletion: vi.fn(),
  applyCTMStatusChange: vi.fn(),
  applyCTMCompletionAfterTodoistClose: vi.fn(),
  upsertTodoistTask: vi.fn(),
  removeTodoistTask: vi.fn(),
}));

const todoist = await import("./todoist.js");
const ctm = await import("./ctm.js");
const storedBriefing = await import("./stored-briefing-service.js");
const { completeTask } = await import("./tasks-service.js");

beforeEach(() => {
  mockDb.execute.mockReset();
  Object.values(todoist).forEach((fn) => fn.mockReset?.());
  ctm.updateCTMEventStatus.mockClear();
  Object.values(storedBriefing).forEach((fn) => fn.mockReset?.());
});

function seedBriefing(briefingJson) {
  mockDb.execute.mockResolvedValueOnce({
    rows: [{ id: 1, briefing_json: JSON.stringify(briefingJson) }],
  });
  // Subsequent INSERTs / calls resolve empty by default
  mockDb.execute.mockResolvedValue({ rowsAffected: 1 });
}

describe("completeTask", () => {
  it("CTM-only: calls updateCTMEventStatus and strips task from briefing", async () => {
    seedBriefing({
      ctm: { upcoming: [{ id: 42 }] },
      todoist: { upcoming: [] },
    });

    await completeTask("u1", "42");

    expect(ctm.updateCTMEventStatus).toHaveBeenCalledWith(42, "complete");
    expect(todoist.completeTodoistTask).not.toHaveBeenCalled();
    expect(storedBriefing.applyTaskCompletion).toHaveBeenCalledWith("u1", {
      taskId: "42",
      isRecurringTodoist: false,
      isTodoistOnly: false,
    });
  });

  it("Todoist-only non-recurring: closes in Todoist + legacy dedupe row + flips status in briefing", async () => {
    seedBriefing({
      ctm: { upcoming: [] },
      todoist: { upcoming: [{ id: "td-1", is_recurring: false, due_date: "2026-04-18" }] },
    });

    await completeTask("u1", "td-1");

    expect(todoist.completeTodoistTask).toHaveBeenCalledWith("u1", "td-1");
    // One of the mockDb calls should be an INSERT OR IGNORE into ea_completed_tasks
    const insertCall = mockDb.execute.mock.calls.find(
      (c) => c[0].sql?.startsWith("INSERT OR IGNORE INTO ea_completed_tasks")
    );
    expect(insertCall).toBeTruthy();
    expect(storedBriefing.applyTaskCompletion).toHaveBeenCalledWith("u1", {
      taskId: "td-1",
      isRecurringTodoist: false,
      isTodoistOnly: true,
    });
  });

  it("Todoist-only recurring: writes tombstone snapshot row + skips stored-briefing mutation via flag", async () => {
    seedBriefing({
      ctm: { upcoming: [] },
      todoist: { upcoming: [{ id: "td-1", is_recurring: true, due_date: "2026-04-18" }] },
    });

    await completeTask("u1", "td-1");

    expect(todoist.completeTodoistTask).toHaveBeenCalledWith("u1", "td-1");
    const replaceCall = mockDb.execute.mock.calls.find(
      (c) => c[0].sql?.startsWith("INSERT OR REPLACE INTO ea_completed_tasks")
    );
    expect(replaceCall).toBeTruthy();
    expect(storedBriefing.applyTaskCompletion).toHaveBeenCalledWith("u1", {
      taskId: "td-1",
      isRecurringTodoist: true,
      isTodoistOnly: true,
    });
  });

  it("CTM with todoist_id: closes in Todoist, updates CTM, strips from briefing", async () => {
    seedBriefing({
      ctm: { upcoming: [{ id: 42, todoist_id: "td-1" }] },
      todoist: { upcoming: [] },
    });

    await completeTask("u1", "42");

    expect(todoist.completeTodoistTask).toHaveBeenCalledWith("u1", "td-1");
    expect(ctm.updateCTMEventStatus).toHaveBeenCalledWith(42, "complete");
    expect(storedBriefing.applyTaskCompletion).toHaveBeenCalledWith("u1", {
      taskId: "42",
      isRecurringTodoist: false,
      isTodoistOnly: false,
    });
  });

  it("skips tombstone row when matching a Todoist-only completion", async () => {
    seedBriefing({
      ctm: { upcoming: [] },
      todoist: {
        upcoming: [{ id: "td-1", _tombstone: true, due_date: "2026-04-18" }],
      },
    });

    await completeTask("u1", "td-1");

    // No live row → no Todoist close call
    expect(todoist.completeTodoistTask).not.toHaveBeenCalled();
    expect(storedBriefing.applyTaskCompletion).toHaveBeenCalled(); // still called, but no-ops
  });
});
