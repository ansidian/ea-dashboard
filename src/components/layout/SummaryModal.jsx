import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export default function SummaryModal({ badgeType, title, accentColor, onClose, children }) {
  const backdropRef = useRef(null);
  const panelRef = useRef(null);

  // close on Escape
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  function handleBackdropClick(e) {
    // don't dismiss if click landed inside a context menu portal
    if (e.target.closest("[data-context-menu]")) return;
    if (e.target === backdropRef.current) onClose();
  }

  return createPortal(
    <div
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "fadeIn 150ms ease",
      }}
    >
      <div
        ref={panelRef}
        style={{
          background: "#16161e",
          borderRadius: 12,
          border: "1px solid rgba(203,166,218,0.10)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
          width: "100%",
          maxWidth: 560,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "scaleIn 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                letterSpacing: "2.5px",
                textTransform: "uppercase",
                fontWeight: 600,
                color: "rgba(205,214,244,0.4)",
              }}
            >
              {title}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "rgba(205,214,244,0.3)",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              transition: "color 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(205,214,244,0.7)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(205,214,244,0.3)"; }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          data-modal-scroll
          style={{
            padding: "12px 20px 20px",
            overflowY: "auto",
            overscrollBehavior: "contain",
            flex: 1,
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
