import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CalendarModal from "./CalendarModal.jsx";

const mockGetCalendarSources = vi.fn();
const mockCreateCalendarEvent = vi.fn();
const mockUpdateCalendarEvent = vi.fn();
const mockDeleteCalendarEvent = vi.fn();
const mockGetGmailAuthUrl = vi.fn();

vi.mock("@/api", () => ({
  getCalendarSources: (...args) => mockGetCalendarSources(...args),
  createCalendarEvent: (...args) => mockCreateCalendarEvent(...args),
  updateCalendarEvent: (...args) => mockUpdateCalendarEvent(...args),
  deleteCalendarEvent: (...args) => mockDeleteCalendarEvent(...args),
  getGmailAuthUrl: (...args) => mockGetGmailAuthUrl(...args),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  window.innerWidth = 1600;
  mockGetCalendarSources.mockResolvedValue({
    accounts: [
      {
        accountId: "gmail-main",
        accountLabel: "Google",
        accountEmail: "me@example.com",
        calendars: [
          {
            id: "primary",
            summary: "Personal",
            accessRole: "owner",
            primary: true,
            writable: true,
          },
        ],
      },
    ],
  });
});

function renderModal({
  events = [],
  focusDate = "2026-04-20",
  refreshRange = vi.fn().mockResolvedValue([]),
} = {}) {
  const utils = render(
    <CalendarModal
      open
      onClose={() => {}}
      view="events"
      onViewChange={() => {}}
      focusDate={focusDate}
      eventsData={{
        editable: true,
        getEvents: () => events,
        refreshRange,
      }}
      billsData={{}}
      deadlinesData={{}}
    />,
  );
  return { ...utils, refreshRange };
}

describe("Calendar event editor rail", () => {
  it("opens from the header action and creates an event", async () => {
    const { refreshRange } = renderModal();
    mockCreateCalendarEvent.mockResolvedValue({
      event: {
        id: "event-1",
        title: "Planning block",
        accountId: "gmail-main",
        calendarId: "primary",
        startMs: new Date("2026-04-20T16:00:00.000Z").getTime(),
        endMs: new Date("2026-04-20T16:30:00.000Z").getTime(),
        writable: true,
        allDay: false,
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /new event/i }));

    expect(await screen.findByTestId("calendar-event-editor-rail")).toBeTruthy();
    fireEvent.input(screen.getByTestId("calendar-event-title"), {
      target: { value: "Planning block" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("calendar-event-title").value).toBe("Planning block");
      expect(screen.getByTestId("calendar-event-source").value).toBe("gmail-main::primary");
    });
    await waitFor(() => {
      expect(screen.getByTestId("calendar-event-save").disabled).toBe(false);
    });
    fireEvent.click(screen.getByTestId("calendar-event-save"));

    await waitFor(() => {
      expect(mockCreateCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({
        title: "Planning block",
        accountId: "gmail-main",
        calendarId: "primary",
        startDate: "2026-04-20",
      }));
    });
    expect(refreshRange).toHaveBeenCalledWith("2026-04-20", "2026-04-20");
  });

  it("opens writable event rows in edit mode and deletes only after confirmation", async () => {
    const event = {
      id: "event-1",
      etag: '"etag-1"',
      title: "Writable meeting",
      accountId: "gmail-main",
      calendarId: "primary",
      startMs: new Date("2026-04-20T16:00:00.000Z").getTime(),
      endMs: new Date("2026-04-20T16:30:00.000Z").getTime(),
      writable: true,
      isRecurring: false,
      allDay: false,
      htmlLink: "https://calendar.google.com",
    };
    const { refreshRange } = renderModal({ events: [event] });

    fireEvent.click(await screen.findByText("Writable meeting"));
    await waitFor(() => {
      expect(screen.getAllByText("Writable meeting").length).toBeGreaterThan(1);
    });
    fireEvent.click(screen.getAllByText("Writable meeting")[1]);
    expect(await screen.findByTestId("calendar-event-editor-rail")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId("calendar-event-delete")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("calendar-event-delete"));
    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByText("Confirm delete")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("Confirm delete"));
    await waitFor(() => {
      expect(mockDeleteCalendarEvent).toHaveBeenCalledWith("event-1", {
        accountId: "gmail-main",
        calendarId: "primary",
        etag: '"etag-1"',
      });
    });
    expect(refreshRange).toHaveBeenCalledWith("2026-04-20", "2026-04-20");
  });

  it("keeps recurring events in detail view instead of opening edit mode", async () => {
    renderModal({
      events: [
        {
          id: "recurring-1",
          title: "Weekly sync",
          accountId: "gmail-main",
          calendarId: "primary",
          startMs: new Date("2026-04-20T16:00:00.000Z").getTime(),
          endMs: new Date("2026-04-20T16:30:00.000Z").getTime(),
          writable: true,
          isRecurring: true,
          allDay: false,
          htmlLink: "https://calendar.google.com",
        },
      ],
    });

    fireEvent.click(await screen.findByText("Weekly sync"));
    expect(screen.queryByTestId("calendar-event-editor-rail")).toBeNull();
    expect(await screen.findByRole("link", { name: /open in google calendar/i })).toBeTruthy();
  });

  it("blocks save and shows inline validation for invalid end times", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: /new event/i }));
    expect(await screen.findByTestId("calendar-event-editor-rail")).toBeTruthy();

    fireEvent.input(screen.getByTestId("calendar-event-title"), {
      target: { value: "Planning block" },
    });
    await waitFor(() => {
      expect(screen.getByTestId("calendar-event-title").value).toBe("Planning block");
      expect(screen.getByTestId("calendar-event-source").value).toBe("gmail-main::primary");
    });

    fireEvent.click(screen.getByTestId("calendar-event-start-time"));
    fireEvent.click(await screen.findByRole("button", { name: /set start time/i }));
    fireEvent.click(screen.getByTestId("calendar-event-end-time"));
    fireEvent.click(await screen.findByRole("button", { name: /set end time/i }));

    fireEvent.click(screen.getByTestId("calendar-event-start-time"));
    fireEvent.change(screen.getByLabelText("hour"), { target: { value: "9" } });
    fireEvent.blur(screen.getByLabelText("hour"));
    fireEvent.click(await screen.findByRole("button", { name: /set start time/i }));

    fireEvent.click(screen.getByTestId("calendar-event-end-time"));
    fireEvent.change(screen.getByLabelText("hour"), { target: { value: "8" } });
    fireEvent.blur(screen.getByLabelText("hour"));
    fireEvent.click(await screen.findByRole("button", { name: /set end time/i }));

    await waitFor(() => {
      expect(screen.getByTestId("calendar-event-validation").textContent).toMatch(/end time/i);
    });
    expect(screen.getByTestId("calendar-event-save").disabled).toBe(true);
    expect(mockCreateCalendarEvent).not.toHaveBeenCalled();
  });
});
