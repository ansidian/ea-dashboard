import { useEffect, useMemo, useState } from "react";
import { Sparkles, Sun, Cloud, CloudSun, CloudRain, Snowflake, CloudFog, Moon, Calendar, Video, Plane, AlertCircle, CreditCard } from "lucide-react";
import { greetingFor, pacificClock, pacificDate, urgencyForDays, daysLabel } from "../../lib/redesign-helpers";
import { daysUntil } from "../../lib/bill-utils";
import { resolveInsight } from "../../lib/insight-resolver";

const WEATHER_ICONS = {
  Sun, Cloud, CloudSun, CloudRain, Snowflake, CloudFog, Moon,
};

function callouts({ events, deadlines, bills, now }) {
  const out = [];
  const nextEvent = (events || []).find((e) => e.startMs && e.startMs > now && e.startMs - now < 4 * 3600000);
  if (nextEvent) {
    const mins = Math.round((nextEvent.startMs - now) / 60000);
    out.push({
      kind: "event",
      icon: nextEvent.hangoutLink || /zoom/i.test(nextEvent.location || "") ? Video
           : /flight|airport/i.test(nextEvent.title || "") ? Plane
           : Calendar,
      lead: mins < 60 ? `In ${mins} min` : `In ${Math.round(mins / 60 * 10) / 10}h`,
      title: nextEvent.title,
      sub: (nextEvent.attendees && nextEvent.attendees.length)
        ? `with ${nextEvent.attendees.slice(0, 2).join(", ")}${nextEvent.attendees.length > 2 ? ` +${nextEvent.attendees.length - 2}` : ""}`
        : nextEvent.location,
      urgency: mins < 10 ? "high" : mins < 45 ? "medium" : "low",
    });
  }
  const sortedDeadlines = [...(deadlines || [])]
    .map((d) => ({ d, days: daysUntil(d.due_date) }))
    .filter((x) => x.days != null && x.days <= 7 && x.d.status !== "complete")
    .sort((a, b) => a.days - b.days);
  if (sortedDeadlines[0]) {
    const { d, days } = sortedDeadlines[0];
    out.push({
      kind: "deadline",
      icon: AlertCircle,
      lead: daysLabel(days),
      title: d.title,
      sub: d.class_name || d.source,
      urgency: urgencyForDays(days).key,
    });
  }
  const sortedBills = [...(bills || [])]
    .map((b) => ({ b, days: daysUntil(b.next_date) }))
    .filter((x) => x.days != null && x.days <= 5 && !x.b.paid)
    .sort((a, b) => a.days - b.days);
  if (sortedBills[0] && out.length < 3) {
    const { b, days } = sortedBills[0];
    out.push({
      kind: "bill",
      icon: CreditCard,
      lead: daysLabel(days),
      title: b.name,
      sub: `$${Number(b.amount || 0).toFixed(2)} · ${b.payee || ""}`,
      urgency: urgencyForDays(days).key,
      date: b.next_date,
    });
  }
  return out.slice(0, 3);
}

/**
 * DashboardHero — the single most-important block on the Dashboard.
 * Large serif greeting + AI state-of-day + weather/focus band + 3-up callouts.
 */
