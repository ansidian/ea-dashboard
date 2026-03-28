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
      className="w-[380px] bg-elevated border border-white/10 rounded-lg shadow-modal px-5 py-4 animate-[fadeIn_0.2s_ease]"
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        zIndex: 9999,
        isolation: "isolate",
      }}
    >
      <p className="text-[13px] text-text-secondary leading-normal mb-3">
        {weather.summary}
      </p>
      <div className="flex justify-between">
        {(weather.hourly || []).map((h, i) => (
          <div key={i} className="text-center">
            <div className="text-[11px] text-text-muted mb-1.5">
              {h.time}
            </div>
            <div className="text-lg">{h.icon}</div>
            <div className="text-[13px] text-text-body mt-1 font-medium">
              {h.temp}&deg;
            </div>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
