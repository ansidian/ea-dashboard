import { useEffect, useMemo, useState } from "react";
import {
  Video, Plane, Calendar, Coffee, Users,
  AlertCircle, CreditCard,
} from "lucide-react";
import {
  buildTimeline, dayBucket, dayBucketLabel,
  eventState, formatEventTime, formatEventDuration,
  urgencyForDays, pacificClock,
} from "../../lib/redesign-helpers";
import { daysUntil, formatAmount } from "../../lib/bill-utils";

function SectionHeader({ title, right }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "flex-end",
        justifyContent: "space-between", gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase",
          color: "rgba(205,214,244,0.55)",
        }}
      >
        {title}
      </div>
      {right}
    </div>
  );
}

function NowLine({ accent, now }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 10px", position: "relative" }}>
      <div
        style={{
          position: "absolute", left: -27, top: "50%", transform: "translateY(-50%)",
          width: 11, height: 11, borderRadius: 99,
          background: accent,
          boxShadow: `0 0 12px ${accent}, 0 0 0 3px ${accent}25`,
          animation: "dashPulse 2s ease-in-out infinite",
        }}
      />
      <div
        style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase",
          color: accent, padding: "2px 8px",
          background: `${accent}15`, borderRadius: 99, border: `1px solid ${accent}30`,
        }}
      >
        Now · {pacificClock(new Date(now))}
      </div>
      <div
        style={{
          flex: 1, height: 1,
          background: `linear-gradient(90deg, ${accent}60, transparent)`,
        }}
      />
    </div>
  );
}

