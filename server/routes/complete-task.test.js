import { describe, it, expect, vi, beforeEach } from "vitest";

const dbState = {
  briefings: [],
  completedTasks: [],
};

const mockDb = {
  execute: vi.fn(async ({ sql, args }) => {
    if (/SELECT id, briefing_json FROM ea_briefings/.test(sql)) {
      return { rows: dbState.briefings };
    }
    if (/INSERT OR (IGNORE|REPLACE) INTO ea_completed_tasks/.test(sql)) {
      dbState.completedTasks.push({
        user_id: args[0],
        todoist_id: args[1],
        due_date: args[2] ?? null,
        snapshot_json: args[3] ?? null,
      });
      return { rows: [] };
    }
    if (/UPDATE ea_briefings SET briefing_json/.test(sql)) {
      if (dbState.briefings[0]) dbState.briefings[0].briefing_json = args[0];
      return { rows: [] };
    }
    return { rows: [] };
  }),
};

vi.mock("../db/connection.js", () => ({ default: mockDb }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (_req, _res, next) => next() }));
vi.mock("../briefing/todoist.js", () => ({
  completeTodoistTask: vi.fn().mockResolvedValue(undefined),
  fetchTodoistProjects: vi.fn(),
  fetchTodoistLabels: vi.fn(),
  createTodoistTask: vi.fn(),
  updateTodoistTask: vi.fn(),
  fetchTodoistTaskIdSet: vi.fn(),
}));
vi.mock("../briefing/ctm.js", () => ({ updateCTMEventStatus: vi.fn() }));
vi.mock("../briefing/index.js", () => ({
  generateBriefing: vi.fn(),
  quickRefresh: vi.fn(),
  loadUserConfig: vi.fn(),
  fetchAllEmails: vi.fn(),
}));
vi.mock("../briefing/email-index.js", () => ({ indexEmails: vi.fn() }));
vi.mock("../briefing/gmail.js", () => ({
  fetchEmailBody: vi.fn(),
  markAsRead: vi.fn(),
  markAsUnread: vi.fn(),
  trashMessage: vi.fn(),
  batchMarkAsRead: vi.fn(),
  snoozeAtGmail: vi.fn(),
  wakeAtGmail: vi.fn(),
}));
vi.mock("../briefing/icloud.js", () => ({
  fetchEmailBody: vi.fn(),
  markAsRead: vi.fn(),
  markAsUnread: vi.fn(),
  trashMessage: vi.fn(),
  batchMarkAsRead: vi.fn(),
}));
vi.mock("../briefing/encryption.js", () => ({ decrypt: vi.fn() }));
vi.mock("../briefing/actual.js", () => ({
  sendBill: vi.fn(),
  markBillPaid: vi.fn(),
  getAccounts: vi.fn(),
  getCategories: vi.fn(),
  getPayees: vi.fn(),
  getMetadata: vi.fn(),
  testConnection: vi.fn(),
  createQuickTxn: vi.fn(),
}));
vi.mock("../briefing/bill-extract.js", () => ({ trimBillBody: vi.fn() }));
vi.mock("../db/dev-fixture.js", () => ({ generateMockHistory: vi.fn(), generateEnrichedMock: vi.fn() }));
vi.mock("../db/dev-seed-embeddings.js", () => ({ seedEmbeddings: vi.fn() }));
vi.mock("../db/scenarios/index.js", () => ({ applyScenarios: vi.fn(), listScenarios: vi.fn() }));

process.env.EA_USER_ID = "user-1";

const { default: router } = await import("./briefing.js");

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

