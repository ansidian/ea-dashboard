import { describe, it, expect } from "vitest";
import { renderSlot, resolveInsight } from "./insight-resolver.js";

// Helper: build a Date that represents a specific PT wall-clock time.
// We do this by constructing a UTC time that, when shown in PT, matches.
// Pacific is UTC-8 (PST) or UTC-7 (PDT). For test dates we use explicit
// UTC offsets based on DST status. Most tests use post-spring-forward dates
// where PT = UTC-7, so 8:00am PT = 15:00 UTC.
function ptDate(ymd, hhmm, { dst = true } = {}) {
  const offsetHours = dst ? 7 : 8; // PDT vs PST
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, h + offsetHours, min));
}

describe("renderSlot — same day (diff=0)", () => {
  const now = ptDate("2026-04-08", "10:00"); // Wed 10am PDT

  it("no time → today", () => {
    expect(renderSlot({ iso: "2026-04-08" }, now)).toBe("today");
  });

  it("morning time in the future → this morning", () => {
    expect(renderSlot({ iso: "2026-04-08", time: "11:00" }, now)).toBe("this morning at 11am");
  });

  it("afternoon time → this afternoon", () => {
    expect(renderSlot({ iso: "2026-04-08", time: "15:30" }, now)).toBe("this afternoon at 3:30pm");
  });

  it("evening time → this evening", () => {
    expect(renderSlot({ iso: "2026-04-08", time: "18:00" }, now)).toBe("this evening at 6pm");
  });

  it("night time → tonight", () => {
    expect(renderSlot({ iso: "2026-04-08", time: "21:00" }, now)).toBe("tonight at 9pm");
  });

  it("past time today → earlier today", () => {
    expect(renderSlot({ iso: "2026-04-08", time: "08:00" }, now)).toBe("earlier today at 8am");
  });
});

describe("renderSlot — tomorrow (diff=1)", () => {
  const now = ptDate("2026-04-08", "10:00");

  it("no time → tomorrow", () => {
    expect(renderSlot({ iso: "2026-04-09" }, now)).toBe("tomorrow");
  });

  it("with time → tomorrow at {t}", () => {
    expect(renderSlot({ iso: "2026-04-09", time: "15:00" }, now)).toBe("tomorrow at 3pm");
  });
});

describe("renderSlot — yesterday (diff=-1)", () => {
  const now = ptDate("2026-04-08", "10:00");

  it("no time → yesterday", () => {
    expect(renderSlot({ iso: "2026-04-07" }, now)).toBe("yesterday");
  });

  it("morning time → yesterday at {t}", () => {
    expect(renderSlot({ iso: "2026-04-07", time: "09:00" }, now)).toBe("yesterday at 9am");
  });

  it("evening time → last night at {t}", () => {
    expect(renderSlot({ iso: "2026-04-07", time: "20:00" }, now)).toBe("last night at 8pm");
  });
});

describe("renderSlot — within-week future (diff 2..6)", () => {
  const now = ptDate("2026-04-08", "10:00"); // Wed

  it("no time → weekday", () => {
    // Sat Apr 11 is +3 days
    expect(renderSlot({ iso: "2026-04-11" }, now)).toBe("Sat");
  });

  it("with time → weekday at {t}", () => {
    expect(renderSlot({ iso: "2026-04-11", time: "14:00" }, now)).toBe("Sat at 2pm");
  });

  it("six days out still weekday", () => {
    expect(renderSlot({ iso: "2026-04-14" }, now)).toBe("Tue");
  });
});

describe("renderSlot — within-week past (diff -2..-6)", () => {
  const now = ptDate("2026-04-08", "10:00"); // Wed

  it("no time → last {weekday}", () => {
    expect(renderSlot({ iso: "2026-04-05" }, now)).toBe("last Sun");
  });

  it("with time → last {weekday} at {t}", () => {
    expect(renderSlot({ iso: "2026-04-05", time: "10:00" }, now)).toBe("last Sun at 10am");
  });
});

describe("renderSlot — distant (> 6 days)", () => {
  const now = ptDate("2026-04-08", "10:00");

  it("future → weekday month day", () => {
    expect(renderSlot({ iso: "2026-04-15" }, now)).toBe("Wed Apr 15");
  });

  it("future with time", () => {
    expect(renderSlot({ iso: "2026-04-15", time: "09:00" }, now)).toBe("Wed Apr 15 at 9am");
  });

  it("past > 6 days → weekday month day", () => {
    expect(renderSlot({ iso: "2026-04-01" }, now)).toBe("Wed Apr 1");
  });
});

