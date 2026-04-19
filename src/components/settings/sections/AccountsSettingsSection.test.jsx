import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockApi = vi.hoisted(() => ({
  addICloudAccount: vi.fn(),
  geocodeLocation: vi.fn(),
  getAccounts: vi.fn(),
  getGmailAuthUrl: vi.fn(),
  removeAccount: vi.fn(),
  testActualBudget: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@/api", () => ({
  addICloudAccount: mockApi.addICloudAccount,
  geocodeLocation: mockApi.geocodeLocation,
  getAccounts: mockApi.getAccounts,
  getGmailAuthUrl: mockApi.getGmailAuthUrl,
  removeAccount: mockApi.removeAccount,
  testActualBudget: mockApi.testActualBudget,
  updateSettings: mockApi.updateSettings,
}));

const { default: AccountsSettingsSection } = await import("./AccountsSettingsSection.jsx");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockApi.geocodeLocation.mockResolvedValue([
    { name: "Los Angeles, CA", lat: 34.0522, lng: -118.2437 },
    { name: "Los Angeles County, CA", lat: 34.155, lng: -118.25 },
  ]);
  mockApi.getAccounts.mockResolvedValue([]);
});

describe("AccountsSettingsSection", () => {
  it("patches the selected weather geocode result", async () => {
    const patch = vi.fn();

    render(
      <AccountsSettingsSection
        accounts={[]}
        setAccounts={vi.fn()}
        settings={{}}
        patch={patch}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("El Monte, CA"), {
      target: { value: "Los Angeles" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText("Los Angeles, CA")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /los angeles, ca/i }));

    await waitFor(() => {
      expect(patch).toHaveBeenCalledWith({
        weather_location: "Los Angeles, CA",
        weather_lat: 34.0522,
        weather_lng: -118.2437,
      });
    });
    expect(screen.getByText("34.0522, -118.2437")).toBeTruthy();
  });
});
