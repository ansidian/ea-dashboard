import { describe, expect, it } from "vitest";
import {
  extractUrlsFromText,
  extractZoomMeetingUrl,
  getLocationDisplayLabel,
  isZoomUrl,
  stripUrlsFromText,
} from "./calendar-links";

describe("calendar-links", () => {
  it("extracts URLs and strips trailing punctuation", () => {
    expect(
      extractUrlsFromText("Join here: https://calstatela.zoom.us/j/81820730704)."),
    ).toEqual(["https://calstatela.zoom.us/j/81820730704"]);
  });

  it("strips URLs from text while preserving surrounding copy", () => {
    expect(
      stripUrlsFromText("Zoom link https://calstatela.zoom.us/j/81820730704 for office hours"),
    ).toBe("Zoom link for office hours");
  });

  it("accepts vanity Zoom subdomains", () => {
    expect(isZoomUrl("https://calstatela.zoom.us/j/81820730704")).toBe(true);
  });

  it("rejects non-Zoom hosts", () => {
    expect(isZoomUrl("https://example.com/zoom.us/j/81820730704")).toBe(false);
  });

  it("prefers a Zoom URL from location before description", () => {
    expect(
      extractZoomMeetingUrl({
        location: "https://calstatela.zoom.us/j/81820730704",
        description: "Backup: https://zoom.us/j/99999999999",
      }),
    ).toBe("https://calstatela.zoom.us/j/81820730704");
  });

  it("falls back to description when location has no Zoom link", () => {
    expect(
      extractZoomMeetingUrl({
        location: "Conference Room B",
        description: "Zoom notes https://zoom.us/j/12345678901?pwd=abc",
      }),
    ).toBe("https://zoom.us/j/12345678901?pwd=abc");
  });

  it("returns a clean Zoom subtitle label when the location is only a Zoom URL", () => {
    expect(getLocationDisplayLabel("https://calstatela.zoom.us/j/81820730704")).toBe("Zoom meeting");
  });

  it("keeps non-URL location text around a Zoom URL", () => {
    expect(
      getLocationDisplayLabel("Zoom link https://calstatela.zoom.us/j/81820730704 for office hours"),
    ).toBe("Zoom link for office hours");
  });
});
