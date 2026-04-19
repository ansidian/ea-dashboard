import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarClock } from "lucide-react";
import { CustomDateTimeView } from "../../inbox/SnoozePicker";
import { computePlacement } from "../../inbox/helpers";

const PICKER_WIDTH = 300;
const PICKER_HEIGHT = 432;
const ACCENT = "var(--ea-accent)";

export default function TodoistDuePicker({
  anchorRef,
  panelRef,
  nowTick,
  initialEpoch,
  onSelect,
  onClose,
}) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    function updatePos() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        ...computePlacement(rect, PICKER_WIDTH, PICKER_HEIGHT),
        width: PICKER_WIDTH,
        height: PICKER_HEIGHT,
      });
    }

    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [anchorRef]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (panelRef.current?.contains(event.target)) return;
      if (anchorRef.current?.contains(event.target)) return;
      onClose();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [anchorRef, onClose, panelRef]);

  useEffect(() => {
    const element = panelRef.current;
    if (!element) return undefined;
    function handleWheel(event) {
      const atTop = element.scrollTop === 0;
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
      if ((atTop && event.deltaY < 0) || (atBottom && event.deltaY > 0)) event.preventDefault();
    }
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [panelRef]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Todoist due date picker"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: pos.height,
        overflow: "hidden",
        isolation: "isolate",
        background: "#16161e",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        padding: 8,
        zIndex: 10001,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px 10px",
          color: "rgba(205,214,244,0.72)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 22,
            height: 22,
            borderRadius: 8,
            display: "inline-grid",
            placeItems: "center",
            color: ACCENT,
            background: `color-mix(in srgb, ${ACCENT} 14%, transparent)`,
            border: `1px solid color-mix(in srgb, ${ACCENT} 24%, transparent)`,
          }}
        >
          <CalendarClock size={12} />
        </span>
        Due date
      </div>
      <CustomDateTimeView
        nowTick={nowTick}
        initialEpoch={initialEpoch}
        onSelect={onSelect}
        onBack={onClose}
        accent={ACCENT}
        confirmLabel="Set due date"
      />
    </div>,
    document.body,
  );
}
