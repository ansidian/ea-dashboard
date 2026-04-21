/* eslint-disable react-refresh/only-export-components */
import { createPortal } from "react-dom";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Zap, Droplet, Wifi, Flame, Trash2, Check } from "lucide-react";
import { formatAmount, daysUntil, daysLabel, urgencyColor } from "../../../lib/bill-utils";
import Tooltip from "../../shared/Tooltip";
import TimelineDetailRail from "../TimelineDetailRail.jsx";

const MAX_PILLS = 2;

const TRACKED_UTILITIES = [
  { key: "sce", label: "Electricity", match: "sce", icon: Zap },
  { key: "water", label: "Water", match: "sgv water", icon: Droplet },
  { key: "spectrum", label: "Internet", match: "spectrum", icon: Wifi },
  { key: "socalgas", label: "Gas", match: "socalgas", icon: Flame },
  { key: "trash", label: "Trash", match: "valley vista", icon: Trash2 },
];

function formatShortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeDateLabel(days) {
  if (days === null || days === undefined) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "1 day ago";
  if (days < 0) return `${Math.abs(days)} days ago`;
  return `in ${days} days`;
}

function formatFullDate(year, month, day) {
  const d = new Date(year, month, day);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function scheduleToBill(schedule, payeeMap) {
  const amtCond = schedule.conditions?.find((c) => c.field === "amount");
  const payeeCond = schedule.conditions?.find((c) => c.field === "payee");
  const rawAmt = amtCond?.value;
  const amountCents = typeof rawAmt === "object" && rawAmt !== null ? (rawAmt.num1 ?? 0) : (rawAmt ?? 0);
  const payeeName = payeeCond ? payeeMap[payeeCond.value] : schedule.name;
  return {
    id: schedule.id,
    name: schedule.name || payeeName || "Unknown",
    payee: payeeName || schedule.name || "Unknown",
    amount: Math.abs(amountCents) / 100,
    next_date: schedule.next_date,
    paid: !!schedule.paid,
    type: schedule.type || "bill",
  };
}

function orderBills(items = []) {
  return [...items].sort((a, b) => {
    if (a.paid !== b.paid) return a.paid ? 1 : -1;
    const aName = (a.name || a.payee || "").toLowerCase();
    const bName = (b.name || b.payee || "").toLowerCase();
    return aName.localeCompare(bName);
  });
}

function groupBills(items = []) {
  const ordered = orderBills(items);
  const activeItems = ordered.filter((item) => !item.paid);
  const completedItems = ordered.filter((item) => item.paid);
  return {
    items: ordered,
    activeItems,
    completedItems,
    activeCount: activeItems.length,
    completedCount: completedItems.length,
    totalCount: ordered.length,
  };
}

function getDayState(rawItems) {
  if (rawItems?.activeItems) return rawItems;
  return groupBills(Array.isArray(rawItems) ? rawItems : []);
}

function CompletedCount({ count }) {
  if (!count) return null;
  return (
    <div
      style={{
        marginTop: 4,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 10,
        color: "rgba(166,227,161,0.55)",
        letterSpacing: 0.2,
      }}
    >
      <Check size={10} />
      <span>{count}</span>
    </div>
  );
}

function CompletedPreview({ label, amount, count }) {
  return (
    <div
      style={{
        marginTop: 4,
        display: "flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          flexShrink: 0,
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "rgba(166,227,161,0.72)",
          boxShadow: "0 0 4px rgba(166,227,161,0.22)",
        }}
      />
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: "rgba(205,214,244,0.42)",
          fontSize: 11,
          textDecoration: "line-through",
          textDecorationColor: "rgba(205,214,244,0.2)",
        }}
      >
        {label}
      </span>
      <span
        style={{
          flexShrink: 0,
          color: "rgba(166,227,161,0.58)",
          fontSize: 10.5,
          fontWeight: 500,
        }}
      >
        {amount}
      </span>
      {count > 1 && <CompletedCount count={count} />}
    </div>
  );
}

