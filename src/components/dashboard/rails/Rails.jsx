import { useMemo } from "react";
import {
  Sparkles, Flag, CalendarPlus, DollarSign, Zap,
  AlertCircle, CreditCard, ArrowRight, Inbox,
} from "lucide-react";
import { daysUntil, formatAmount } from "../../../lib/bill-utils";
import { daysLabel, urgencyForDays, deriveLane } from "../../../lib/redesign-helpers";

const INSIGHT_ICON = { Zap, Flag, CalendarPlus, DollarSign, Sparkles };

function SectionHeader({ title, subtitle, right }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase",
            color: "rgba(205,214,244,0.55)",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 11, color: "rgba(205,214,244,0.4)", marginTop: 3 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  );
}

function UrgencyPill({ days, accent, compact }) {
  const u = urgencyForDays(days, accent).key;
  const color = u === "high" ? "#f38ba8" : u === "medium" ? "#f9e2af" : accent;
  return (
    <div
      style={{
        fontSize: compact ? 9.5 : 10, fontWeight: 600,
        padding: "2px 7px", borderRadius: 99,
        background: `${color}22`, color, letterSpacing: 0.2,
        fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
      }}
    >
      {daysLabel(days)}
    </div>
  );
}

function CountBadge({ n }) {
  return (
    <div
      style={{
        fontSize: 10, fontWeight: 500, padding: "1px 7px", borderRadius: 99,
        background: "rgba(255,255,255,0.05)", color: "rgba(205,214,244,0.6)",
      }}
    >
      {n}
    </div>
  );
}

export function InsightsRail({ accent, insights = [], onJump }) {
  return (
    <div data-sect="insights">
      <SectionHeader title="AI noticed" subtitle="Pattern-level signal across your data" />
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {insights.slice(0, 5).map((ins, i) => (
          <InsightRow key={ins.id || i} insight={ins} accent={accent} onJump={onJump} />
        ))}
        {insights.length === 0 && (
          <div
            style={{
              padding: "16px 14px", borderRadius: 10,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.05)",
              fontSize: 11.5, color: "rgba(205,214,244,0.5)", lineHeight: 1.5,
            }}
          >
            No AI insights yet — run a fresh briefing to see what Claude notices.
          </div>
        )}
      </div>
    </div>
  );
}

function InsightRow({ insight, accent, onJump }) {
  const severity = insight.tone === "priority" ? "high" : insight.tone === "warn" ? "medium" : "low";
  const sc = severity === "high" ? "#f38ba8" : severity === "medium" ? "#f9e2af" : accent;
  const Icon = INSIGHT_ICON[insight.icon] || Sparkles;
  const title = insight.headline || insight.title;
  const body = insight.body || insight.description || insight.summary;
  const action = insight.related?.action || insight.action;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onJump?.({ kind: "insight", insight })}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump?.({ kind: "insight", insight }); }}
      style={{
        padding: "12px 14px", borderRadius: 10,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        cursor: "pointer", position: "relative",
        transition: "all 130ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.035)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.02)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
        <div
          style={{
            width: 20, height: 20, borderRadius: 5,
            background: `${sc}14`, display: "grid", placeItems: "center",
          }}
        >
          <Icon size={10} color={sc} />
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#cdd6f4", letterSpacing: 0.1 }}>
          {title}
        </div>
      </div>
      {body && (
        <div style={{ fontSize: 11.5, color: "rgba(205,214,244,0.6)", lineHeight: 1.45, textWrap: "pretty" }}>
          {body}
        </div>
      )}
      {action && (
        <div
          style={{
            marginTop: 8, display: "flex", alignItems: "center", gap: 4,
            fontSize: 10.5, color: accent, fontWeight: 500,
          }}
        >
          {action} <ArrowRight size={10} color={accent} />
        </div>
      )}
    </div>
  );
}

export function DeadlinesRail({ accent, deadlines = [], onJump }) {
  const sorted = useMemo(() => {
    return [...deadlines]
      .filter((d) => d.status !== "complete")
      .map((d) => ({ d, days: daysUntil(d.due_date) }))
      .sort((a, b) => {
        if (a.days == null) return 1;
        if (b.days == null) return -1;
        return a.days - b.days;
      })
      .slice(0, 5);
  }, [deadlines]);

  return (
    <div data-sect="deadlines">
      <SectionHeader title="Deadlines" right={<CountBadge n={deadlines.length} />} />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
        {sorted.map(({ d, days }) => (
          <div
            key={d.id}
            role="button"
            tabIndex={0}
            onClick={() => onJump?.({ kind: "deadline", id: d.id, data: d })}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump?.({ kind: "deadline", id: d.id, data: d }); }}
            style={{
              display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center",
              padding: "9px 2px", borderBottom: "1px solid rgba(255,255,255,0.04)",
              cursor: "pointer", transition: "background 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12, color: "#cdd6f4", fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  marginBottom: 2,
                }}
              >
                {d.title}
              </div>
              <div
                style={{
                  fontSize: 10.5, color: "rgba(205,214,244,0.45)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {d.class_name || d.source}
              </div>
            </div>
            <UrgencyPill days={days} accent={accent} />
          </div>
        ))}
        {sorted.length === 0 && <EmptyRow icon={AlertCircle} label="No open deadlines" />}
      </div>
    </div>
  );
}

