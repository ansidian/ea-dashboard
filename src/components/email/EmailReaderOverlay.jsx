import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import useIsMobile from "../../hooks/useIsMobile";
import BottomSheet from "../ui/BottomSheet";
import EmailReader from "./EmailReader";

// Centered portal overlay that summons the EmailReader from anywhere in the
// dashboard. On mobile, delegates presentation to BottomSheet (drag-to-
// dismiss, safe-area padding). On desktop, renders a centered floating
// panel using the floating-panel pattern documented in CLAUDE.md.
//
// Props:
//  - open: whether the overlay is rendered. When false, returns null.
//  - email: the email to display. Required when open is true.
//  - onClose: called when user presses Esc, clicks backdrop, or clicks the
//    header close button.
//  - navigation: forwarded to EmailReader. Parent owns the flat list and
//    decides what "next" / "prev" means. This component also wires the
//    ArrowUp/ArrowDown keyboard shortcuts to navigation.onPrev/onNext.
//  - triage: forwarded to EmailReader. Omit on views without Claude analysis.
//  - actions: forwarded to EmailReader. Footer action slot (e.g. Trash).
//  - onMarkedRead / onMarkedUnread: forwarded to EmailReader.
//  - onLoaded: forwarded to EmailReader (fires when body finishes loading).
//  - showManualBillForm: forwarded to EmailReader.
export default function EmailReaderOverlay({
  open,
  email,
  onClose,
  navigation,
  accountNav,
  triage,
  headerActions,
  actions,
  onMarkedRead,
  onMarkedUnread,
  onLoaded,
  showManualBillForm,
}) {
  const isMobile = useIsMobile();
  const panelRef = useRef(null);
  const scrollBodyRef = useRef(null);

  // Esc closes; ↑/↓ cycle through the flat list via navigation.onPrev/onNext.
  useEffect(() => {
    if (!open) return;
    function handleKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === "ArrowDown" && navigation?.onNext) {
        e.preventDefault();
        if (navigation.hasNext !== false) navigation.onNext();
      } else if (e.key === "ArrowUp" && navigation?.onPrev) {
        e.preventDefault();
        if (navigation.hasPrev !== false) navigation.onPrev();
      } else if (e.key === "ArrowLeft" && accountNav?.onPrev) {
        e.preventDefault();
        accountNav.onPrev();
      } else if (e.key === "ArrowRight" && accountNav?.onNext) {
        e.preventDefault();
        accountNav.onNext();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, navigation, accountNav]);

  // Lock body scroll on desktop so the dashboard behind doesn't chase the
  // overlay. BottomSheet handles its own scroll locking on mobile.
  useEffect(() => {
    if (!open || isMobile) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open, isMobile]);

  // Scroll containment: prevent wheel scrolling from leaking to the page
  // behind when the reader body is at the top or bottom boundary. Inline
  // style overscrollBehavior: contain handles the trackpad inertia case;
  // this listener catches the wheel-at-boundary case for explicit mice.
  const attachScrollTrap = useCallback((el) => {
    scrollBodyRef.current = el;
    if (!el) return;
    function handleWheel(e) {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
    }
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  // Click-outside-to-close on desktop. Skip on mobile — BottomSheet owns
  // backdrop interaction.
  useEffect(() => {
    if (!open || isMobile) return;
    function handleClick(e) {
      if (panelRef.current?.contains(e.target)) return;
      onClose?.();
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open, isMobile, onClose]);

  if (!open || !email) return null;

  if (isMobile) {
    return (
      // Reader needs far more vertical space than search/history panels —
      // long HTML emails are the primary content, not a list. 92vh leaves
      // just enough room for the drag handle + status bar. `height` (not
      // `maxHeight`) is load-bearing: EmailReader fills its parent via
      // flex-1 / h-full, which only resolves against a definite height.
      <BottomSheet open onClose={onClose} height="92vh">
        <EmailReader
          email={email}
          triage={triage}
          navigation={navigation}
          headerActions={headerActions}
          actions={actions}
          onMarkedRead={onMarkedRead}
          onMarkedUnread={onMarkedUnread}
          onLoaded={onLoaded}
          showManualBillForm={showManualBillForm}
        />
      </BottomSheet>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center animate-in fade-in duration-150"
      style={{
        background: "rgba(0,0,0,0.55)",
        isolation: "isolate",
      }}
    >
      <div
        ref={panelRef}
        className="flex flex-col min-h-0 animate-in zoom-in-95 duration-150"
        style={{
          position: "relative",
          // Matches the search reader's desktop footprint: the two-pane
          // search panel (380 list + 720 reader) tops out around 1100px
          // wide, with the reader itself filling most of the viewport
          // height. Standalone reader gets the same generous envelope so
          // long HTML emails have room to breathe without needing to scroll
          // every few lines.
          width: "min(960px, calc(100vw - 48px))",
          height: "calc(100vh - 48px)",
          background: "#16161e",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 20px 60px rgba(0,0,0,0.7), 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
          overflow: "hidden",
          overscrollBehavior: "contain",
        }}
      >
        {/* Wrap the EmailReader in a scroll-trap container. EmailReader's
            internal body scroller is the actual scrollable element; we pass
            the wheel-trap ref through a child div. */}
        <EmailReaderWithScrollTrap
          email={email}
          triage={triage}
          navigation={navigation}
          headerActions={headerActions}
          actions={actions}
          onMarkedRead={onMarkedRead}
          onMarkedUnread={onMarkedUnread}
          onLoaded={onLoaded}
          showManualBillForm={showManualBillForm}
          onClose={onClose}
          onScrollElReady={attachScrollTrap}
        />
      </div>
    </div>,
    document.body,
  );
}

// Thin wrapper that locates EmailReader's scrollable body element via a ref
// callback, so the overlay's wheel-boundary trap can attach to it. The body
// is the inner flex-1 overflow-y-auto div inside EmailReader.
function EmailReaderWithScrollTrap({ onScrollElReady, ...readerProps }) {
  const wrapperRef = useCallback(
    (node) => {
      if (!node) return;
      // EmailReader's body scroller is the div with class flex-1 overflow-y-auto
      const scrollEl = node.querySelector(".flex-1.overflow-y-auto");
      onScrollElReady?.(scrollEl);
    },
    [onScrollElReady],
  );
  return (
    <div ref={wrapperRef} className="flex flex-col min-h-0 flex-1">
      <EmailReader {...readerProps} />
    </div>
  );
}
