import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { execute: vi.fn() };
vi.mock("../db/connection.js", () => ({ default: mockDb }));
vi.mock("../briefing/todoist.js", () => ({
  completeTodoistTask: vi.fn(),
  deleteTodoistTask: vi.fn(),
  fetchTodoistProjects: vi.fn(),
  fetchTodoistLabels: vi.fn(),
  createTodoistTask: vi.fn(),
  updateTodoistTask: vi.fn(),
}));
vi.mock("../briefing/ctm.js", () => ({ updateCTMEventStatus: vi.fn() }));
vi.mock("../briefing/tombstones.js", () => ({ buildSnapshot: vi.fn() }));

process.env.EA_USER_ID = "user-1";
const { default: router } = await import("./briefing/tasks.js");

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
function findHandler(method, path) {
  const layer = router.stack.find((l) => l.route?.path === path && l.route.methods[method]);
  return layer?.route?.stack[0]?.handle;
}

describe("DELETE /tombstone/:todoistId", () => {
  beforeEach(() => mockDb.execute.mockReset());

  it("deletes only the tombstone row (due_date IS NOT NULL)", async () => {
    mockDb.execute.mockResolvedValue({ rows: [] });
    const handler = findHandler("delete", "/tombstone/:todoistId");
    expect(handler).toBeDefined();

    const req = { params: { todoistId: "td-1" } };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });

    expect(mockDb.execute).toHaveBeenCalledTimes(1);
    const call = mockDb.execute.mock.calls[0][0];
    expect(call.sql).toMatch(/DELETE FROM ea_completed_tasks/);
    expect(call.sql).toMatch(/due_date IS NOT NULL/i);
    expect(call.args).toEqual(["user-1", "td-1"]);
  });
});
