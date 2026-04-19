import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardProvider } from "../context/DashboardContext.jsx";
import { MemoryRouter } from "react-router-dom";

let mockIsMobile = false;
let mockCustomize = null;

vi.mock("../hooks/useIsMobile", () => ({
  default: () => mockIsMobile,
}));

vi.mock("../hooks/useCustomize", () => ({
  default: () => mockCustomize,
}));

vi.mock("../components/calendar/CalendarModal", () => ({
  default: function CalendarModalMock({ open }) {
    return <div data-testid="calendar-modal">{open ? "open" : "closed"}</div>;
  },
}));

vi.mock("../components/briefing/BriefingHistoryPanel", () => ({
  default: function BriefingHistoryPanelMock() {
    return null;
  },
}));

vi.mock("../components/shell/CommandPalette", () => ({
  default: function CommandPaletteMock() {
    return null;
  },
}));

vi.mock("../components/shell/CustomizePanel", () => ({
  default: function CustomizePanelMock() {
    return null;
  },
}));

vi.mock("../components/inbox/InboxView", () => ({
  default: function InboxViewMock() {
    return <div data-testid="inbox-view" />;
  },
}));

vi.mock("../components/dashboard/DeadlineDetailPopover", () => ({
  default: function DeadlineDetailPopoverMock() {
    return null;
  },
}));

const { RedesignShell } = await import("./Dashboard.jsx");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockCustomize = {
    dashboardLayout: "command",
    density: "comfortable",
    showInsights: true,
    showInboxPeek: true,
    accent: "#cba6da",
  };
});

function makeBriefing() {
  return {
    aiInsights: [],
    emails: {
      summary: "Brief summary",
      accounts: [
        {
          important: [
            {
              id: "email-1",
              subject: "Subject",
              from: "Alex",
              date: "2026-04-19T15:30:00.000Z",
              read: false,
            },
          ],
          unread: 1,
        },
      ],
    },
    weather: { temp: 71, condition: "Sunny", city: "Los Angeles" },
    ctm: { upcoming: [] },
    todoist: { upcoming: [] },
  };
}

function makeProps() {
  return {
    bd: {
      briefing: makeBriefing(),
      schedules: [{ enabled: true, hour: 9, minute: 0 }],
      refreshing: false,
      generating: false,
      genProgress: null,
      viewingPast: null,
      latestId: "latest",
      handleQuickRefresh: vi.fn(),
      selectHistory: vi.fn(),
    },
    liveData: {
      actualConfigured: true,
      liveEmails: [],
      liveWeather: { temp: 71, condition: "Sunny", city: "Los Angeles" },
      liveBills: [],
      allSchedules: [],
      recentTransactions: [],
      payeeMap: {},
      actualBudgetUrl: "",
      pinnedIds: [],
      pinnedSnapshots: {},
      snoozedEntries: [],
      resurfacedEntries: [],
      briefingGeneratedAt: null,
      refreshNow: vi.fn(),
    },
    calendarRange: {
      ensureRange: vi.fn().mockResolvedValue([]),
      getEvents: vi.fn(),
      hasMonth: vi.fn(),
      isMonthLoading: vi.fn(),
      loading: false,
      error: null,
    },
    refreshHold: {
      holdProgress: 0,
      showConfirm: false,
      startHold: vi.fn(),
      endHold: vi.fn(),
      setShowConfirm: vi.fn(),
    },
    handleFullGeneration: vi.fn(),
    historyOpen: false,
    setHistoryOpen: vi.fn(),
    historyTriggerRef: { current: null },
    calendarDeadlines: null,
    loadCalendarDeadlines: vi.fn(),
  };
}

function renderShell() {
  const props = makeProps();
  return render(
    <MemoryRouter>
      <DashboardProvider briefing={props.bd.briefing} setBriefing={() => {}} setCalendarDeadlines={() => {}}>
        <RedesignShell {...props} />
      </DashboardProvider>
    </MemoryRouter>,
  );
}

describe("RedesignShell mobile behavior", () => {
  it("hides mobile calendar entry points and ignores the calendar hotkey", () => {
    mockIsMobile = true;
    renderShell();

    expect(screen.getByTestId("shell-header-mobile")).toBeTruthy();
    expect(screen.queryByTestId("calendar-modal")).toBeNull();
    expect(screen.queryByTestId("shell-header-next-briefing")).toBeNull();
    expect(screen.queryByText("Jump to anything")).toBeNull();

    fireEvent.click(screen.getByLabelText("Open more actions"));
    expect(screen.queryByText("Calendar")).toBeNull();

    fireEvent.keyDown(window, { key: "c" });
    expect(screen.queryByTestId("calendar-modal")).toBeNull();
  });

  it("keeps calendar available on desktop and opens it from the hotkey", () => {
    mockIsMobile = false;
    renderShell();

    expect(screen.getByTestId("shell-header-desktop")).toBeTruthy();
    expect(screen.getByTestId("calendar-modal").textContent).toBe("closed");

    fireEvent.keyDown(window, { key: "c" });
    expect(screen.getByTestId("calendar-modal").textContent).toBe("open");
  });
});