function compute({ data, viewYear, viewMonth }) {
  const schedules = data?.schedules || [];
  const recentTransactions = data?.recentTransactions || [];
  const payeeMap = data?.payeeMap || {};

  const itemsByDay = {};
  const seen = new Set();

  if (schedules.length) {
    for (const s of schedules) {
      if (!s.next_date) continue;
      if (s.type === "income") continue;
      const d = new Date(s.next_date + "T00:00:00");
      if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
      const day = d.getDate();
      if (!itemsByDay[day]) itemsByDay[day] = [];
      itemsByDay[day].push(scheduleToBill(s, payeeMap));
      seen.add(`${s.id}:${day}`);
    }
  }
  if (recentTransactions.length && schedules.length) {
    const scheduleById = new Map(schedules.map((s) => [s.id, s]));
    for (const t of recentTransactions) {
      if (!t.scheduleId || !t.date) continue;
      const sched = scheduleById.get(t.scheduleId);
      if (!sched) continue;
      if (sched.type === "income") continue;
      const d = new Date(t.date + "T00:00:00");
      if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) continue;
      const day = d.getDate();
      const key = `${t.scheduleId}:${day}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!itemsByDay[day]) itemsByDay[day] = [];
      itemsByDay[day].push({
        ...scheduleToBill(sched, payeeMap),
        next_date: t.date,
        amount: t.amount,
        paid: true,
      });
    }
  }

  let monthTotal = 0;
  for (const bills of Object.values(itemsByDay)) {
    for (const b of bills) monthTotal += b.amount;
  }

  for (const day of Object.keys(itemsByDay)) {
    itemsByDay[day] = groupBills(itemsByDay[day]);
  }

  return { itemsByDay, monthTotal };
}

function hasOverdue(items) {
  const state = getDayState(items);
  return state.activeItems.some((b) => daysUntil(b.next_date) < 0);
}

function allComplete(_items) {
  return false;
}

function renderCellContents({ items, hasOverdue: overdue }) {
  const state = getDayState(items);
  const visibleItems = state.activeItems.slice(0, MAX_PILLS);
  const hiddenActiveCount = Math.max(0, state.activeCount - visibleItems.length);
  const completedPreview = state.activeCount === 0 ? state.completedItems[0] : null;

  return (
    <>
      {visibleItems.map((b) => {
        const d = daysUntil(b.next_date);
        const uc = urgencyColor(d);
        const isTransfer = b.type === "transfer";
        const amountColor = isTransfer
          ? "#b4befe"
          : overdue && d < 0
            ? "#f38ba8"
            : uc.text === "rgba(205,214,244,0.5)"
              ? "#a6e3a1"
              : uc.text;
        return (
          <div
            key={b.id}
            style={{
              display: "flex",
              gap: 4,
              fontSize: 11,
              marginTop: 3,
            }}
          >
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
                color: "rgba(205,214,244,0.45)",
              }}
            >
              {b.name}
            </span>
            <span
              style={{
                flexShrink: 0,
                color: amountColor,
                fontWeight: 500,
              }}
            >
              {formatAmount(b.amount).replace(".00", "")}
            </span>
          </div>
        );
      })}
      {hiddenActiveCount > 0 && (
        <div style={{ fontSize: 10, color: "rgba(203,166,218,0.6)", marginTop: 2 }}>
          +{hiddenActiveCount} more
        </div>
      )}
      {completedPreview ? (
        <CompletedPreview
          label={completedPreview.name}
          amount={formatAmount(completedPreview.amount).replace(".00", "")}
          count={state.completedCount}
        />
      ) : (
        <CompletedCount count={state.completedCount} />
      )}
    </>
  );
}

function toBillRailItem(b, actualBudgetUrl) {
  const days = daysUntil(b.next_date);
  const scheduleUrl = actualBudgetUrl
    ? `${actualBudgetUrl.replace(/\/+$/, "")}/schedules?highlight=${b.id}`
    : null;

  return {
    id: String(b.id),
    timeLabel: b.paid ? "Paid" : daysLabel(days),
    title: b.name,
    subtitle: b.payee && b.payee !== b.name ? b.payee : null,
    meta: b.type === "transfer" ? "Transfer" : null,
    complete: b.paid,
    dotColor: b.paid ? "#a6e3a1" : b.type === "transfer" ? "#b4befe" : urgencyColor(days).accent,
    trailing: (
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: b.paid ? "#a6e3a1" : b.type === "transfer" ? "#b4befe" : urgencyColor(days).text,
            whiteSpace: "nowrap",
          }}
        >
          {formatAmount(b.amount)}
        </span>
        {scheduleUrl && (
          <Tooltip text="Edit Schedule in Actual">
            <a
              href={scheduleUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              style={{
                color: "rgba(203,166,218,0.5)",
                display: "inline-flex",
                alignItems: "center",
                padding: 4,
                borderRadius: 4,
                transition: "color 150ms",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.color = "#cba6da";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.color = "rgba(203,166,218,0.5)";
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M6 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M9 2h5v5M14 2L7 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </Tooltip>
        )}
      </div>
    ),
  };
}

function BillsDetail({ selectedDay, viewYear, viewMonth, items, data }) {
  const actualBudgetUrl = data?.actualBudgetUrl;
  const state = getDayState(items);
  const [showCompleted, setShowCompleted] = useState(state.activeCount === 0 && state.completedCount > 0);
  const summary = [
    `${state.activeCount} unpaid`,
    state.completedCount ? `${state.completedCount} paid` : null,
    `${state.totalCount} total`,
  ].filter(Boolean).join(" · ");

  return (
    <TimelineDetailRail
      title={formatFullDate(viewYear, viewMonth, selectedDay)}
      summary={summary}
      sections={[
        {
          id: "active-bills",
          label: "Unpaid",
          items: state.activeItems.map((bill) => toBillRailItem(bill, actualBudgetUrl)),
        },
        {
          id: "completed-bills",
          label: "Paid",
          collapsible: true,
          expanded: showCompleted,
          onToggle: () => setShowCompleted((prev) => !prev),
          itemCount: state.completedCount,
          items: state.completedItems.map((bill) => toBillRailItem(bill, actualBudgetUrl)),
        },
      ]}
    />
  );
}

function renderDetail(props) {
  const state = getDayState(props.items);
  return <BillsDetail key={`${props.selectedDay}-${state.activeCount}-${state.completedCount}`} {...props} />;
}

function renderFooter({ viewYear, viewMonth, computed }) {
  // Vertical layout for the narrow side-rail context.
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.05)",
        borderRadius: 10,
        display: "flex", flexDirection: "column", gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 10, fontWeight: 600, letterSpacing: 2.2, textTransform: "uppercase",
          color: "rgba(205,214,244,0.5)",
        }}
      >
        {new Date(viewYear, viewMonth).toLocaleDateString("en-US", { month: "long" })} total
      </span>
      <span
        style={{
          fontSize: 22, fontWeight: 500, color: "#fff",
          fontVariantNumeric: "tabular-nums", letterSpacing: -0.3,
        }}
      >
        {formatAmount(computed?.monthTotal || 0)}
      </span>
    </div>
  );
}

function UtilityStatusButton({ data, suppressOutsideClick }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef(null);
  const popoverRef = useRef(null);

  const utilityStatus = useMemo(() => {
    const schedules = data?.schedules || [];
    const payeeMap = data?.payeeMap || {};
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const rows = TRACKED_UTILITIES.map((u) => {
      const sched = schedules.find((s) => {
        const payeeCond = s.conditions?.find((c) => c.field === "payee");
        const payeeName = payeeCond ? payeeMap[payeeCond.value] : null;
        const haystack = `${payeeName || ""} ${s.name || ""}`.toLowerCase();
        return haystack.includes(u.match);
      });
      const nextDate = sched?.next_date || null;
      const amtCond = sched?.conditions?.find((c) => c.field === "amount");
      const amount = amtCond?.value ? Math.abs(amtCond.value) / 100 : null;
      return {
        ...u,
        found: !!sched,
        next_date: nextDate,
        amount,
        isStale: !sched || !nextDate || nextDate < today,
      };
    });
    return rows.sort((a, b) => {
      if (!a.next_date && !b.next_date) return 0;
      if (!a.next_date) return 1;
      if (!b.next_date) return -1;
      return a.next_date.localeCompare(b.next_date);
    });
  }, [data]);

  const anyStale = utilityStatus.some((u) => u.isStale && u.found);
  const allFresh = utilityStatus.length > 0 && utilityStatus.every((u) => u.found && !u.isStale);

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    function handle(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", handle);
    return () => document.removeEventListener("pointerdown", handle);
  }, [open]);

  // Tell the modal shell to suppress its outside-click handler while our popover is open.
  useEffect(() => {
    if (!suppressOutsideClick) return;
    if (open) {
      suppressOutsideClick((target) => popoverRef.current?.contains(target));
    } else {
      suppressOutsideClick(null);
    }
    return () => suppressOutsideClick?.(null);
  }, [open, suppressOutsideClick]);

  return (
    <>
      <Tooltip text="Utility statement status">
        <button
          ref={btnRef}
          onClick={() => setOpen((v) => !v)}
          style={{
            position: "relative",
            color: open ? "#cba6da" : "rgba(205,214,244,0.75)",
            cursor: "pointer",
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            background: open ? "rgba(203,166,218,0.12)" : "rgba(255,255,255,0.03)",
            border: `1px solid ${open ? "rgba(203,166,218,0.32)" : "rgba(255,255,255,0.06)"}`,
            fontFamily: "inherit",
            transition: "all 120ms",
          }}
        >
          <Zap size={15} strokeWidth={1.8} />
          {anyStale && (
            <span
              style={{
                position: "absolute",
                top: -3,
                right: -3,
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#f97316",
                boxShadow: "0 0 6px rgba(249,115,22,0.5), 0 0 0 2px #16161e",
              }}
            />
          )}
          {allFresh && (
            <span
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#a6e3a1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 6px rgba(166,227,161,0.5), 0 0 0 2px #16161e",
              }}
            >
              <Check size={7} color="#16161e" strokeWidth={3.5} />
            </span>
          )}
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="isolate"
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 50,
              width: 280,
              background: "#16161e",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
              padding: "12px 14px",
              isolation: "isolate",
              overscrollBehavior: "contain",
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.4)",
                fontWeight: 500,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                marginBottom: 10,
                padding: "0 2px",
              }}
            >
              Statement Status
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {utilityStatus.map((u) => {
                const Icon = u.icon;
                const color = !u.found
                  ? "rgba(255,255,255,0.25)"
                  : u.isStale
                    ? "#f97316"
                    : "#a6e3a1";
                const days = u.next_date ? daysUntil(u.next_date) : null;
                const rel = relativeDateLabel(days);
                const dateText = !u.found
                  ? "not found"
                  : u.isStale
                    ? `last ${formatShortDate(u.next_date)}`
                    : `next ${formatShortDate(u.next_date)}`;
                const tooltipText =
                  u.found && rel ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, lineHeight: 1.3 }}>
                      {u.amount != null && <span style={{ fontWeight: 600 }}>{formatAmount(u.amount)}</span>}
                      <span>{u.isStale ? `${rel} — statement pending` : rel}</span>
                    </div>
                  ) : null;
                return (
                  <div
                    key={u.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "6px 8px",
                      borderRadius: 6,
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <Icon size={14} color={color} strokeWidth={2} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: "#cdd6f4", fontWeight: 500 }}>{u.label}</span>
                    </div>
                    <Tooltip text={tooltipText} side="right" sideOffset={14} delay={200}>
                      <span
                        style={{
                          fontSize: 12,
                          color: u.isStale && u.found ? "#f97316" : "rgba(255,255,255,0.4)",
                          whiteSpace: "nowrap",
                          cursor: tooltipText ? "help" : "default",
                        }}
                      >
                        {dateText}
                      </span>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

const billsView = {
  compute,
  getDayState,
  hasOverdue,
  allComplete,
  renderCellContents,
  renderDetail,
  renderFooter,
  HeaderExtras: UtilityStatusButton,
};

export default billsView;
