import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";

// Generic right-click menu with 2-level submenus.
//
// Item shape:
//   { label, onSelect, danger? }
//   { label, children: [items] }   — parent (hover to expand)
//   { type: "separator" }
//
// Submenus expand on hover (80ms delay) and flip left if they'd overflow
// the viewport. Only 2 levels deep.
export default function ContextMenu({ x, y, items, onClose }) {
  return (
    <MenuPanel
      x={x}
      y={y}
      items={items}
      onClose={onClose}
      isRoot
    />
  );
}

function MenuPanel({ x, y, items, onClose, isRoot, anchorWidth }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState({ top: y, left: x });
  const [visible, setVisible] = useState(false);
  const [openSubIdx, setOpenSubIdx] = useState(null);
  const [subAnchorRect, setSubAnchorRect] = useState(null);
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);

  useLayoutEffect(() => {
    if (!panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    let top = y;
    let left = x;
    // For submenus, if the panel would overflow the right edge, flip to the
    // left of the anchor item instead.
    if (!isRoot && anchorWidth && left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, x - rect.width - anchorWidth);
    }
    if (left + rect.width > window.innerWidth - 8) {
      left = Math.max(8, window.innerWidth - rect.width - 8);
    }
    if (left < 8) left = 8;
    if (top + rect.height > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - rect.height - 8);
    }
    if (top < 8) top = 8;
    setPos({ top, left });
    requestAnimationFrame(() => setVisible(true));
  }, [x, y, isRoot, anchorWidth]);

  // Root-only: pointerdown-outside + scroll/resize dismissal.
  useEffect(() => {
    if (!isRoot) return;
    function handlePointer(e) {
      if (panelRef.current?.contains(e.target)) return;
      const inSub = document
        .querySelector("[data-submenu-root='true']")
        ?.contains(e.target);
      if (inSub) return;
      onClose();
    }
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    function handleScroll() {
      onClose();
    }
    document.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isRoot, onClose]);

  useEffect(() => {
    return () => {
      if (openTimerRef.current) clearTimeout(openTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const handleItemEnter = useCallback(
    (idx, item, e) => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (openTimerRef.current) {
        clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      if (item.children?.length) {
        const rect = e.currentTarget.getBoundingClientRect();
        openTimerRef.current = setTimeout(() => {
          setSubAnchorRect(rect);
          setOpenSubIdx(idx);
        }, 80);
      } else if (openSubIdx !== null) {
        // Hovering a non-parent closes any open submenu after a short delay.
        closeTimerRef.current = setTimeout(() => {
          setOpenSubIdx(null);
          setSubAnchorRect(null);
        }, 120);
      }
    },
    [openSubIdx],
  );

  const panelLeave = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const openSubItem =
    openSubIdx !== null && items[openSubIdx]?.children ? items[openSubIdx] : null;

  const content = (
    <div
      ref={panelRef}
      role="menu"
      data-submenu-root={!isRoot ? "true" : undefined}
      onMouseLeave={panelLeave}
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        minWidth: 180,
        background: "#16161e",
        border: "1px solid rgba(205,214,244,0.12)",
        borderRadius: 8,
        padding: 4,
        zIndex: 10000,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        isolation: "isolate",
        fontFamily: "system-ui, -apple-system, sans-serif",
        opacity: visible ? 1 : 0,
        transform: visible ? "scale(1)" : "scale(0.96)",
        transformOrigin: "top left",
        transition:
          "opacity 120ms ease, transform 120ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {items.map((item, i) => {
        if (item.type === "separator") {
          return (
            <div
              key={`sep-${i}`}
              style={{
                height: 1,
                background: "rgba(205,214,244,0.08)",
                margin: "4px 2px",
              }}
            />
          );
        }
        const hasChildren = !!item.children?.length;
        const isActive = openSubIdx === i;
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            onMouseEnter={(e) => handleItemEnter(i, item, e)}
            onClick={() => {
              if (hasChildren) return;
              item.onSelect?.();
              onClose();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              textAlign: "left",
              background: isActive ? "rgba(205,214,244,0.08)" : "transparent",
              border: "none",
              color: item.danger ? "#f38ba8" : "rgba(205,214,244,0.9)",
              fontSize: 12,
              padding: "8px 12px",
              borderRadius: 6,
              cursor: hasChildren ? "default" : "pointer",
              fontFamily: "inherit",
              gap: 12,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = item.danger
                ? "rgba(243,139,168,0.12)"
                : "rgba(205,214,244,0.08)";
            }}
            onMouseOut={(e) => {
              if (isActive) return;
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span>{item.label}</span>
            {hasChildren && (
              <span
                style={{
                  color: "rgba(205,214,244,0.4)",
                  fontSize: 10,
                }}
              >
                ›
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {createPortal(content, document.body)}
      {openSubItem && subAnchorRect && (
        <MenuPanel
          x={subAnchorRect.right - 2}
          y={subAnchorRect.top - 4}
          items={openSubItem.children}
          onClose={onClose}
          anchorWidth={subAnchorRect.width}
        />
      )}
    </>
  );
}
