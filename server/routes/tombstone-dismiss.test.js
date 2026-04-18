import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = { execute: vi.fn() };
vi.mock("../db/connection.js", () => ({ default: mockDb }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (_req, _res, next) => next() }));
vi.mock("../briefing/todoist.js", () => ({
  completeTodoistTask: vi.fn(),
  fetchTodoistProjects: vi.fn(),
  fetchTodoistLabels: vi.fn(),
  createTodoistTask: vi.fn(),
  updateTodoistTask: vi.fn(),
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
  fetchEmailBody: vi.fn(), markAsRead: vi.fn(), markAsUnread: vi.fn(),
  trashMessage: vi.fn(), batchMarkAsRead: vi.fn(),
  snoozeAtGmail: vi.fn(), wakeAtGmail: vi.fn(),
}));
vi.mock("../briefing/icloud.js", () => ({
  fetchEmailBody: vi.fn(), markAsRead: vi.fn(), markAsUnread: vi.fn(),
  trashMessage: vi.fn(), batchMarkAsRead: vi.fn(),
}));
vi.mock("../briefing/encryption.js", () => ({ decrypt: vi.fn() }));
vi.mock("../briefing/actual.js", () => ({
  sendBill: vi.fn(), markBillPaid: vi.fn(), getAccounts: vi.fn(),
  getCategories: vi.fn(), getPayees: vi.fn(), getMetadata: vi.fn(),
  testConnection: vi.fn(), createQuickTxn: vi.fn(),
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
