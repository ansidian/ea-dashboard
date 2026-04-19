import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import eventsView from "./eventsView.jsx";
import deadlinesView from "./deadlinesView.jsx";
import { DashboardProvider } from "../../../context/DashboardContext.jsx";

afterEach(() => {
  cleanup();
});

describe("calendar detail timeline", () => {
  it("renders event detail rows with all-day items first, timed items in order, and no source text", () => {
    render(
      eventsView.renderDetail({
        selectedDay: 19,
        viewYear: 2026,
        viewMonth: 3,
        items: [
          {
            id: "timed-late",
            title: "Later meeting",
            startMs: new Date("2026-04-19T18:00:00.000Z").getTime(),
            endMs: new Date("2026-04-19T18:30:00.000Z").getTime(),
            color: "#4285f4",
            source: "Work Calendar",
            location: "Room B",
            allDay: false,
          },
          {
            id: "all-day",
            title: "Offsite",
            startMs: new Date("2026-04-19T07:00:00.000Z").getTime(),
            endMs: new Date("2026-04-20T07:00:00.000Z").getTime(),
            color: "#34a853",
            source: "Work Calendar",
            allDay: true,
            duration: "All day",
          },
          {
            id: "timed-early",
            title: "Morning review",
            startMs: new Date("2026-04-19T16:00:00.000Z").getTime(),
            endMs: new Date("2026-04-19T16:30:00.000Z").getTime(),
            color: "#4285f4",
            source: "Work Calendar",
            location: "Room A",
            allDay: false,
          },
        ],
      }),
    );

    const rows = screen.getAllByTestId("timeline-detail-row").map((row) => row.textContent);
    expect(rows[0]).toContain("Offsite");
    expect(rows[1]).toContain("Morning review");
    expect(rows[2]).toContain("Later meeting");
    expect(screen.queryByText("Work Calendar")).toBeNull();
  });

  it("renders deadlines chronologically, uses End of day, de-emphasizes completed rows, and preserves popover opening", () => {
    const briefing = {
      emails: { accounts: [] },
      ctm: { upcoming: [] },
      todoist: {
        upcoming: [
          { id: "todo-1", title: "Open early", due_date: "2026-04-19", due_time: "9:00 AM", source: "todoist", class_name: "Inbox", status: "open" },
          { id: "todo-2", title: "Complete early", due_date: "2026-04-19", due_time: "9:00 AM", source: "todoist", class_name: "Inbox", status: "complete" },
          { id: "todo-3", title: "No time task", due_date: "2026-04-19", due_time: null, source: "todoist", class_name: "Inbox", status: "open" },
        ],
      },
    };

    render(
      <DashboardProvider briefing={briefing} setBriefing={() => {}} setCalendarDeadlines={() => {}}>
        {deadlinesView.renderDetail({
          selectedDay: 19,
          viewYear: 2026,
          viewMonth: 3,
          items: briefing.todoist.upcoming,
        })}
      </DashboardProvider>,
    );

    const rows = screen.getAllByTestId("timeline-detail-row");
    expect(rows[0].textContent).toContain("Open early");
    expect(rows[1].textContent).toContain("Complete early");
    expect(rows[2].textContent).toContain("End of day");
    expect(rows[1].getAttribute("data-complete")).toBe("true");

    fireEvent.click(rows[0]);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
