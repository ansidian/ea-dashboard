import { describe, it, expect, vi, beforeEach } from "vitest";

// We need to stub global fetch before importing the module
vi.stubGlobal("fetch", vi.fn());

const { chunkArray, fetchMessages } = await import("./gmail.js");

describe("gmail", () => {
  describe("chunkArray", () => {
    it("splits array into chunks of given size", () => {
      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    });

    it("returns empty array for empty input", () => {
      expect(chunkArray([], 10)).toEqual([]);
    });

    it("returns single chunk when array is smaller than chunk size", () => {
      expect(chunkArray([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
    });
  });

  describe("fetchMessages", () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it("fetches 25 messages in chunks and returns all 25", async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: "msg", payload: {} }),
      });

      const ids = Array.from({ length: 25 }, (_, i) => `id${i}`);
      const results = await fetchMessages("token", ids);

      expect(fetch).toHaveBeenCalledTimes(25);
      expect(results.length).toBe(25);
    });

    it("does not cap input — fetches all 120 IDs", async () => {
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: "msg", payload: {} }),
      });

      const ids = Array.from({ length: 120 }, (_, i) => `id${i}`);
      const results = await fetchMessages("token", ids);

      expect(fetch).toHaveBeenCalledTimes(120);
      expect(results.length).toBe(120);
    });

    it("logs a warning for each dropped fetch and returns only successes", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      fetch
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "msg2", payload: {} }),
        })
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValue({
          ok: true,
          json: async () => ({ id: "msgN", payload: {} }),
        });

      const ids = Array.from({ length: 5 }, (_, i) => `id${i}`);
      const results = await fetchMessages("token", ids);

      // First and third calls fail; 3 of 5 succeed
      expect(results.length).toBe(3);
      // 2 per-message warnings + 1 summary warning
      expect(warnSpy).toHaveBeenCalledTimes(3);
      warnSpy.mockRestore();
    });

    it("concatenates results from all chunks in order", async () => {
      let callCount = 0;
      fetch.mockImplementation(() => {
        const idx = callCount++;
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: `msg${idx}`, payload: {} }),
        });
      });

      const ids = Array.from({ length: 12 }, (_, i) => `id${i}`);
      const results = await fetchMessages("token", ids);

      expect(results.length).toBe(12);
      expect(results[0].id).toBe("msg0");
      expect(results[11].id).toBe("msg11");
    });
  });
});
