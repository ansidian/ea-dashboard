import { ChevronDown, ChevronUp, Mail } from "lucide-react";
import { Kbd } from "../primitives";

export function MobileSection({ title, accent, open, onToggle, children, testId }) {
  return (
    <div
      data-testid={testId}
      style={{
        margin: "14px 16px 0",
        borderRadius: 12,
        background: "rgba(24,24,37,0.72)",
        border: `1px solid ${accent}22`,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 14px",
          border: "none",
          background: "transparent",
          color: "#fff",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.8,
            textTransform: "uppercase",
            color: accent,
          }}
        >
          {title}
        </span>
        <span style={{ flex: 1 }} />
        {open ? (
          <ChevronUp size={16} color="rgba(205,214,244,0.6)" />
        ) : (
          <ChevronDown size={16} color="rgba(205,214,244,0.6)" />
        )}
      </button>
      {open && <div style={{ padding: "0 0 14px" }}>{children}</div>}
    </div>
  );
}

export function ReaderEmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 10,
        color: "rgba(205,214,244,0.35)",
        background: "rgba(22,22,30,0.5)",
      }}
    >
      <Mail size={32} color="rgba(205,214,244,0.15)" />
      <div style={{ fontSize: 12 }}>Select an email</div>
      <div style={{ fontSize: 10, color: "rgba(205,214,244,0.3)" }}>
        <Kbd>J</Kbd> <Kbd>K</Kbd> to navigate
      </div>
    </div>
  );
}
