import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

export default function WeatherTooltip({ weather, triggerRef, onMouseEnter, onMouseLeave }) {
  const [pos, setPos] = useState(null);
  const panelRef = useRef(null);

  const updatePos = useCallback(() => {
    if (!triggerRef?.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    });
  }, [triggerRef]);

  useEffect(() => {
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [updatePos]);

  if (!pos || !weather) return null;

  return createPortal(
    <div
      ref={panelRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        width: 380,
        background: "#16161e",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset",
        zIndex: 9999,
        isolation: "isolate",
        padding: "16px 20px",
        animation: "fadeIn 0.2s ease",
      }}
    >
      <p
        style={{
          fontSize: 13,
          color: "#94a3b8",
          margin: "0 0 12px 0",
          lineHeight: 1.5,
        }}
      >
        {weather.summary}
      </p>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        {(weather.hourly || []).map((h, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
              {h.time}
            </div>
            <div style={{ fontSize: 18 }}>{h.icon}</div>
            <div
              style={{
                fontSize: 13,
                color: "#e2e8f0",
                marginTop: 4,
                fontWeight: 500,
              }}
            >
              {h.temp}°
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