describe("renderSlot — evening rollover (now is early morning)", () => {
  // Now is 2am PT on Apr 9. "Yesterday" evening events should render as "tonight".
  const now = ptDate("2026-04-09", "02:00");

  it("yesterday's evening event → tonight", () => {
    expect(renderSlot({ iso: "2026-04-08", time: "20:00" }, now)).toBe("tonight at 8pm");
  });

  it("yesterday's morning event → still yesterday", () => {
    expect(renderSlot({ iso: "2026-04-08", time: "09:00" }, now)).toBe("yesterday at 9am");
  });

  it("rollover does not apply after 4am", () => {
    const later = ptDate("2026-04-09", "05:00");
    expect(renderSlot({ iso: "2026-04-08", time: "20:00" }, later)).toBe("last night at 8pm");
  });
});

describe("renderSlot — DST transitions", () => {
  it("spring forward day (2026-03-08) renders correctly", () => {
    // Morning of spring-forward day, post-transition (PDT active)
    const now = ptDate("2026-03-08", "10:00"); // DST now in effect
    expect(renderSlot({ iso: "2026-03-09" }, now)).toBe("tomorrow");
    expect(renderSlot({ iso: "2026-03-07" }, now)).toBe("yesterday");
  });

  it("fall back day (2026-11-01) renders correctly", () => {
    // After fall-back, PST active
    const now = ptDate("2026-11-01", "12:00", { dst: false });
    expect(renderSlot({ iso: "2026-11-02" }, now)).toBe("tomorrow");
    expect(renderSlot({ iso: "2026-10-31" }, now)).toBe("yesterday");
  });
});

describe("renderSlot — edge cases", () => {
  const now = ptDate("2026-04-08", "10:00");

  it("null slot → empty string", () => {
    expect(renderSlot(null, now)).toBe("");
  });

  it("missing iso → empty string", () => {
    expect(renderSlot({}, now)).toBe("");
  });

  it("invalid time format ignored", () => {
    expect(renderSlot({ iso: "2026-04-09", time: "bogus" }, now)).toBe("tomorrow");
  });

  it("midnight time (00:00) renders as 12am", () => {
    expect(renderSlot({ iso: "2026-04-09", time: "00:00" }, now)).toBe("tomorrow at 12am");
  });

  it("noon (12:00) renders as 12pm", () => {
    expect(renderSlot({ iso: "2026-04-09", time: "12:00" }, now)).toBe("tomorrow at 12pm");
  });
});

describe("resolveInsight — template substitution", () => {
  const now = ptDate("2026-04-08", "10:00");

  it("substitutes a single slot", () => {
    const insight = {
      icon: "🎬",
      template: "The Boys viewing is {cal_a}.",
      slots: { cal_a: { iso: "2026-04-08", time: "20:00" } },
    };
    expect(resolveInsight(insight, now)).toBe("The Boys viewing is tonight at 8pm.");
  });

  it("substitutes multiple slots", () => {
    const insight = {
      template: "Your bill auto-pays {d1}, three days before your card closes {d2}.",
      slots: {
        d1: { iso: "2026-04-10" },
        d2: { iso: "2026-04-13" },
      },
    };
    expect(resolveInsight(insight, now)).toBe(
      "Your bill auto-pays Fri, three days before your card closes Mon.",
    );
  });

  it("leaves unresolved slot refs visible", () => {
    const insight = {
      template: "Missing {nope}.",
      slots: {},
    };
    expect(resolveInsight(insight, now)).toBe("Missing {nope}.");
  });

  it("back-compat: insight with only text → returns text", () => {
    const insight = { icon: "📋", text: "Plain text from an old briefing." };
    expect(resolveInsight(insight, now)).toBe("Plain text from an old briefing.");
  });

  it("back-compat: insight with empty template → falls through to text", () => {
    const insight = { text: "fallback" };
    expect(resolveInsight(insight, now)).toBe("fallback");
  });

  it("null insight → empty string", () => {
    expect(resolveInsight(null, now)).toBe("");
  });
});
