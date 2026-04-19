import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

const mockApi = vi.hoisted(() => ({
  skipSchedule: vi.fn(),
}));

vi.mock("@/api", () => ({
  skipSchedule: mockApi.skipSchedule,
}));

const { default: BriefingSchedulesCard } = await import("./BriefingSchedulesCard.jsx");

function renderCard({ initialSettings, patch = vi.fn() } = {}) {
  function Harness() {
    const [settings, setSettings] = useState(initialSettings || {
      schedules: [{ label: "Morning", time: "08:00", enabled: true }],
    });
    return <BriefingSchedulesCard settings={settings} setSettings={setSettings} patch={patch} />;
  }

  return {
    patch,
    ...render(<Harness />),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockApi.skipSchedule.mockResolvedValue({ schedules: [{ label: "Morning", time: "08:00", enabled: true }] });
});

describe("BriefingSchedulesCard", () => {
  it("adds and removes schedules while persisting the updated payload", async () => {
    const patch = vi.fn();
    renderCard({ patch });

    fireEvent.click(screen.getByRole("button", { name: /\+ add schedule/i }));

    expect(screen.getByDisplayValue("New Schedule")).toBeTruthy();
    expect(patch).toHaveBeenLastCalledWith({
      schedules_json: [
        { label: "Morning", time: "08:00", enabled: true },
        { label: "New Schedule", time: "08:00", enabled: false },
      ],
    });

    fireEvent.click(screen.getAllByLabelText("Remove schedule")[1]);

    await waitFor(() => {
      expect(screen.queryByDisplayValue("New Schedule")).toBeNull();
    });
    expect(patch).toHaveBeenLastCalledWith({
      schedules_json: [{ label: "Morning", time: "08:00", enabled: true }],
    });
  });

  it("patches toggles and edited times", async () => {
    const patch = vi.fn();
    renderCard({ patch });

    fireEvent.click(screen.getByRole("switch", { name: /disable schedule/i }));
    expect(patch).toHaveBeenLastCalledWith({
      schedules_json: [{ label: "Morning", time: "08:00", enabled: false }],
    });

    const timeInput = screen.getByDisplayValue("08:00");
    fireEvent.focus(timeInput);
    fireEvent.change(timeInput, { target: { value: "07:30" } });
    fireEvent.blur(timeInput);

    await waitFor(() => {
      expect(patch).toHaveBeenLastCalledWith({
        schedules_json: [{ label: "Morning", time: "07:30", enabled: false }],
      });
    });
  });

  it("applies skip results returned by the API", async () => {
    mockApi.skipSchedule.mockResolvedValue({
      schedules: [
        {
          label: "Morning",
          time: "08:00",
          enabled: true,
          skipped_until: "2099-01-01T00:00:00.000Z",
        },
      ],
    });

    renderCard();

    fireEvent.click(screen.getByRole("button", { name: /skip today/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /skipped/i })).toBeTruthy();
    });
    expect(mockApi.skipSchedule).toHaveBeenCalledWith(0, true);
  });
});
