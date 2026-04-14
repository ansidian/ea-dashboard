import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown } from "lucide-react";
import useIsMobile from "../../hooks/useIsMobile";

const VIEW_LABELS = { bills: "Bills", deadlines: "Deadlines" };

export default function CalendarHeaderButton({
  lastView = "bills",
  onOpen,
  showBills = true,
}) {
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const wrapRef = useRef(null);
  const caretRef = useRef(null);
  const menuRef = useRef(null);

  const updatePos = useCallback(() => {
    if (!wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [menuOpen, updatePos]);

  useEffect(() => {
    if (!menuOpen) return;
    function handle(e) {
      if (wrapRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [menuOpen]);

  const options = [
    showBills && { key: "bills", label: VIEW_LABELS.bills },
    { key: "deadlines", label: VIEW_LABELS.deadlines },
  ].filter(Boolean);

  const resolvedView = showBills ? lastView : "deadlines";

  function handleMainClick() {
    onOpen?.(resolvedView);
  }

  function handleCaretClick(e) {
    e.stopPropagation();
    setMenuOpen((v) => !v);
  }

  function handlePick(viewKey) {
    setMenuOpen(false);
    onOpen?.(viewKey);
  }

  return (
    <>
      <div
        ref={wrapRef}
        className="flex items-stretch shrink-0 rounded-lg overflow-hidden border transition-all duration-200 self-start"
        style={{
          background: "rgba(203,166,218,0.06)",
          borderColor: menuOpen ? "rgba(203,166,218,0.35)" : "rgba(203,166,218,0.14)",
          height: 40,
        }}
      >
        <button
          type="button"
          onClick={handleMainClick}
          className="flex items-center gap-2 px-3 cursor-pointer transition-colors duration-150 border-0 bg-transparent font-[inherit]"
          style={{ color: "rgba(203,166,218,0.85)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#cba6da")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(203,166,218,0.85)")}
          title={`Open calendar — ${VIEW_LABELS[resolvedView]}`}
        >
          <Calendar size={14} strokeWidth={1.8} />
          {!isMobile && (
            <span className="text-[12px] font-medium leading-none">Calendar</span>
          )}
        </button>
        <button
          ref={caretRef}
          type="button"
          onClick={handleCaretClick}
          className="flex items-center justify-center px-1.5 cursor-pointer transition-colors duration-150 border-0 bg-transparent font-[inherit]"
          style={{
            color: menuOpen ? "#cba6da" : "rgba(203,166,218,0.6)",
            borderLeft: "1px solid rgba(203,166,218,0.14)",
          }}
          aria-label="Switch calendar view"
          title="Switch calendar view"
        >
          <ChevronDown size={14} strokeWidth={2} style={{ transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
        </button>
      </div>
      {menuOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 60,
              minWidth: 160,
              background: "#16161e",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
              padding: 4,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.35)",
                textTransform: "uppercase",
                letterSpacing: 0.6,
                padding: "6px 10px 4px",
              }}
            >
              View
            </div>
            {options.map((opt) => {
              const active = opt.key === resolvedView;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handlePick(opt.key)}
                  className="flex items-center justify-between w-full cursor-pointer border-0 bg-transparent font-[inherit]"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    fontSize: 13,
                    color: active ? "#cba6da" : "#cdd6f4",
                    background: active ? "rgba(203,166,218,0.08)" : "transparent",
                    transition: "background 120ms, color 120ms",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <span>{opt.label}</span>
                  {active && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: "#cba6da",
                        boxShadow: "0 0 4px rgba(203,166,218,0.5)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
