import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CalendarModal from "./CalendarModal.jsx";

const mockGetCalendarSources = vi.fn();

vi.mock("@/api", () => ({
  getCalendarSources: (...args) => mockGetCalendarSources(...args),
  createCalendarEvent: vi.fn(),
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
  getGmailAuthUrl: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockGetCalendarSources.mockResolvedValue({
    accounts: [
      {
        accountId: "gmail-main",
        accountLabel: "Google",
        accountEmail: "me@example.com",
        calendars: [{ id: "primary", summary: "Personal", writable: true, primary: true }],
      },
    ],
  });
});

function renderCalendarModalAtWidth(viewportWidth) {
  window.innerWidth = viewportWidth;

  return render(
    <CalendarModal
      open
      onClose={() => {}}
      view="events"
      onViewChange={() => {}}
      eventsData={{
        getEvents: () => [],
      }}
      billsData={{}}
      deadlinesData={{}}
    />,
  );
}

describe("CalendarModal responsive layout", () => {
  it("uses the wide desktop rail layout at 1900px", () => {
    renderCalendarModalAtWidth(1900);

    const panel = screen.getByTestId("calendar-modal-panel");
    const body = screen.getByTestId("calendar-modal-body");
    const rail = screen.getByTestId("calendar-modal-rail");

    expect(panel).toBeTruthy();
    expect(panel.style.width).toContain("calc(100vw - 80px)");
    expect(panel.style.maxWidth).toBe("1560px");
    expect(body.style.gridTemplateColumns).toContain("420px");
    expect(rail.style.position).toBe("sticky");
  });

  it("stacks the layout and disables sticky rail at 1240px", () => {
    renderCalendarModalAtWidth(1240);

    const body = screen.getByTestId("calendar-modal-body");
    const rail = screen.getByTestId("calendar-modal-rail");

    expect(body.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(rail.style.position).toBe("relative");
  });

  it("reflows when the viewport resizes after mount", () => {
    renderCalendarModalAtWidth(1900);

    const body = screen.getByTestId("calendar-modal-body");
    const rail = screen.getByTestId("calendar-modal-rail");
    const panel = screen.getByTestId("calendar-modal-panel");

    expect(body.style.gridTemplateColumns).toContain("420px");
    expect(rail.style.position).toBe("sticky");
    expect(panel.style.width).toContain("calc(100vw - 80px)");

    act(() => {
      window.innerWidth = 1240;
      window.dispatchEvent(new Event("resize"));
    });

    expect(body.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(rail.style.position).toBe("relative");
    expect(panel.style.width).toContain("calc(100vw - 48px)");
    expect(panel.style.maxWidth).toBe("1180px");
  });

  it("shows skeleton loaders while the events month is loading", () => {
    window.innerWidth = 1900;

    render(
      <CalendarModal
        open
        onClose={() => {}}
        view="events"
        onViewChange={() => {}}
        eventsData={{
          getEvents: () => [],
          isMonthLoading: () => true,
        }}
        billsData={{}}
        deadlinesData={{}}
      />,
    );

    expect(screen.getByTestId("calendar-events-grid-skeleton")).toBeTruthy();
    expect(screen.getByTestId("calendar-events-rail-skeleton")).toBeTruthy();
  });

  it("preserves a focused deadline day when the modal opens straight into a different view", () => {
    window.innerWidth = 1900;

    const { rerender } = render(
      <CalendarModal
        open={false}
        onClose={() => {}}
        view="events"
        onViewChange={() => {}}
        eventsData={{ getEvents: () => [] }}
        billsData={{}}
        deadlinesData={{
          ctm: {
            upcoming: [
              { id: "deadline-1", title: "Project due", due_date: "2026-04-20", status: "open" },
            ],
          },
        }}
      />,
    );

    rerender(
      <CalendarModal
        open
        onClose={() => {}}
        view="deadlines"
        onViewChange={() => {}}
        focusDate="2026-04-20"
        eventsData={{ getEvents: () => [] }}
        billsData={{}}
        deadlinesData={{
          ctm: {
            upcoming: [
              { id: "deadline-1", title: "Project due", due_date: "2026-04-20", status: "open" },
            ],
          },
        }}
      />,
    );

    expect(screen.getByText("Monday, April 20")).toBeTruthy();
    expect(screen.getAllByText("Project due").length).toBeGreaterThan(0);
  });

  it("allows selecting empty days and shows a date-specific empty rail", async () => {
    window.innerWidth = 1900;

    render(
      <CalendarModal
        open
        onClose={() => {}}
        view="events"
        onViewChange={() => {}}
        focusDate="2026-04-20"
        eventsData={{ getEvents: () => [] }}
        billsData={{}}
        deadlinesData={{}}
      />,
    );

    fireEvent.click(screen.getByText("20"));

    expect(await screen.findByText("Monday, April 20")).toBeTruthy();
    expect(screen.getByText(/no events on this day yet/i)).toBeTruthy();
  });

  it("blocks modal hotkeys while typing in the editor", async () => {
    window.innerWidth = 1900;
    const onClose = vi.fn();

    render(
      <CalendarModal
        open
        onClose={onClose}
        view="events"
        onViewChange={() => {}}
        focusDate="2026-04-20"
        eventsData={{
          editable: true,
          getEvents: () => [],
        }}
        billsData={{}}
        deadlinesData={{}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /new event/i }));
    const title = await screen.findByTestId("calendar-event-title");
    title.focus();

    fireEvent.keyDown(title, { key: "ArrowRight" });
    fireEvent.keyDown(title, { key: "r" });
    fireEvent.keyDown(title, { key: "t" });

    expect(screen.getByTestId("calendar-event-editor-rail")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("refetches the visible events month when the open modal gets a refreshed eventsData object", async () => {
    window.innerWidth = 1900;
    const ensureRange = vi.fn().mockResolvedValue([]);

    const { rerender } = render(
      <CalendarModal
        open
        onClose={() => {}}
        view="events"
        onViewChange={() => {}}
        focusDate="2026-04-20"
        eventsData={{
          editable: true,
          ensureRange,
          getEvents: () => [],
          revision: 0,
        }}
        billsData={{}}
        deadlinesData={{}}
      />,
    );

    await waitFor(() => {
      expect(ensureRange).toHaveBeenCalledTimes(1);
    });

    rerender(
      <CalendarModal
        open
        onClose={() => {}}
        view="events"
        onViewChange={() => {}}
        focusDate="2026-04-20"
        eventsData={{
          editable: true,
          ensureRange,
          getEvents: () => [],
          revision: 1,
        }}
        billsData={{}}
        deadlinesData={{}}
      />,
    );

    await waitFor(() => {
      expect(ensureRange).toHaveBeenCalledTimes(2);
    });
  });
});
