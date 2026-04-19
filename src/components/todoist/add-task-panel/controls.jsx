import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export function PriorityIndicator({ level }) {
  const colors = {
    1: "#f38ba8",
    2: "#f9e2af",
    3: "#89b4fa",
    4: "#a6adc8",
  };
  const color = colors[level] || colors[4];
  const litCount = 5 - level;
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
      {[1, 2, 3, 4].map((index) => (
        <span
          key={index}
          style={{
            width: 3,
            height: 10,
            borderRadius: 2,
            background: color,
            opacity: index <= litCount ? 1 : 0.22,
          }}
        />
      ))}
      <span style={{ color, marginLeft: 4, fontSize: 11, fontWeight: 600 }}>
        P{level}
      </span>
    </span>
  );
}

export function Dropdown({
  label,
  value,
  options,
  onChange,
  renderOption,
  renderValue,
  color,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  const borderColor = color ? `${color}33` : "rgba(205,214,244,0.08)";
  const bgColor = color ? `${color}0d` : "rgba(205,214,244,0.04)";

  return (
    <div ref={ref} style={{ position: "relative", flex: 1 }}>
      <div
        style={{
          color: "rgba(205,214,244,0.4)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "1.5px",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen((value) => !value);
          }
        }}
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          color: color || "rgba(205,214,244,0.35)",
          transition: "all 0.2s",
        }}
      >
        <span>{renderValue ? renderValue(value) : value || "None"}</span>
        <ChevronDown size={12} style={{ opacity: 0.5 }} />
      </div>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "#16161e",
            border: "1px solid rgba(205,214,244,0.12)",
            borderRadius: 8,
            maxHeight: 160,
            overflowY: "auto",
            zIndex: 10,
            boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
          }}
        >
          {options.map((opt, index) => (
            <div
              key={opt.id ?? opt.value ?? index}
              role="button"
              tabIndex={0}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onChange(opt);
                  setOpen(false);
                }
              }}
              style={{
                padding: "8px 12px",
                fontSize: 12,
                cursor: "pointer",
                color: "#cdd6f4",
                borderBottom:
                  index < options.length - 1
                    ? "1px solid rgba(205,214,244,0.06)"
                    : "none",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "rgba(205,214,244,0.06)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "transparent";
              }}
            >
              {renderOption ? renderOption(opt) : opt.name || opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TokenAutocomplete({ cursorPos, input, items, type, onSelect }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const trigger = type === "project" ? "#" : "@";
  const textBeforeCursor = input.slice(0, cursorPos);
  const triggerIdx = textBeforeCursor.lastIndexOf(trigger);
  const fragment = triggerIdx >= 0 ? textBeforeCursor.slice(triggerIdx + 1) : null;
  const isActive = fragment !== null && !/\s/.test(fragment);

  const filtered = useMemo(() => {
    if (!isActive) return [];
    const query = fragment.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().startsWith(query)).slice(0, 6);
  }, [fragment, isActive, items]);

  const safeIdx = filtered.length ? Math.min(activeIdx, filtered.length - 1) : 0;

  useEffect(() => {
    if (!filtered.length) return undefined;
    function handleKey(event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIdx((index) => (index + 1) % filtered.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIdx((index) => (index - 1 + filtered.length) % filtered.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        if (filtered[safeIdx]) {
          event.preventDefault();
          event.stopPropagation();
          onSelect(filtered[safeIdx], triggerIdx, cursorPos);
        }
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [cursorPos, filtered, onSelect, safeIdx, triggerIdx]);

  if (!isActive || !filtered.length) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        marginTop: 4,
        background: "#16161e",
        border: "1px solid rgba(205,214,244,0.12)",
        borderRadius: 8,
        maxHeight: 160,
        overflowY: "auto",
        zIndex: 20,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
      }}
    >
      <div
        style={{
          padding: "4px 8px 2px",
          fontSize: 10,
          color: "rgba(205,214,244,0.3)",
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}
      >
        {type === "project" ? "Projects" : "Labels"}
      </div>
      {filtered.map((item, index) => (
        <div
          key={item.id}
          role="button"
          tabIndex={-1}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(item, triggerIdx, cursorPos);
          }}
          onMouseEnter={() => setActiveIdx(index)}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            cursor: "pointer",
            color: type === "project" ? "#cba6da" : "#a6dac0",
            background: index === safeIdx ? "rgba(205,214,244,0.06)" : "transparent",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {type === "project" && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: item.color || "rgba(205,214,244,0.3)",
              }}
            />
          )}
          {item.name}
        </div>
      ))}
    </div>
  );
}

export function LabelPicker({ available, onAdd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handleClick);
    return () => document.removeEventListener("pointerdown", handleClick);
  }, [open]);

  if (!available.length) return null;

  return (
    <span ref={ref} style={{ position: "relative" }}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") setOpen((value) => !value);
        }}
        style={{
          color: "rgba(205,214,244,0.3)",
          fontSize: 11,
          cursor: "pointer",
          padding: "2px 6px",
          borderRadius: 4,
          border: "1px dashed rgba(205,214,244,0.12)",
        }}
      >
        + label
      </span>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 0,
            marginBottom: 4,
            background: "#16161e",
            border: "1px solid rgba(205,214,244,0.12)",
            borderRadius: 8,
            maxHeight: 120,
            overflowY: "auto",
            zIndex: 10,
            boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
            minWidth: 120,
          }}
        >
          {available.map((label) => (
            <div
              key={label.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                onAdd(label);
                setOpen(false);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onAdd(label);
                  setOpen(false);
                }
              }}
              style={{
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
                color: "#a6dac0",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "rgba(205,214,244,0.06)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "transparent";
              }}
            >
              {label.name}
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

export function RemoveLabelButton({ onRemove }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={onRemove}
      onKeyDown={(event) => {
        if (event.key === "Enter") onRemove();
      }}
      style={{ cursor: "pointer", opacity: 0.6, display: "inline-flex", alignItems: "center" }}
    >
      <X size={12} />
    </span>
  );
}
