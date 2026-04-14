import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/lib/icons.jsx";

const BAR_COLOR = "#cba6da";
const BAR_COLOR_FADED = "rgba(203,166,218,0.25)";

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

  const hourly = weather.hourly || [];
  const temps = hourly.map(h => h.temp);
  const minTemp = Math.min(...temps, weather.low);
  const maxTemp = Math.max(...temps, weather.high);
  const tempRange = Math.max(maxTemp - minTemp, 1);

  return createPortal(
    <div
      ref={panelRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="w-[380px] animate-in fade-in slide-in-from-top-1 duration-200"
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        zIndex: 9999,
        isolation: "isolate",
        background: "linear-gradient(180deg, #24243a 0%, #1e1e2e 100%)",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 8px 40px rgba(0,0,0,0.55), 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Header — location + summary */}
      <div
        style={{
          padding: "12px 20px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {weather.location && (
          <div className="text-[10px] tracking-[1.5px] uppercase text-muted-foreground/50 font-semibold mb-1.5">
            {weather.location}
          </div>
        )}
        <p className="text-[12px] text-foreground/70 leading-relaxed m-0">
          {weather.summary}
        </p>
      </div>

      {/* Hourly forecast — bar chart */}
      <div style={{ padding: "16px 20px 12px" }}>
        <div className="flex items-end justify-between gap-1">
          {hourly.map((h, i) => {
            const normalized = (h.temp - minTemp) / tempRange;
            const barHeight = 16 + normalized * 40; // 16px min, 56px max
            const isHighest = h.temp === maxTemp;
            const isLowest = h.temp === minTemp;

            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                {/* Temp label */}
                <div
                  className="text-[11px] font-medium tabular-nums"
                  style={{
                    color: isHighest || isLowest ? BAR_COLOR : "rgba(205,214,244,0.5)",
                    fontWeight: isHighest || isLowest ? 700 : 500,
                  }}
                >
                  {h.temp}°
                </div>

                {/* Bar */}
                <div
                  className="w-full rounded-t-sm transition-all duration-500"
                  style={{
                    height: barHeight,
                    background: `linear-gradient(180deg, ${BAR_COLOR} 0%, ${BAR_COLOR_FADED} 100%)`,
                    borderRadius: "4px 4px 2px 2px",
                    maxWidth: 32,
                    opacity: 0.6,
                  }}
                />

                {/* Icon */}
                <div className="leading-none mt-0.5 flex items-center justify-center" style={{ color: "rgba(205,214,244,0.7)" }}>
                  <Icon name={h.icon} size={14} />
                </div>

                {/* Time */}
                <div
                  className="text-[10px] tabular-nums"
                  style={{ color: "rgba(205,214,244,0.35)" }}
                >
                  {h.time}
                </div>
              </div>
            );
          })}
        </div>

        {/* High / Low legend */}
        <div className="flex items-center justify-center gap-4 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div className="flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={BAR_COLOR} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            <span className="text-[10px] font-semibold tabular-nums" style={{ color: BAR_COLOR }}>
              {weather.high}°
            </span>
            <span className="text-[10px] text-muted-foreground/30">high</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(205,214,244,0.4)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span className="text-[10px] font-semibold tabular-nums" style={{ color: "rgba(205,214,244,0.4)" }}>
              {weather.low}°
            </span>
            <span className="text-[10px] text-muted-foreground/30">low</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
