/* eslint-disable react-refresh/only-export-components */
import { ExternalLink, Calendar as CalendarIcon } from "lucide-react";

function pacificYMD(ms) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(new Date(ms));
}

function pacificTime(ms) {
  return new Date(ms).toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function compute({ data, viewYear, viewMonth }) {
  const events = data?.events || [];
  if (!events.length) return { itemsByDay: {} };

  const itemsByDay = {};
  for (const ev of events) {
    if (!ev.startMs) continue;
    const ymd = pacificYMD(ev.startMs); // e.g. "2026-04-20"
    const [y, m, d] = ymd.split("-").map(Number);
    if (y !== viewYear || m !== viewMonth + 1) continue;
    if (!itemsByDay[d]) itemsByDay[d] = [];
    itemsByDay[d].push(ev);
  }
  // Sort each day's events chronologically
  for (const d of Object.keys(itemsByDay)) {
    itemsByDay[d].sort((a, b) => a.startMs - b.startMs);
  }
  return { itemsByDay };
}

function CellContents({ items }) {
  if (!items?.length) return null;
  const colors = [...new Set(items.map((e) => e.color))].slice(0, 3);
  const extra = items.length > 3 ? items.length - 3 : 0;
  return (
    <div style={{ display: "flex", gap: 3, marginTop: 2, alignItems: "center" }}>
      {colors.map((c, i) => (
        <span
          key={i}
          style={{
            width: 5, height: 5, borderRadius: 99, background: c,
            display: "inline-block",
          }}
        />
      ))}
      {extra > 0 && (
        <span style={{ fontSize: 9, color: "rgba(205,214,244,0.5)", marginLeft: 2 }}>
          +{extra}
        </span>
      )}
    </div>
  );
}

function Sidebar({ selectedDay, itemsByDay, viewYear, viewMonth }) {
  const items = itemsByDay[selectedDay] || [];
  if (selectedDay == null) {
    return (
      <div style={{ padding: 20, color: "rgba(205,214,244,0.4)", fontSize: 12 }}>
        Select a day to see its events.
      </div>
    );
  }
  if (!items.length) {
    return (
      <div style={{ padding: 20, color: "rgba(205,214,244,0.4)", fontSize: 12 }}>
        No events on this day.
      </div>
    );
  }
  const dateLabel = new Date(viewYear, viewMonth, selectedDay).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
  return (
    <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 2.4, textTransform: "uppercase",
        color: "rgba(205,214,244,0.55)", marginBottom: 4,
      }}>
        {dateLabel}
      </div>
      {items.map((ev, i) => (
        <div
          key={i}
          style={{
            display: "flex", gap: 10, padding: "10px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            alignItems: "flex-start",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 3, alignSelf: "stretch", borderRadius: 2,
              background: ev.color, flexShrink: 0, marginTop: 2,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "#e2e8f0", fontWeight: 500 }}>
              {ev.title || "(No title)"}
            </div>
            <div style={{ fontSize: 10.5, color: "rgba(205,214,244,0.55)", marginTop: 2 }}>
              {ev.allDay ? "All day" : pacificTime(ev.startMs)} · {ev.source}
            </div>
            {ev.location && (
              <div style={{ fontSize: 10, color: "rgba(205,214,244,0.4)", marginTop: 2 }}>
                {ev.location}
              </div>
            )}
          </div>
          {ev.htmlLink && (
            <a
              href={ev.htmlLink} target="_blank" rel="noreferrer"
              aria-label="Open in Google Calendar"
              style={{
                color: "rgba(205,214,244,0.4)", padding: 4,
                display: "inline-flex", alignItems: "center",
              }}
            >
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

const eventsView = {
  compute,
  renderCellContents: (day, items) => <CellContents items={items} />,
  renderSidebar: Sidebar,
  icon: CalendarIcon,
  label: "Events",
};

export default eventsView;
