function SectionLabel({ children }) {
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
        gridTemplateColumns: "60px 18px minmax(0, 1fr) auto",
        gap: 10,
        alignItems: "start",
        padding: "9px 10px 9px 0",
        borderRadius: 8,
        cursor: interactive ? "pointer" : "default",
        opacity: item.complete ? 0.52 : 1,
        transition: "background 130ms",
      }}
      onMouseEnter={(event) => {
        if (interactive) event.currentTarget.style.background = "rgba(255,255,255,0.02)";
      }}
      onMouseLeave={(event) => {
        if (interactive) event.currentTarget.style.background = "transparent";
      }}
    >
      <div
        style={{
          paddingTop: 1,
          fontSize: 11,
          fontWeight: 500,
          fontVariantNumeric: "tabular-nums",
          color: item.timeColor || "rgba(205,214,244,0.7)",
          whiteSpace: "nowrap",
        }}
      >
        {item.timeLabel}
      </div>

      <div style={{ position: "relative", minHeight: 42 }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 8,
            top: -10,
            bottom: -10,
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

      <div style={{ minWidth: 0 }}>
        <div
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
  );
}

export default function TimelineDetailRail({
  title,
  summary,
  sections = [],
}) {
  const visibleSections = sections.filter((section) => section.items?.length);

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
        {visibleSections.map((section) => (
          <div key={section.id} data-testid={`timeline-detail-section-${section.id}`}>
            <SectionLabel>{section.label}</SectionLabel>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column" }}>
              {section.items.map((item) => (
                <TimelineRow key={item.id} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
