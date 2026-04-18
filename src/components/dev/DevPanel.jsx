import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { getDevScenarios } from "../../api";

const CATEGORY_ORDER = ["Email", "Calendar", "Insights", "States", "Other"];

function groupByCategory(scenarios) {
  const groups = {};
  for (const s of scenarios) {
    const cat = s.category || "Other";
    (groups[cat] ||= []).push(s);
  }
  return CATEGORY_ORDER.filter((c) => groups[c]).map((c) => ({ category: c, items: groups[c] }));
}

export default function DevPanel() {
  const [open, setOpen] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [selected, setSelected] = useState(() => {
    const param = new URLSearchParams(window.location.search).get("scenario");
    return param ? new Set(param.split(",").filter(Boolean)) : new Set();
  });
  const [applied, setApplied] = useState(() => new Set(selected));

  const pillRef = useRef(null);
  const popoverRef = useRef(null);
  const [pos, setPos] = useState(null);

  const isMockActive = new URLSearchParams(window.location.search).has("mock") || applied.size > 0;

  // fetch scenarios
  useEffect(() => {
    getDevScenarios().then(setScenarios).catch(() => {});
  }, []);

  // position popover above pill
  const updatePos = useCallback(() => {
    if (!pillRef.current) return;
    const r = pillRef.current.getBoundingClientRect();
    setPos({ bottom: window.innerHeight - r.top + 8, right: window.innerWidth - r.right });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, updatePos]);

  // prevent scroll leak from popover
  useEffect(() => {
    if (!open || !popoverRef.current) return;
    const el = popoverRef.current;
    const handler = (e) => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const atTop = scrollTop === 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight && e.deltaY > 0;
      if (atTop || atBottom) e.preventDefault();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [open]);

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleApply = useCallback(() => {
    const scenarioStr = selected.size > 0 ? [...selected].join(",") : null;
    const url = new URL(window.location);
    if (scenarioStr) {
      url.searchParams.set("mock", "1");
      url.searchParams.set("scenario", scenarioStr);
    } else {
      url.searchParams.set("mock", "1");
      url.searchParams.delete("scenario");
    }
    history.replaceState(null, "", url.toString());
    setApplied(new Set(selected));
    setOpen(false);
    window.dispatchEvent(new CustomEvent("devpanel:apply", { detail: { scenarios: scenarioStr } }));
  }, [selected]);

  const handleClear = useCallback(() => {
    setSelected(new Set());
  }, []);

  const handleExitMock = useCallback(() => {
    const url = new URL(window.location);
    url.searchParams.delete("mock");
    url.searchParams.delete("scenario");
    history.replaceState(null, "", url.toString());
    setSelected(new Set());
    setApplied(new Set());
    setOpen(false);
    window.dispatchEvent(new CustomEvent("devpanel:apply", { detail: { scenarios: null } }));
  }, []);

  const groups = groupByCategory(scenarios);

  return (
    <>
      {/* pill + active tags */}
      <div
        ref={pillRef}
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {applied.size > 0 && [...applied].map((key) => (
          <span
            key={key}
            style={{
              background: "rgba(203,166,218,0.12)",
              color: "#cba6da",
              fontSize: 9,
              padding: "4px 8px",
              borderRadius: 8,
              border: "1px solid rgba(203,166,218,0.25)",
              whiteSpace: "nowrap",
            }}
          >
            {key}
          </span>
        ))}
        <button
          onClick={() => setOpen((prev) => !prev)}
          style={{
            background: "#cba6da",
            color: "#16161e",
            fontSize: 10,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 12,
            border: "none",
            letterSpacing: 0.5,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          DEV
        </button>
      </div>

      {/* popover */}
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            bottom: pos.bottom,
            right: pos.right,
            width: 280,
            maxHeight: "70vh",
            overflowY: "auto",
            overscrollBehavior: "contain",
            background: "#16161e",
            border: "1px solid rgba(203,166,218,0.2)",
            borderRadius: 12,
            padding: 12,
            boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            zIndex: 9999,
            isolation: "isolate",
          }}
        >
          {groups.map(({ category, items }) => (
            <div key={category} style={{ marginBottom: 12 }}>
              <div
                style={{
                  color: "#cba6da",
                  fontSize: 9,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  marginBottom: 6,
                }}
              >
                {category}
              </div>
              {items.map((s) => (
                <label
                  key={s.key}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "4px 0",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(s.key)}
                    onChange={() => toggle(s.key)}
                    style={{ marginTop: 2, accentColor: "#cba6da", flexShrink: 0 }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 12,
                        color: selected.has(s.key) ? "rgba(205,214,244,0.9)" : "rgba(205,214,244,0.5)",
                      }}
                    >
                      {s.key}
                    </div>
                    {s.description && (
                      <div
                        style={{
                          fontSize: 10,
                          color: selected.has(s.key) ? "rgba(205,214,244,0.4)" : "rgba(205,214,244,0.25)",
                          lineHeight: 1.3,
                          marginTop: 1,
                        }}
                      >
                        {s.description}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          ))}

          {/* actions */}
          <div
            style={{
              display: "flex",
              gap: 6,
              paddingTop: 8,
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <button
              onClick={handleApply}
              style={{
                flex: 1,
                padding: "6px 0",
                borderRadius: 8,
                border: "1px solid rgba(203,166,218,0.25)",
                background: "rgba(203,166,218,0.12)",
                color: "#cba6da",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {selected.size ? `Apply ${selected.size}` : "Apply base"}
            </button>
            {selected.size > 0 && (
              <button
                onClick={handleClear}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.02)",
                  color: "rgba(205,214,244,0.5)",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Clear
              </button>
            )}
            {isMockActive && (
              <button
                onClick={handleExitMock}
                style={{
                  padding: "6px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(243,139,168,0.2)",
                  background: "rgba(243,139,168,0.06)",
                  color: "#f38ba8",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Exit
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