function TimelineRow({ item, now, accent, onJump }) {
  let Icon, title, sub, meta, leftLabel, urgency, jumpPayload;
  let isPast = false, isLive = false;

  if (item.kind === "event") {
    const ev = item.data;
    const state = eventState(ev, now);
    isPast = state === "past";
    isLive = state === "live";
    Icon = /zoom|video/i.test(ev.location || "") || ev.hangoutLink ? Video
         : /flight|airport|plane/i.test(ev.title || "") ? Plane
         : /coffee|lunch|dinner/i.test(ev.title || "") ? Coffee
         : ev.attendees?.length > 1 ? Users
         : Calendar;
    leftLabel = formatEventTime(ev.startMs);
    title = ev.title;
    sub = ev.attendees?.length
      ? `with ${ev.attendees.slice(0, 3).join(", ")}${ev.attendees.length > 3 ? ` +${ev.attendees.length - 3}` : ""}`
      : ev.location || ev.subtitle;
    meta = formatEventDuration(ev.startMs, ev.endMs);
    urgency = isLive ? "high" : "low";
    jumpPayload = { kind: "event", id: ev.id };
  } else if (item.kind === "deadline") {
    const d = item.data;
    const days = daysUntil(d.due_date);
    urgency = urgencyForDays(days, accent).key;
    Icon = AlertCircle;
    leftLabel = d.due_time || "11:59p";
    title = d.title;
    sub = d.class_name || d.source || "";
    meta = d.source === "todoist" ? "Todoist" : d.source === "canvas" ? "Canvas" : "CTM";
    jumpPayload = { kind: "deadline", id: d.id };
  } else if (item.kind === "bill") {
    const b = item.data;
    const days = daysUntil(b.next_date);
    urgency = urgencyForDays(days, accent).key;
    Icon = CreditCard;
    leftLabel = "3:00p";
    title = b.name;
    sub = b.payee || "";
    meta = formatAmount(b.amount);
    jumpPayload = { kind: "bill", id: b.id };
  } else {
    return null;
  }

  const urgColors = { high: "#f38ba8", medium: "#f9e2af", low: accent };
  const dotColor = urgColors[urgency] || accent;
  const opacity = isPast ? 0.38 : 1;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onJump?.(jumpPayload)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump?.(jumpPayload); }}
      style={{
        position: "relative", padding: "9px 12px", marginBottom: 4,
        borderRadius: 9, cursor: "pointer", opacity,
        border: "1px solid transparent",
        transition: "all 130ms",
        display: "grid", gridTemplateColumns: "54px 1fr auto", gap: 14, alignItems: "center",
        background: isLive ? `${accent}08` : "transparent",
        ...(isLive ? { borderColor: `${accent}30` } : {}),
      }}
      onMouseEnter={(e) => { if (!isLive) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
      onMouseLeave={(e) => { if (!isLive) e.currentTarget.style.background = "transparent"; }}
    >
      {/* Rail dot */}
      <div
        style={{
          position: "absolute", left: -22, top: 14,
          width: 13, height: 13, borderRadius: 99,
          background: "#0b0b13",
          display: "grid", placeItems: "center",
          border: `1px solid ${isLive ? dotColor : "rgba(255,255,255,0.15)"}`,
          boxShadow: isLive ? `0 0 10px ${dotColor}80` : "none",
        }}
      >
        <div
          style={{
            width: 5, height: 5, borderRadius: 99,
            background: dotColor,
            ...(isLive ? { animation: "dashPulse 2s ease-in-out infinite" } : {}),
          }}
        />
      </div>

      {/* Time column */}
      <div
        style={{
          fontSize: 11.5, fontWeight: 500, fontVariantNumeric: "tabular-nums",
          color: isLive ? dotColor : "rgba(205,214,244,0.7)",
          letterSpacing: 0.2,
        }}
      >
        {leftLabel}
      </div>

      {/* Main */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <Icon size={11} color="rgba(205,214,244,0.55)" />
          <div
            style={{
              fontSize: 13, fontWeight: 500, color: "#cdd6f4",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              textDecoration: isPast ? "line-through" : "none",
              textDecorationColor: "rgba(205,214,244,0.25)",
            }}
          >
            {title}
          </div>
          {isLive && (
            <span
              style={{
                padding: "1px 6px", borderRadius: 99,
                fontSize: 9, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 600,
                background: `${dotColor}20`, color: dotColor,
              }}
            >
              Live
            </span>
          )}
        </div>
        {sub && (
          <div
            style={{
              fontSize: 11, color: "rgba(205,214,244,0.45)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {sub}
          </div>
        )}
      </div>

      {/* Meta */}
      {meta && (
        <div
          style={{
            fontSize: 10.5, color: "rgba(205,214,244,0.5)",
            fontVariantNumeric: "tabular-nums",
            padding: "2px 8px", borderRadius: 6,
            background: "rgba(255,255,255,0.03)",
          }}
        >
          {meta}
        </div>
      )}
    </div>
  );
}

/**
 * TodayTimeline — merges events + deadlines + bills onto one chronological rail.
 * Now marker is anchored between the last-past and first-future item so the
 * user sees "where they are" without scrolling.
 */
export default function TodayTimeline({
  accent = "#cba6da",
  density = "comfortable",
  events = [],
  deadlines = [],
  bills = [],
  onJump,
}) {
  const [filter, setFilter] = useState("all");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const items = useMemo(
    () => buildTimeline({ events, deadlines, bills }),
    [events, deadlines, bills],
  );

  const filtered = items.filter((it) => {
    if (filter === "all") return true;
    if (filter === "meetings") return it.kind === "event";
    if (filter === "deadlines") return it.kind === "deadline";
    if (filter === "bills") return it.kind === "bill";
    return true;
  });

  const groups = useMemo(() => {
    const g = new Map();
    for (const it of filtered) {
      const ms = it.startMs ?? it.dueAtMs;
      const b = dayBucket(ms, now);
      if (!g.has(b)) g.set(b, []);
      g.get(b).push(it);
    }
    return [...g.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered, now]);

  return (
    <div data-sect="timeline" style={{ padding: density === "compact" ? "18px 32px" : "24px 36px" }}>
      <SectionHeader
        title="Today"
        right={
          <div
            style={{
              display: "flex", gap: 2, padding: 2, borderRadius: 8,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            {[
              { id: "all", label: "All" },
              { id: "meetings", label: "Meetings" },
              { id: "deadlines", label: "Deadlines" },
              { id: "bills", label: "Bills" },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                  fontSize: 10.5, fontFamily: "inherit", letterSpacing: 0.2,
                  background: filter === f.id ? "rgba(255,255,255,0.06)" : "transparent",
                  color: filter === f.id ? "#cdd6f4" : "rgba(205,214,244,0.5)",
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        }
      />

      <div style={{ marginTop: 16 }}>
        {groups.map(([day, dayItems], gi) => (
          <DayGroup
            key={day}
            day={day}
            items={dayItems}
            now={now}
            accent={accent}
            onJump={onJump}
            isFirst={gi === 0}
          />
        ))}
        {groups.length === 0 && (
          <div
            style={{
              padding: "40px 20px", textAlign: "center",
              fontSize: 12, color: "rgba(205,214,244,0.4)",
            }}
          >
            Nothing on the calendar matching this filter.
          </div>
        )}
      </div>
    </div>
  );
}

function DayGroup({ day, items, now, accent, onJump, isFirst }) {
  const label = dayBucketLabel(day, now);
  const hideHeader = isFirst && day === 0;

  function shouldShowNowLine(i) {
    if (day !== 0) return false;
    const it = items[i];
    const itMs = it.startMs ?? it.dueAtMs;
    const prev = items[i - 1];
    if (!prev) return now < itMs;
    const prevMs = prev.endMs ?? prev.startMs ?? prev.dueAtMs;
    return prevMs < now && now < itMs;
  }

  return (
    <div style={{ marginBottom: 28 }}>
      {!hideHeader && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingLeft: 2 }}>
          <div
            style={{
              fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 600,
              color: day === 0 ? "#cdd6f4" : "rgba(205,214,244,0.45)",
            }}
          >
            {label}
          </div>
          <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.04)" }} />
          <div style={{ fontSize: 10, color: "rgba(205,214,244,0.35)" }}>
            {items.length} {items.length === 1 ? "item" : "items"}
          </div>
        </div>
      )}

      <div style={{ position: "relative", paddingLeft: 22 }}>
        <div
          style={{
            position: "absolute", left: 6, top: 8, bottom: 8, width: 1,
            background: "rgba(255,255,255,0.06)",
          }}
        />
        {items.map((it, i) => (
          <div key={`${it.kind}-${i}`}>
            {shouldShowNowLine(i) && <NowLine accent={accent} now={now} />}
            <TimelineRow item={it} now={now} accent={accent} onJump={onJump} />
          </div>
        ))}
      </div>
    </div>
  );
}