export default function DashboardHero({
  accent = "#cba6da",
  density = "comfortable",
  stack = false,
  isMobile = false,
  briefing,
  liveWeather,
  liveCalendar,
  liveBills,
  userName = "",
  onJump,
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const greet = greetingFor(new Date(now), userName);
  const weather = liveWeather || briefing?.weather;
  const events = useMemo(
    () => liveCalendar || briefing?.calendar || [],
    [liveCalendar, briefing?.calendar],
  );
  const deadlines = useMemo(() => {
    const ctm = briefing?.ctm?.upcoming || [];
    const todoist = briefing?.todoist?.upcoming || [];
    return [...ctm, ...todoist];
  }, [briefing?.ctm?.upcoming, briefing?.todoist?.upcoming]);
  const bills = useMemo(() => liveBills || [], [liveBills]);

  const stateOfDay = useMemo(() => {
    const insights = briefing?.aiInsights || [];
    const top = insights[0];
    const headline = top ? resolveInsight(top, new Date(now)) : "";
    const summary = briefing?.emails?.summary || "";
    return { headline, summary };
  }, [briefing, now]);

  const theCallouts = useMemo(
    () => callouts({ events, deadlines, bills, now }),
    [events, deadlines, bills, now],
  );

  const compact = density === "compact";
  const stacked = stack || isMobile;
  const outerPadding = isMobile
    ? "20px 16px 18px"
    : compact ? "24px 28px 20px" : "40px 36px 32px";
  const WeatherIcon = (weather?.icon && WEATHER_ICONS[weather.icon]) || Sun;

  return (
    <div
      data-testid={isMobile ? "dashboard-hero-mobile" : "dashboard-hero"}
      style={{
        padding: outerPadding,
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient accent glow */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: -152,
          right: 0,
          width: 250,
          height: 250,
          background: `radial-gradient(circle, ${accent}16 0%, ${accent}10 32%, transparent 74%)`,
          filter: "blur(10px)",
          opacity: 0.95,
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0%, black 20%, black 72%, transparent 100%)",
          maskImage:
            "linear-gradient(90deg, transparent 0%, black 20%, black 72%, transparent 100%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: stacked ? "1fr" : "minmax(0, 1fr) 240px",
          gap: stacked ? (isMobile ? 14 : 18) : 40,
          alignItems: "start",
          position: "relative",
        }}
      >
        {/* Greeting + state-of-day */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: isMobile ? 2 : 2.6,
              textTransform: "uppercase",
              color: "rgba(205,214,244,0.55)",
              marginBottom: isMobile ? 8 : 10,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 99,
                background: accent,
                boxShadow: `0 0 6px ${accent}`,
                display: "inline-block",
              }}
            />
            {pacificDate(new Date(now))} · {pacificClock(new Date(now))}
          </div>

          <h1
            className="ea-display"
            style={{
              margin: isMobile ? "0 0 10px" : "0 0 14px",
              fontSize: isMobile ? 24 : compact ? 28 : 40,
              fontWeight: 300,
              letterSpacing: isMobile ? -0.4 : -0.6,
              lineHeight: isMobile ? 1.08 : 1.1,
              color: "#cdd6f4",
              textWrap: "balance",
            }}
          >
            <span style={{ display: "block" }}>{greet.text}.</span>
            {!isMobile && stateOfDay.headline && (
              <span
                style={{
                  color: "rgba(205,214,244,0.5)",
                  fontStyle: "italic",
                  fontWeight: 300,
                  display: "block",
                  marginTop: isMobile ? 4 : 2,
                }}
              >
                {stateOfDay.headline}
              </span>
            )}
          </h1>

          {stateOfDay.summary && (
            <p
              style={{
                margin: "0 0 6px",
                maxWidth: isMobile ? "100%" : 680,
                fontSize: isMobile ? 13 : compact ? 14 : 15,
                lineHeight: isMobile ? 1.55 : 1.65,
                color: "rgba(205,214,244,0.72)",
                textWrap: "pretty",
              }}
            >
              {stateOfDay.summary}
            </p>
          )}

          {/* AI signature chip */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: isMobile ? 4 : 6,
              padding: isMobile ? "2px 8px" : "3px 9px",
              borderRadius: 99,
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.05)",
              fontSize: isMobile ? 9 : 10,
              letterSpacing: 0.3,
              color: "rgba(205,214,244,0.4)",
            }}
          >
            <Sparkles size={9} color={accent} />
            {briefing?.model || "Claude"} ·{" "}
            {(briefing?.aiInsights || []).length} insights
          </div>
        </div>

        {/* Right column: weather + focus band */}
        <div
          style={{
            display: "flex",
            flexDirection: stacked && !isMobile ? "row" : "column",
            gap: isMobile ? 8 : 10,
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: stacked && !isMobile ? 1 : "unset",
              padding: isMobile ? "12px 14px" : "14px 16px",
              borderRadius: 12,
              background:
                "linear-gradient(155deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))",
              border: "1px solid rgba(255,255,255,0.06)",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 12,
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: isMobile ? 38 : 42,
                height: isMobile ? 38 : 42,
                borderRadius: 10,
                background: "rgba(255,255,255,0.03)",
                display: "grid",
                placeItems: "center",
              }}
            >
              <WeatherIcon size={20} color="#cdd6f4" />
            </div>
            <div>
              <div
              style={{
                fontSize: isMobile ? 16 : 18,
                fontWeight: 500,
                color: "#cdd6f4",
                lineHeight: 1,
                }}
              >
                {weather?.temp != null ? `${Math.round(weather.temp)}°` : "—"}
              </div>
              <div
              style={{
                  fontSize: isMobile ? 10 : 10.5,
                  color: "rgba(205,214,244,0.5)",
                  marginTop: 3,
                  letterSpacing: 0.2,
                }}
              >
                {weather?.condition || ""}
                {weather?.city ? ` · ${weather.city}` : ""}
              </div>
            </div>
          </div>

          <div
            style={{
              flex: stacked && !isMobile ? 1 : "unset",
              padding: isMobile ? "10px 12px" : "10px 14px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.05)",
            }}
          >
            <div
              style={{
                fontSize: isMobile ? 9 : 9.5,
                letterSpacing: 0.8,
                textTransform: "uppercase",
                color: "rgba(205,214,244,0.4)",
                marginBottom: 6,
              }}
            >
              Focus window
            </div>
            <div style={{ fontSize: isMobile ? 11.5 : 12, color: "#cdd6f4", lineHeight: 1.4 }}>
              {nextFocusWindow(events, now) ||
                "Calendar looks open — pick your block."}
            </div>
          </div>
        </div>
      </div>

      {theCallouts.length > 0 && (
        <div
          data-testid="dashboard-hero-callouts"
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : `repeat(${theCallouts.length}, 1fr)`,
            gap: isMobile ? 8 : 10,
            marginTop: isMobile ? 16 : compact ? 22 : 28,
            position: "relative",
          }}
        >
          {theCallouts.map((c, i) => (
            <Callout
              key={i}
              {...c}
              accent={accent}
              isMobile={isMobile}
              onJump={(anchor) => onJump?.(c, anchor)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Callout({ icon, lead, title, sub, urgency, accent, onJump, kind, isMobile = false }) {
  const Icon = icon;
  const colors = {
    high:   { bar: "#f38ba8", dot: "#f38ba8" },
    medium: { bar: "#f9e2af", dot: "#f9e2af" },
    low:    { bar: accent,    dot: accent },
  };
  const uc = colors[urgency] || colors.low;
  const kindLabel = { event: "Next up", deadline: "Deadline", bill: "Payment" }[kind] || "";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => onJump?.(e.currentTarget)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump?.(e.currentTarget); }}
      style={{
        padding: isMobile ? "12px 14px" : "14px 16px", borderRadius: 11,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        cursor: "pointer", position: "relative", overflow: "hidden",
        transition: "all 150ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.025)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)";
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: uc.bar }} />

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <div
          style={{
            width: isMobile ? 20 : 22, height: isMobile ? 20 : 22, borderRadius: 6,
            background: "rgba(255,255,255,0.04)",
            display: "grid", placeItems: "center",
          }}
        >
          <Icon size={isMobile ? 10 : 11} color={uc.dot} />
        </div>
        <div
          style={{
            fontSize: isMobile ? 9 : 9.5, letterSpacing: 0.6, textTransform: "uppercase",
            color: "rgba(205,214,244,0.45)",
          }}
        >
          {kindLabel}
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            fontSize: isMobile ? 10 : 10.5, fontWeight: 600, letterSpacing: 0.2,
            color: uc.dot,
          }}
        >
          {lead}
        </div>
      </div>

      <div
        style={{
          fontSize: isMobile ? 13 : 14, fontWeight: 500, color: "#cdd6f4", lineHeight: 1.35,
          marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
      {sub && (
        <div
          style={{
            fontSize: isMobile ? 11 : 11.5, color: "rgba(205,214,244,0.55)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function nextFocusWindow(events, now) {
  const future = (events || [])
    .filter((e) => e.startMs && e.startMs > now)
    .sort((a, b) => a.startMs - b.startMs);
  if (future.length === 0) return null;
  const first = future[0];
  const time = new Date(first.startMs).toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit",
  }).toLowerCase();
  const gap = first.startMs - now;
  const gapMin = Math.round(gap / 60000);
  if (gapMin < 15) return `Heads up — ${first.title} at ${time}.`;
  const gapLabel = gapMin < 60 ? `${gapMin} min` : `${Math.round(gapMin / 60 * 10) / 10}h`;
  return `Clear for the next ${gapLabel} — next up: ${first.title} at ${time}.`;
}