describe("POST /complete-task/:taskId — recurring Todoist tombstone branch", () => {
  beforeEach(() => {
    dbState.briefings = [];
    dbState.completedTasks = [];
    mockDb.execute.mockClear();
  });

  it("writes snapshot + due_date and does NOT strip the task for recurring Todoist", async () => {
    const task = {
      id: "td-rec",
      title: "Empty dishwasher",
      due_date: "2026-04-18",
      due_time: "8:00 AM",
      class_name: "Home",
      class_color: "#884dff",
      url: "https://app.todoist.com/app/task/empty-dishwasher-td-rec",
      priority: 2,
      labels: [],
      description: "",
      source: "todoist",
      is_recurring: true,
      status: "incomplete",
    };
    dbState.briefings = [{
      id: 1,
      briefing_json: JSON.stringify({
        todoist: { upcoming: [task], stats: {} },
        ctm: { upcoming: [], stats: {} },
      }),
    }];

    const handler = findHandler("post", "/complete-task/:taskId");
    const req = { params: { taskId: "td-rec" }, body: {} };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(dbState.completedTasks).toHaveLength(1);
    const row = dbState.completedTasks[0];
    expect(row.todoist_id).toBe("td-rec");
    expect(row.due_date).toBe("2026-04-18");
    expect(row.snapshot_json).toBeTruthy();
    const snap = JSON.parse(row.snapshot_json);
    expect(snap.title).toBe("Empty dishwasher");
    expect(snap.is_recurring).toBe(true);

    // Recurring: stored briefing left untouched — the tombstone injection
    // on next fetch handles visibility (separate row for the old occurrence).
    const updateCalls = mockDb.execute.mock.calls.filter(
      ([arg]) => arg.sql?.startsWith("UPDATE ea_briefings"),
    );
    expect(updateCalls).toHaveLength(0);
  });

  it("returns 502 and does NOT insert a dedupe row when Todoist close fails", async () => {
    const todoistModule = await import("../briefing/todoist.js");
    todoistModule.completeTodoistTask.mockRejectedValueOnce(new Error("Todoist API 401: bad token"));

    const task = {
      id: "td-fail",
      title: "One-off",
      due_date: "2026-04-18",
      source: "todoist",
      is_recurring: false,
      status: "incomplete",
    };
    dbState.briefings = [{
      id: 1,
      briefing_json: JSON.stringify({
        todoist: { upcoming: [task], stats: {} },
        ctm: { upcoming: [], stats: {} },
      }),
    }];

    const handler = findHandler("post", "/complete-task/:taskId");
    const req = { params: { taskId: "td-fail" }, body: {} };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(502);
    // No dedupe row — else reconciliation would incorrectly treat this as
    // completed on next refresh, masking the real (still-open) Todoist state.
    expect(dbState.completedTasks).toHaveLength(0);
    // Stored briefing must be untouched so the task remains visible.
    const stored = JSON.parse(dbState.briefings[0].briefing_json);
    expect(stored.todoist.upcoming).toHaveLength(1);
  });

  it("create-then-complete without refresh: created task lands in stored briefing so close isn't skipped", async () => {
    const todoistModule = await import("../briefing/todoist.js");
    todoistModule.createTodoistTask.mockResolvedValueOnce({
      id: "td-new",
      title: "Pick up milk",
      due_date: "2026-04-18",
      source: "todoist",
      is_recurring: false,
    });

    // Stored briefing exists but does NOT contain the just-created task —
    // this mirrors the real client state: handleAddTask only updates local
    // React state, and the stored briefing stays stale until next refresh.
    dbState.briefings = [{
      id: 1,
      briefing_json: JSON.stringify({
        todoist: { upcoming: [], stats: {} },
        ctm: { upcoming: [], stats: {} },
      }),
    }];

    // Step 1: Create the task via the POST /todoist/tasks endpoint.
    const createHandler = findHandler("post", "/todoist/tasks");
    const createReq = { params: {}, body: { content: "Pick up milk" } };
    const createRes = makeRes();
    await createHandler(createReq, createRes);
    expect(createRes.statusCode).toBe(200);

    // Sanity: the mirror wrote the new task into the stored briefing.
    const afterCreate = JSON.parse(dbState.briefings[0].briefing_json);
    expect(afterCreate.todoist.upcoming).toHaveLength(1);
    expect(afterCreate.todoist.upcoming[0].id).toBe("td-new");

    // Step 2: Complete the task. Without the mirror, todoistTask would be
    // undefined, todoistId null, and completeTodoistTask NEVER called —
    // which is the bug you reported. Verify close DOES get called.
    const completeHandler = findHandler("post", "/complete-task/:taskId");
    const completeReq = { params: { taskId: "td-new" }, body: {} };
    const completeRes = makeRes();
    await completeHandler(completeReq, completeRes);

    expect(completeRes.statusCode).toBe(200);
    expect(todoistModule.completeTodoistTask).toHaveBeenCalledWith("user-1", "td-new");
    expect(dbState.completedTasks).toHaveLength(1);
    expect(dbState.completedTasks[0].todoist_id).toBe("td-new");
  });

  it("non-recurring Todoist-only: legacy dedupe row + flips status (does NOT strip)", async () => {
    // Non-recurring uses the legacy dedupe row (no snapshot) — tombstones
    // are a recurring-only concern. The stored briefing retains the row
    // with status=complete so page reload shows strikethrough, and the
    // carry-forward step in refresh preserves it until its due_date slips
    // past the view gate.
    const task = {
      id: "td-one",
      title: "One-off",
      due_date: "2026-04-18",
      source: "todoist",
      is_recurring: false,
      status: "incomplete",
    };
    dbState.briefings = [{
      id: 1,
      briefing_json: JSON.stringify({
        todoist: { upcoming: [task], stats: {} },
        ctm: { upcoming: [], stats: {} },
      }),
    }];

    const handler = findHandler("post", "/complete-task/:taskId");
    const req = { params: { taskId: "td-one" }, body: {} };
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(dbState.completedTasks).toHaveLength(1);
    const row = dbState.completedTasks[0];
    expect(row.due_date).toBeNull();
    expect(row.snapshot_json).toBeNull();

    const updated = JSON.parse(dbState.briefings[0].briefing_json);
    expect(updated.todoist.upcoming).toHaveLength(1);
    expect(updated.todoist.upcoming[0].status).toBe("complete");
  });
});
