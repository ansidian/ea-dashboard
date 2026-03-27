import { useState } from "react";

export default function Tooltip({ text, children, style }) {
  const [visible, setVisible] = useState(false);

  if (!text) return children;

  return (
    <div
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      style={{ position: "relative", display: "inline-flex", ...style }}
    >
      {children}
      {visible && (
        <div style={{
          position: "absolute",
          bottom: "calc(100% + 6px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: "#1e293b",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6,
          padding: "6px 10px",
          fontSize: 11,
          color: "#e2e8f0",
          whiteSpace: "nowrap",
          zIndex: 50,
          pointerEvents: "none",
        }}>
          {text}
        </div>
      )}
    </div>
  );
}
