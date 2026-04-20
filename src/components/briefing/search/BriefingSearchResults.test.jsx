import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemo, useRef, useState } from "react";
import BriefingSearchResults, { BriefingSearchMobileSheet } from "./BriefingSearchResults.jsx";
import BriefingSearchDesktopPanel from "./BriefingSearchDesktopPanel.jsx";

vi.mock("../../email/EmailReader", () => ({
  default: function EmailReaderMock({ email, onClose }) {
    return (
      <div data-testid="search-email-reader">
        <div>{email.subject}</div>
        <button type="button" onClick={onClose}>Close reader</button>
      </div>
    );
  },
}));

function SearchEmailHarness() {
  const [open, setOpen] = useState(true);
  const [openEmail, setOpenEmail] = useState(null);
  const inputRef = useRef({ blur() {} });

  return (
    <>
      <button type="button" onClick={() => setOpenEmail({ uid: "email-1", subject: "Search email" })}>
        Open search email
      </button>
      {open ? (
        <BriefingSearchMobileSheet
          openEmail={openEmail}
          setOpen={setOpen}
          setOpenEmail={setOpenEmail}
          inputRef={inputRef}
          showBillForm={false}
          setShowBillForm={() => {}}
          onMarkedRead={() => {}}
          onMarkedUnread={() => {}}
        >
          <div data-testid="search-results-body">Results body</div>
        </BriefingSearchMobileSheet>
      ) : (
        <div data-testid="search-sheet-closed">Search closed</div>
      )}
    </>
  );
}

function SearchDesktopHarness() {
  const [openEmail, setOpenEmail] = useState(null);
  const panelRef = useRef(null);
  const pos = useMemo(() => ({ top: 24, left: 24, width: 360 }), []);

  return (
    <>
      <button type="button" onClick={() => setOpenEmail({ uid: "email-1", subject: "Desktop search email" })}>
        Open desktop email
      </button>
      <BriefingSearchDesktopPanel
        panelRef={panelRef}
        pos={pos}
        openEmail={openEmail}
        setOpenEmail={setOpenEmail}
        showBillForm={false}
        setShowBillForm={() => {}}
        onMarkedRead={() => {}}
        onMarkedUnread={() => {}}
      >
        <BriefingSearchResults
          isMobile={false}
          inputRef={{ current: null }}
          scrollRef={{ current: null }}
          isEmailQuery
          rawEmailHasResults
          emailFilter="all"
          totalUnread={0}
          onFilterChange={() => {}}
          error={null}
          searching={false}
          results={null}
          emailResults={{ accounts: [] }}
          hasResults
          query="project"
          emailHasResults
          filteredEmailResults={{
            accounts: [
              {
                account_id: "acct-1",
                account_label: "Primary",
                account_icon: "gmail",
                account_color: "#cba6da",
                results: [{ uid: "email-1", subject: "Desktop search email", read: false }],
              },
            ],
          }}
          flatEmails={[{ uid: "email-1" }]}
          focusedIdx={0}
          openEmailUid={openEmail?.uid ?? null}
          relevant={[]}
          grouped={{}}
          sortedDates={[]}
          expandedId={null}
          expandedCtx={null}
          loadingCtx={null}
          analysis={null}
          analyzing={false}
          onAnalyze={() => {}}
          onFocusChange={() => {}}
          onOpenEmail={() => setOpenEmail({ uid: "email-1", subject: "Desktop search email" })}
          onExpand={() => {}}
          onEmailClick={() => {}}
        />
      </BriefingSearchDesktopPanel>
    </>
  );
}

describe("Briefing search browser back", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

  it("returns from mobile email detail to results, then closes the sheet", async () => {
    render(<SearchEmailHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open search email" }));
    expect(await screen.findByTestId("search-email-reader")).toBeTruthy();

    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("search-email-reader")).toBeNull();
      expect(screen.getByTestId("search-results-body")).toBeTruthy();
    });

    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.getByTestId("search-sheet-closed")).toBeTruthy();
    });
  });

  it("returns from desktop email detail to the results list", async () => {
    render(<SearchDesktopHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Open desktop email" }));
    expect(await screen.findByTestId("search-email-reader")).toBeTruthy();

    await act(async () => {
      window.history.back();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("search-email-reader")).toBeNull();
      expect(screen.getByText("Desktop search email")).toBeTruthy();
    });
  });
});
