import { ExternalLink, Calendar as CalendarIcon } from "lucide-react";

const EVENT_ROW_HEIGHT = 12;
const STACK_GAP = 2;
const MORE_ROW_HEIGHT = 10;

function getStackHeight(visibleCount, hasMore) {
  if (visibleCount <= 0) return 0;
  const childCount = visibleCount + (hasMore ? 1 : 0);
  return (
    visibleCount * EVENT_ROW_HEIGHT +
    (hasMore ? MORE_ROW_HEIGHT : 0) +
    Math.max(0, childCount - 1) * STACK_GAP
  );
}

function getVisibleEventCount(itemCount, contentHeight) {
  if (itemCount <= 0) return 0;
  const fallback = Math.min(itemCount, 2);

  if (!Number.isFinite(contentHeight) || contentHeight <= 0) {
    return fallback;
  }

  for (let visibleCount = itemCount; visibleCount >= 1; visibleCount -= 1) {
    const hiddenCount = itemCount - visibleCount;
    if (getStackHeight(visibleCount, hiddenCount > 0) <= contentHeight) {
      return visibleCount;
    }
  }

  return 1;
}

function pacificYMD(ms) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(ms));
}

function pacificTime(ms) {
  return new Date(ms).toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function compute({ data, viewYear, viewMonth }) {
  const events = data?.events || [];
  if (!events.length)
    return { itemsByDay: {}, totalEvents: 0, allDayEvents: 0 };

  const itemsByDay = {};
  let totalEvents = 0;
  let allDayEvents = 0;
  for (const ev of events) {
    if (!ev.startMs) continue;
    const ymd = pacificYMD(ev.startMs); // e.g. "2026-04-20"
    const [y, m, d] = ymd.split("-").map(Number);
    if (y !== viewYear || m !== viewMonth + 1) continue;
    if (!itemsByDay[d]) itemsByDay[d] = [];
    itemsByDay[d].push(ev);
    totalEvents += 1;
    if (ev.allDay) allDayEvents += 1;
  }
  // Sort each day's events chronologically
  for (const d of Object.keys(itemsByDay)) {
    itemsByDay[d].sort((a, b) => a.startMs - b.startMs);
  }
  return { itemsByDay, totalEvents, allDayEvents };
}

function canNavigateBack() {
  return true;
}

function renderCellContents({ items, contentHeight }) {
  if (!items?.length) return null;
  const maxVisible = getVisibleEventCount(items.length, contentHeight);
  const extra = items.length > maxVisible ? items.length - maxVisible : 0;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 0,
      }}
    >
      {items.slice(0, maxVisible).map((ev, i) => (
        <div
          key={`${ev.id || ev.htmlLink || ev.title || "event"}-${i}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            fontSize: 10.5,
            lineHeight: 1.1,
            minWidth: 0,
          }}
        >
          <span
            style={{
              flexShrink: 0,
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: ev.color || "rgba(205,214,244,0.45)",
              boxShadow: ev.color ? `0 0 4px ${ev.color}60` : "none",
            }}
          />
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              minWidth: 0,
              color: "rgba(205,214,244,0.55)",
            }}
          >
            {ev.title || "(No title)"}
          </span>
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{
            fontSize: 9,
            lineHeight: 1,
            color: "rgba(205,214,244,0.5)",
            paddingLeft: 11,
          }}
        >
          +{extra} more
        </div>
      )}
    </div>
  );
}

function formatFullDate(year, month, day) {
  return new Date(year, month, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function renderDetail({ selectedDay, viewYear, viewMonth, items }) {
  return (
    <div style={{ padding: "16px 20px", overflow: "auto", flex: 1 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={{ fontSize: 14, color: "#cba6da", fontWeight: 500 }}>
          {formatFullDate(viewYear, viewMonth, selectedDay)}
        </div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
          {items.length} event{items.length !== 1 ? "s" : ""}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((ev, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              alignItems: "flex-start",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 3,
                alignSelf: "stretch",
                borderRadius: 2,
                background: ev.color,
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ fontSize: 12.5, color: "#e2e8f0", fontWeight: 500 }}
              >
                {ev.title || "(No title)"}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "rgba(205,214,244,0.55)",
                  marginTop: 2,
                }}
              >
                {ev.allDay ? "All day" : pacificTime(ev.startMs)} · {ev.source}
              </div>
              {ev.location && (
                <div
                  style={{
                    fontSize: 10,
                    color: "rgba(205,214,244,0.4)",
                    marginTop: 2,
                  }}
                >
                  {ev.location}
                </div>
              )}
            </div>
            {ev.htmlLink && (
              <a
                href={ev.htmlLink}
                target="_blank"
                rel="noreferrer"
                aria-label="Open in Google Calendar"
                onClick={(e) => e.stopPropagation()}
                style={{
                  color: "rgba(205,214,244,0.4)",
                  padding: 4,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderFooter({ computed }) {
  const totalEvents = computed?.totalEvents || 0;
  const allDayEvents = computed?.allDayEvents || 0;
  const activeDays = Object.keys(computed?.itemsByDay || {}).length;

  const StatRow = ({ value, label }) => (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        padding: "8px 0",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span style={{ fontSize: 11, color: "rgba(205,214,244,0.55)" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 18,
          fontWeight: 500,
          color: "#fff",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.2,
        }}
      >
        {value}
      </span>
    </div>
  );

  return (
    <div
      style={{
        padding: "12px 14px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <StatRow value={totalEvents} label="Events this month" />
      <StatRow value={activeDays} label="Active days" />
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          paddingTop: 8,
        }}
      >
        <span style={{ fontSize: 11, color: "rgba(205,214,244,0.55)" }}>
          All-day
        </span>
        <span
          style={{
            fontSize: 13,
            color: "rgba(205,214,244,0.8)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {allDayEvents}
        </span>
      </div>
    </div>
  );
}

const eventsView = {
  compute,
  canNavigateBack,
  getVisibleEventCount,
  renderCellContents,
  renderDetail,
  renderFooter,
  icon: CalendarIcon,
  label: "Events",
};

export default eventsView;
