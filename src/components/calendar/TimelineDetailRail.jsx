import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

function SectionLabel({
  children,
  collapsible = false,
  expanded = false,
  onToggle,
  itemCount = 0,
  sectionId,
}) {
  if (collapsible) {
    return (
      <button
        type="button"
        data-testid={`timeline-detail-section-toggle-${sectionId}`}
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 2.2,
            textTransform: "uppercase",
            color: "rgba(205,214,244,0.5)",
          }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {children}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 1.2,
            color: "rgba(205,214,244,0.34)",
          }}
        >
          {itemCount}
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: 2.2,
        textTransform: "uppercase",
        color: "rgba(205,214,244,0.5)",
      }}
    >
      {children}
    </div>
  );
}

function TimelineRow({ item }) {
  const [hovered, setHovered] = useState(false);
  const interactive = typeof item.onClick === "function";
  const sharedHandlers = interactive
    ? {
        role: "button",
        tabIndex: 0,
        onClick: (event) => item.onClick?.(event),
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            item.onClick?.(event);
          }
        },
      }
    : {};

  return (
    <div
      data-testid="timeline-detail-row"
      data-complete={item.complete ? "true" : "false"}
      {...sharedHandlers}
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: "72px 18px minmax(0, 1fr)",
        gap: 12,
        alignItems: "start",
        padding: "4px 0",
        borderRadius: 8,
        cursor: interactive ? "pointer" : "default",
        opacity: item.complete ? 0.52 : 1,
        transition: "opacity 130ms",
      }}
      onMouseEnter={() => {
        if (interactive) setHovered(true);
      }}
      onMouseLeave={() => {
        if (interactive) setHovered(false);
      }}
    >
      <div
        style={{
          paddingTop: 12,
          fontSize: 11,
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          color: item.timeColor || "rgba(205,214,244,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        {item.timeLabel}
      </div>

      <div style={{ position: "relative", minHeight: 68 }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 8,
            top: 0,
            bottom: 0,
            width: 1,
            background: "rgba(255,255,255,0.06)",
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 2,
            top: 6,
            width: 13,
            height: 13,
            borderRadius: 9999,
            background: "#0d0d15",
            display: "grid",
            placeItems: "center",
            border: `1px solid ${item.dotColor ? `${item.dotColor}55` : "rgba(255,255,255,0.15)"}`,
            boxShadow: item.dotColor ? `0 0 0 1px ${item.dotColor}16` : "none",
          }}
        >
          <div
            style={{
              width: 5,
              height: 5,
              borderRadius: 9999,
              background: item.dotColor || "rgba(205,214,244,0.5)",
            }}
          />
        </div>
      </div>

      <div
        style={{
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          gap: 8,
          alignItems: "start",
          padding: "10px 14px",
          borderRadius: 12,
          border: item.selected ? "1px solid rgba(203,166,218,0.32)" : "1px solid transparent",
          background: item.selected
            ? "rgba(203,166,218,0.08)"
            : hovered
              ? "rgba(255,255,255,0.025)"
              : "transparent",
          boxShadow: item.selected ? "0 0 0 1px rgba(203,166,218,0.06)" : "none",
          transition: "background 130ms, border-color 130ms, box-shadow 130ms",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            className={item.titleClassName}
            style={{
              fontSize: 12.5,
              color: "#e2e8f0",
              fontWeight: 500,
              lineHeight: 1.35,
              textDecoration: item.complete ? "line-through" : "none",
              textDecorationColor: "rgba(205,214,244,0.3)",
            }}
          >
            {item.title}
          </div>
          {item.subtitle && (
            <div
              style={{
                marginTop: 2,
                fontSize: 10.5,
                color: "rgba(205,214,244,0.55)",
                lineHeight: 1.4,
              }}
            >
              {item.subtitle}
            </div>
          )}
          {item.meta && (
            <div
              style={{
                marginTop: 4,
                fontSize: 10,
                color: "rgba(205,214,244,0.4)",
                lineHeight: 1.4,
              }}
            >
              {item.meta}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", alignSelf: "center", gap: 6 }}>
          {item.trailing}
        </div>
      </div>
    </div>
  );
}

export default function TimelineDetailRail({
  title,
  summary,
  headerContent = null,
  sections = [],
}) {
  const visibleSections = sections.filter((section) => {
    if (section.collapsible) return (section.itemCount || section.items?.length || 0) > 0;
    return section.items?.length;
  });

  return (
    <div style={{ padding: "16px 20px", overflow: "auto", flex: 1 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div style={{ fontSize: 14, color: "#cba6da", fontWeight: 500 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          {summary}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {headerContent}
        {visibleSections.map((section) => (
          <div key={section.id} data-testid={`timeline-detail-section-${section.id}`}>
            <SectionLabel
              collapsible={section.collapsible}
              expanded={section.expanded}
              onToggle={section.onToggle}
              itemCount={section.itemCount}
              sectionId={section.id}
            >
              {section.label}
            </SectionLabel>
            {(!section.collapsible || section.expanded) && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column" }}>
                {section.items.map((item) => (
                  <TimelineRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
