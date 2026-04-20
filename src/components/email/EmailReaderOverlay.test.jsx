import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import EmailReaderOverlay from "./EmailReaderOverlay.jsx";

vi.mock("../../hooks/useIsMobile", () => ({
  default: () => false,
}));

vi.mock("./EmailReader", () => ({
  default: function EmailReaderMock({ email, onClose }) {
    return (
      <div data-testid="overlay-email-reader">
        <div>{email.subject}</div>
        <button type="button" onClick={onClose}>Close overlay</button>
      </div>
    );
  },
}));

function OverlayHarness() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open overlay</button>
      <EmailReaderOverlay
        open={open}
        email={open ? { uid: "email-1", subject: "Overlay email" } : null}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

describe("EmailReaderOverlay browser back", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

  it("closes the overlay when browser back is pressed", async () => {
    render(<OverlayHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open overlay" }));
    expect(await screen.findByTestId("overlay-email-reader")).toBeTruthy();

    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("overlay-email-reader")).toBeNull();
    });
  });
});
