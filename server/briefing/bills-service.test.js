import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockActual = {
  sendBill: vi.fn(),
  markBillPaid: vi.fn(),
  getAccounts: vi.fn(),
  getCategories: vi.fn(),
  getPayees: vi.fn(),
  getMetadata: vi.fn(),
  testConnection: vi.fn(),
  createQuickTxn: vi.fn(),
};
vi.mock("./actual.js", () => mockActual);
vi.mock("./bill-extract.js", () => ({ trimBillBody: ({ body }) => body.slice(0, 100) }));
vi.mock("../db/connection.js", () => ({ default: { execute: vi.fn() } }));

const originalFetch = global.fetch;
const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  Object.values(mockActual).forEach((fn) => fn.mockReset());
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env.ANTHROPIC_API_KEY = originalKey;
});

const { extractBill, sendBill, listAccounts } = await import("./bills-service.js");

describe("extractBill", () => {
  it("translates Haiku category/account codes back to real ids", async () => {
    mockActual.getCategories.mockResolvedValueOnce([
      { group: "G1", categories: [{ id: "CAT-REAL-1", name: "Groceries" }] },
    ]);
    mockActual.getAccounts.mockResolvedValueOnce([
      { id: "ACC-REAL-1", name: "Visa" },
    ]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "tool_use",
            name: "submit_bill",
            input: {
              payee: "PG&E",
              amount: 120,
              due_date: "2026-05-01",
              type: "bill",
              category_code: "c1",
              category_name: "Groceries",
              to_account_code: null,
            },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 20 },
      }),
    });

    const out = await extractBill("u1", { subject: "Bill", from: "x@y", body: "body" });

    expect(out).toEqual({
      payee: "PG&E",
      amount: 120,
      due_date: "2026-05-01",
      type: "bill",
      category_id: "CAT-REAL-1",
      category_name: "Groceries",
      to_account_id: null,
    });
  });

  it("returns 502-shaped error when Haiku response lacks tool_use", async () => {
    mockActual.getCategories.mockResolvedValueOnce([]);
    mockActual.getAccounts.mockResolvedValueOnce([]);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [] }),
    });

    await expect(
      extractBill("u1", { subject: "x", from: "y", body: "z" })
    ).rejects.toMatchObject({ status: 502 });
  });
});

describe("sendBill", () => {
  it("forwards to actual.sendBill", async () => {
    mockActual.sendBill.mockResolvedValueOnce({ id: "bill-1" });
    const out = await sendBill("u1", { payee: "x", amount: 10, type: "bill" });
    expect(out).toEqual({ id: "bill-1" });
    expect(mockActual.sendBill).toHaveBeenCalledWith({ payee: "x", amount: 10, type: "bill" }, "u1");
  });
});

describe("listAccounts", () => {
  it("passes through to actual.getAccounts", async () => {
    mockActual.getAccounts.mockResolvedValueOnce([{ id: "a1" }]);
    const out = await listAccounts("u1");
    expect(out).toEqual([{ id: "a1" }]);
  });
});
