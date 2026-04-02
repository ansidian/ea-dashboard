import { useState, useEffect, useCallback } from "react";
import { getDevScenarios, getLatestBriefing } from "../../api";
import { transformBriefing } from "../../transform";

export default function DevPanel({ onApply }) {
  const [collapsed, setCollapsed] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setCollapsed(prev => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    getDevScenarios().then(setScenarios).catch(() => {});
  }, []);

  const handleLoad = useCallback(async () => {
    setLoading(true);
    try {
      const scenarioParam = [...selected].join(",");
      const res = await getLatestBriefing(scenarioParam || undefined);
      const transformed = transformBriefing(res.briefing);
      onApply(transformed, res.id);
    } catch (err) {
      console.error("[DevPanel] Load failed:", err.message);
    }
    setLoading(false);
  }, [selected, onApply]);

  const toggle = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        width: collapsed ? "auto" : 320,
        background: "#16161e",
        border: "1px solid rgba(203,166,218,0.2)",
        borderRadius: 12,
        padding: collapsed ? "8px 12px" : 16,
        zIndex: 9999,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: collapsed ? 0 : 12, cursor: "pointer" }}
        onClick={() => setCollapsed(prev => !prev)}
      >
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#cba6da" }}>
          {collapsed ? "DEV" : "Dev Scenarios"}
        </span>
        {!collapsed && (
          <span style={{ color: "rgba(205,214,244,0.3)", fontSize: 10 }}>Ctrl+Shift+D</span>
        )}
      </div>

      {collapsed ? null : (<>

      {scenarios.length === 0 ? (
        <p style={{ fontSize: 11, color: "rgba(205,214,244,0.4)", margin: 0 }}>Loading scenarios...</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {scenarios.map(s => (
            <label
              key={s.key}
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer",
                padding: "6px 8px", borderRadius: 8,
                background: selected.has(s.key) ? "rgba(203,166,218,0.06)" : "transparent",
                border: selected.has(s.key) ? "1px solid rgba(203,166,218,0.15)" : "1px solid transparent",
                transition: "all 150ms",
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(s.key)}
                onChange={() => toggle(s.key)}
                style={{ marginTop: 2, accentColor: "#cba6da" }}
              />
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "rgba(205,214,244,0.9)" }}>{s.key}</div>
                {s.description && (
                  <div style={{ fontSize: 10, color: "rgba(205,214,244,0.4)", marginTop: 2 }}>{s.description}</div>
                )}
              </div>
            </label>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          onClick={handleLoad}
          disabled={loading}
          style={{
            flex: 1, padding: "8px 0", borderRadius: 8, border: "1px solid rgba(203,166,218,0.25)",
            background: "rgba(203,166,218,0.08)", color: "#cba6da", fontSize: 11, fontWeight: 600,
            cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
          }}
        >
          {loading ? "Loading…" : selected.size ? `Load ${selected.size} scenario${selected.size > 1 ? "s" : ""}` : "Load base mock"}
        </button>
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Set())}
            style={{
              padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)", color: "rgba(205,214,244,0.5)", fontSize: 11,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Clear
          </button>
        )}
      </div>
      </>)}
    </div>
  );
}
