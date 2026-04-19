import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { DollarSign } from "lucide-react";
import EmailReader from "../../email/EmailReader";

export default function BriefingSearchDesktopPanel({
  panelRef,
  pos,
  openEmail,
  setOpenEmail,
  showBillForm,
  setShowBillForm,
  onMarkedRead,
  onMarkedUnread,
  children,
}) {
  if (!pos) return null;

  const RESULTS_COLLAPSED_WIDTH = 380;
  const EMAIL_PANE_WIDTH = 720;
  const VIEWPORT_MARGIN = 16;
  const baseWidth = pos.width;
  const resultsWidth = openEmail
    ? Math.min(baseWidth, RESULTS_COLLAPSED_WIDTH)
    : baseWidth;
  const expandedWidth = openEmail
    ? Math.min(
      Math.max(baseWidth, resultsWidth + EMAIL_PANE_WIDTH),
      window.innerWidth - VIEWPORT_MARGIN * 2,
    )
    : baseWidth;
  const maxLeft = window.innerWidth - expandedWidth - VIEWPORT_MARGIN;
  const finalLeft = Math.max(
    VIEWPORT_MARGIN,
    Math.min(pos.left, maxLeft),
  );
  const expandedHeight = openEmail
    ? `calc(100vh - ${pos.top + VIEWPORT_MARGIN}px)`
    : undefined;
  const expandedMaxHeight = openEmail
    ? undefined
    : `min(480px, calc(100vh - ${pos.top + VIEWPORT_MARGIN}px))`;

  return createPortal(
    <div
      ref={panelRef}
      className="z-[9999] isolate flex flex-row animate-in fade-in slide-in-from-top-1 duration-200"
      style={{
        position: "fixed",
        top: pos.top,
        left: finalLeft,
        width: expandedWidth,
        height: expandedHeight,
        maxHeight: expandedMaxHeight,
        background: "linear-gradient(180deg, #24243a 0%, #1e1e2e 100%)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow:
          "0 8px 40px rgba(0,0,0,0.55), 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
        transition:
          "width 200ms ease, left 200ms ease, height 200ms ease, max-height 200ms ease",
        overflow: "hidden",
      }}
    >
      <div
        className="flex flex-col min-h-0 shrink-0"
        style={{
          width: resultsWidth,
          transition: "width 200ms ease",
        }}
      >
        {children}
      </div>

      {openEmail && (
        <div
          className="relative flex flex-col min-h-0 flex-1 animate-in fade-in duration-150"
          style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}
        >
          <EmailReader
            email={openEmail}
            onMarkedRead={onMarkedRead}
            onMarkedUnread={onMarkedUnread}
            onClose={() => setOpenEmail(null)}
            showManualBillForm={showBillForm}
            headerActions={
              <button
                type="button"
                onClick={() => setShowBillForm((value) => !value)}
                className={cn(
                  "flex items-center gap-1 text-[10px] transition-colors px-2 py-1 cursor-pointer font-[inherit]",
                  showBillForm
                    ? "text-[#a6e3a1] bg-[#a6e3a1]/[0.08] hover:bg-[#a6e3a1]/[0.12]"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.04]",
                )}
                style={{ borderRadius: 8 }}
                aria-label={showBillForm ? "Hide bill form" : "Add bill"}
                title={showBillForm ? "Hide bill form" : "Add bill"}
              >
                <DollarSign size={11} />
                <span className="hidden md:inline">{showBillForm ? "Hide bill" : "Add bill"}</span>
              </button>
            }
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