export function BillsRail({ accent, bills = [], onJump }) {
  const upcoming = useMemo(() => {
    return [...bills]
      .filter((b) => !b.paid)
      .map((b) => ({ b, days: daysUntil(b.next_date) }))
      .sort((a, b) => (a.days ?? 999) - (b.days ?? 999))
      .slice(0, 5);
  }, [bills]);

  const nextWeekTotal = upcoming
    .filter((x) => x.days != null && x.days <= 7)
    .reduce((s, x) => s + (x.b.amount || 0), 0);

  return (
    <div data-sect="bills">
      <SectionHeader
        title="Bills"
        right={
          <div style={{ fontSize: 10, color: "rgba(205,214,244,0.5)" }}>
            Next 7d ·{" "}
            <span style={{ color: "#cdd6f4", fontWeight: 600 }}>{formatAmount(nextWeekTotal)}</span>
          </div>
        }
      />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
        {upcoming.map(({ b, days }) => (
          <div
            key={b.id}
            role="button"
            tabIndex={0}
            onClick={() => onJump?.({ kind: "bill", id: b.id, data: b })}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onJump?.({ kind: "bill", id: b.id, data: b }); }}
            style={{
              display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center",
              padding: "9px 2px", borderBottom: "1px solid rgba(255,255,255,0.04)",
              cursor: "pointer", transition: "background 150ms",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12, color: "#cdd6f4", fontWeight: 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {b.name}
              </div>
              <div style={{ fontSize: 10.5, color: "rgba(205,214,244,0.45)", marginTop: 2 }}>
                {b.payee || ""}
              </div>
            </div>
            <div
              style={{
                fontSize: 11.5, fontWeight: 500, color: "#cdd6f4",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatAmount(b.amount)}
            </div>
            <UrgencyPill days={days} accent={accent} compact />
          </div>
        ))}
        {upcoming.length === 0 && <EmptyRow icon={CreditCard} label="No upcoming bills" />}
      </div>
    </div>
  );
}

export function InboxPeek({ emailAccounts = [], onJump, onOpenInbox }) {
  const flat = useMemo(() => {
    const all = [];
    for (const acc of emailAccounts) {
      for (const e of acc.important || []) {
        all.push({ ...e, _account: acc, _lane: deriveLane(e) });
      }
    }
    return all
      .sort((a, b) => (a.read === b.read ? new Date(b.date) - new Date(a.date) : (a.read ? 1 : 0) - (b.read ? 1 : 0)))
      .slice(0, 5);
  }, [emailAccounts]);

  const needsYou = flat.filter((e) => e._lane === "action" && !e.read).length;

  return (
    <div data-sect="inbox-peek">
      <SectionHeader
        title="Inbox peek"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {needsYou > 0 && (
              <span
                style={{
                  fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 99,
                  background: "rgba(243,139,168,0.15)", color: "#f38ba8",
                }}
              >
                {needsYou} needs you
              </span>
            )}
            <button
              type="button"
              onClick={onOpenInbox}
              style={{
                padding: "3px 8px", borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "transparent", color: "rgba(205,214,244,0.7)",
                fontSize: 10, fontFamily: "inherit", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              Open <ArrowRight size={9} />
            </button>
          </div>
        }
      />
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column" }}>
        {flat.map((e) => (
          <div
            key={e.id}
            role="button"
            tabIndex={0}
            onClick={() => onJump?.({ kind: "email", id: e.id, email: e })}
            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") onJump?.({ kind: "email", id: e.id, email: e }); }}
            style={{
              display: "grid", gridTemplateColumns: "18px 1fr auto", gap: 10, alignItems: "center",
              padding: "9px 2px", borderBottom: "1px solid rgba(255,255,255,0.04)",
              cursor: "pointer",
            }}
            onMouseEnter={(ev) => { ev.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
            onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}
          >
            <div
              style={{
                width: 6, height: 6, borderRadius: 99,
                background:
                  e._lane === "action" ? "#f38ba8"
                  : e._lane === "fyi" ? "#89dceb"
                  : "rgba(205,214,244,0.25)",
                margin: "0 auto",
                opacity: e.read ? 0.35 : 1,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 12, color: e.read ? "rgba(205,214,244,0.65)" : "#cdd6f4",
                  fontWeight: e.read ? 400 : 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  marginBottom: 2,
                }}
              >
                {e.subject}
              </div>
              <div
                style={{
                  fontSize: 10.5, color: "rgba(205,214,244,0.45)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {e.from}
              </div>
            </div>
            <div
              style={{
                fontSize: 9.5, color: "rgba(205,214,244,0.35)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {timeAgo(e.date)}
            </div>
          </div>
        ))}
        {flat.length === 0 && <EmptyRow icon={Inbox} label="Nothing new — inbox is calm" />}
      </div>
    </div>
  );
}

function EmptyRow({ icon, label }) {
  const Icon = icon;
  return (
    <div
      style={{
        padding: "20px 14px", textAlign: "center",
        fontSize: 11.5, color: "rgba(205,214,244,0.4)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
      }}
    >
      <Icon size={16} color="rgba(205,214,244,0.25)" />
      {label}
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const mins = Math.max(0, (Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)}h`;
  const days = hrs / 24;
  if (days < 7) return `${Math.round(days)}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
