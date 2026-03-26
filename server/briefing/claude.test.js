import { describe, it, expect } from "vitest";

// Set dummy API key BEFORE importing claude.js — the module reads it at load time
process.env.ANTHROPIC_API_KEY = "test-key";

const { parseResponse } = await import("./claude.js");

const validBriefing = {
  aiInsights: [{ icon: "calendar", text: "You have a meeting at 2pm" }],
  emails: {
    summary: "3 emails across 1 account",
    accounts: [{
      name: "Gmail", icon: "envelope", color: "#red", unread: 1,
      important: [{ id: "1", from: "Test", subject: "Hi", urgency: "low" }],
      noise_count: 2,
    }],
  },
  deadlines: [],
};

describe("parseResponse", () => {
  describe("valid input", () => {
    it("returns parsed object when given valid JSON with correct shape", () => {
      const input = JSON.stringify(validBriefing);
      const result = parseResponse(input);
      expect(result.aiInsights).toBeInstanceOf(Array);
      expect(result.emails).toBeInstanceOf(Object);
      expect(result.deadlines).toBeInstanceOf(Array);
    });

    it("strips markdown code fences (```json ... ```) and parses correctly", () => {
      const input = "```json\n" + JSON.stringify(validBriefing) + "\n```";
      const result = parseResponse(input);
      expect(result.aiInsights[0].text).toBe("You have a meeting at 2pm");
    });

    it("strips plain ``` fences and parses correctly", () => {
      const input = "```\n" + JSON.stringify(validBriefing) + "\n```";
      const result = parseResponse(input);
      expect(result.emails.summary).toBe("3 emails across 1 account");
    });

    it("extracts JSON from surrounding prose via regex fallback", () => {
      const input = "Here is the analysis:\n\n" + JSON.stringify(validBriefing) + "\n\nEnd of response.";
      const result = parseResponse(input);
      expect(result.deadlines).toEqual([]);
    });

    it("accepts JSON with extra keys beyond the required three", () => {
      const extraKeys = { ...validBriefing, model: "claude-opus", extraField: "ignored" };
      const input = JSON.stringify(extraKeys);
      const result = parseResponse(input);
      expect(result.model).toBe("claude-opus");
      expect(result.aiInsights).toBeInstanceOf(Array);
    });
  });

  describe("invalid shape", () => {
    it("throws when required key 'emails' is missing", () => {
      const noEmails = { aiInsights: [], deadlines: [] };
      expect(() => parseResponse(JSON.stringify(noEmails))).toThrow(/missing/i);
      expect(() => parseResponse(JSON.stringify(noEmails))).toThrow(/emails/);
    });

    it("throws when 'emails' is wrong type (string instead of object)", () => {
      const wrongType = { ...validBriefing, emails: "not an object" };
      expect(() => parseResponse(JSON.stringify(wrongType))).toThrow(/emails/);
    });

    it("throws when 'aiInsights' is wrong type (object instead of array)", () => {
      const wrongType = { ...validBriefing, aiInsights: { insight: "bad" } };
      expect(() => parseResponse(JSON.stringify(wrongType))).toThrow(/aiInsights/);
    });
  });

  describe("unparseable input", () => {
    it("throws with 'Failed to parse' on empty string", () => {
      expect(() => parseResponse("")).toThrow(/Failed to parse/);
    });

    it("throws with 'Failed to parse' on garbage non-JSON text", () => {
      expect(() => parseResponse("this is not JSON at all!!!")).toThrow(/Failed to parse/);
    });
  });
});
