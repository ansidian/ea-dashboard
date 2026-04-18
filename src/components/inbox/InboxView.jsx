import { createPortal } from "react-dom";
// eslint-disable-next-line no-unused-vars
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useKeyHold from "../../hooks/useKeyHold";
import {
  Inbox, Mail, Send, Trash2, Pin, Clock, Check, CheckCheck,
  RefreshCw, Search, ChevronDown, ChevronRight, Zap, FileText, BellOff,
  Layers, Sparkles, X, Reply, ArrowUp, ArrowDown, Briefcase, GraduationCap,
  DollarSign, AlertCircle, CreditCard, ExternalLink,
} from "lucide-react";
import { deriveLane, LANE, briefingPhaseLabel } from "../../lib/redesign-helpers";
import { useDashboard } from "../../context/DashboardContext";
import BillBadge from "../bills/BillBadge";
import {
  getEmailBody, peekEmailBody, markEmailAsRead, trashEmail,
  pinEmail, unpinEmail, snoozeEmail,
} from "../../api";
import { getGmailUrl } from "../../lib/email-links";
import EmailIframe from "../email/EmailIframe";

const ACCOUNT_ICON = { Mail, Briefcase, GraduationCap, DollarSign, Inbox };

function Kbd({ children }) {
  return (
    <kbd
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: 18, height: 18, padding: "0 5px",
        fontSize: 10, fontFamily: "Fira Code, ui-monospace, monospace", fontWeight: 500,
        color: "rgba(205,214,244,0.55)",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 4, letterSpacing: 0,
      }}
    >
      {children}
    </kbd>
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

// Natural phrase variant — picks "5m ago" / "3h ago" / "5d ago" for recent
// timestamps and "on Apr 7" for anything older than a week. Avoids the
// "Triaged Apr 7 ago" grammar bug that comes from naively appending " ago".
function timeSince(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const mins = Math.max(0, (Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)}h ago`;
  const days = hrs / 24;
  if (days < 7) return `${Math.round(days)}d ago`;
  return `on ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function timeClock(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function Avatar({ name, email, color, size = 28 }) {
  const initials = (name || email || "?")
    .split(/[\s@]/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <div
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: 999,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: size < 28 ? 9 : 11, fontWeight: 600, letterSpacing: 0.3,
        background: `linear-gradient(135deg, ${color}30, ${color}10)`,
        color,
        border: `1px solid ${color}28`,
      }}
    >
      {initials}
    </div>
  );
}

function Eyebrow({ children, style }) {
  return (
    <div
      style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 2.6, textTransform: "uppercase",
        color: "rgba(205,214,244,0.55)", ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ======================================================================
 * SIDEBAR
 * ====================================================================== */
function AccountRow({ acc, all, accent, accountId, setAccountId, totalUnread, compact }) {
  const [hover, setHover] = useState(false);
  const accKey = acc?.id || acc?.name;
  const isActive = accountId === (all ? "__all" : accKey);
  const color = all ? accent : (acc?.color || accent);
  const count = all ? totalUnread : acc?.unread;
  const Icon = ACCOUNT_ICON[acc?.icon] || (all ? Inbox : Mail);

  return (
    <button
      type="button"
      onClick={() => setAccountId(all ? "__all" : accKey)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "8px 10px",
        background: isActive ? `${color}12` : (hover ? "rgba(255,255,255,0.03)" : "transparent"),
        border: `1px solid ${isActive ? `${color}28` : "transparent"}`,
        borderRadius: 8, cursor: "pointer",
        fontFamily: "inherit", textAlign: "left",
        transition: "all 120ms",
      }}
    >
      <span
        style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: `${color}18`, color,
        }}
      >
        <Icon size={12} />
      </span>
      {!compact && (
        <>
          <span
            style={{
              flex: 1, fontSize: 12, fontWeight: 500,
              color: isActive ? "#fff" : "rgba(205,214,244,0.8)",
            }}
          >
            {all ? "All accounts" : (acc.name || acc.email)}
          </span>
          {count > 0 && (
            <span
              style={{
                fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999,
                background: `${color}18`, color,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count}
            </span>
          )}
        </>
      )}
    </button>
  );
}

function LaneRow({ laneKey, lane, setLane, laneCounts }) {
  const [hover, setHover] = useState(false);
  const L = LANE[laneKey];
  const isActive = lane === laneKey;
  const count = laneCounts[laneKey] || 0;

  return (
    <button
      type="button"
      onClick={() => setLane(laneKey)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "7px 10px",
        background: isActive ? L.soft : (hover ? "rgba(255,255,255,0.03)" : "transparent"),
        border: `1px solid ${isActive ? L.border : "transparent"}`,
        borderRadius: 8, cursor: "pointer",
        fontFamily: "inherit", textAlign: "left",
        transition: "all 120ms",
      }}
    >
      <span
        style={{
          width: 3, height: 16, flexShrink: 0, borderRadius: 2,
          background: L.color, opacity: isActive ? 1 : 0.6,
          boxShadow: isActive ? `0 0 8px ${L.color}60` : "none",
        }}
      />
      <span
        style={{
          flex: 1, fontSize: 12, fontWeight: 500,
          color: isActive ? "#fff" : "rgba(205,214,244,0.75)",
        }}
      >
        {L.label}
      </span>
      <span
        style={{
          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
          background: "rgba(255,255,255,0.04)", color: "rgba(205,214,244,0.45)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function LaneAll({ accent, lane, setLane, laneCounts }) {
  const [hover, setHover] = useState(false);
  const isActive = lane === "__all";
  const count = (laneCounts.action || 0) + (laneCounts.fyi || 0) + (laneCounts.noise || 0);
  return (
    <button
      type="button"
      onClick={() => setLane("__all")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "7px 10px",
        background: isActive ? `${accent}1a` : (hover ? "rgba(255,255,255,0.03)" : "transparent"),
        border: `1px solid ${isActive ? `${accent}40` : "transparent"}`,
        borderRadius: 8, cursor: "pointer",
        fontFamily: "inherit", textAlign: "left",
        transition: "all 120ms",
      }}
    >
      <Layers size={13} color={isActive ? accent : "rgba(205,214,244,0.6)"} />
      <span
        style={{
          flex: 1, fontSize: 12, fontWeight: 500,
          color: isActive ? "#fff" : "rgba(205,214,244,0.75)",
        }}
      >
        Everything
      </span>
      <span
        style={{
          fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4,
          background: "rgba(255,255,255,0.04)", color: "rgba(205,214,244,0.45)",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function Sidebar({
  accent, accounts, accountId, setAccountId,
  lane, setLane, laneCounts, totalUnread, compact,
  onOpenDashboard,
}) {
  return (
    <div
      style={{
        width: compact ? 60 : 232, flexShrink: 0,
        padding: "14px 10px", display: "flex", flexDirection: "column", gap: 18,
        borderRight: "1px solid rgba(255,255,255,0.04)",
        background: "rgba(24,24,37,0.35)",
        transition: "width 200ms cubic-bezier(0.16,1,0.3,1)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={onOpenDashboard}
        title="Back to dashboard"
        style={{
          display: "flex", alignItems: "center", justifyContent: compact ? "center" : "flex-start",
          gap: 8, padding: compact ? "10px" : "10px 12px",
          background: `linear-gradient(135deg, ${accent}30, ${accent}15)`,
          border: `1px solid ${accent}55`,
          borderRadius: 10, color: accent, cursor: "pointer",
          fontFamily: "inherit", fontSize: 12, fontWeight: 600,
          boxShadow: `0 4px 12px ${accent}10, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        <Send size={13} />
        {!compact && <span>Open dashboard</span>}
        {!compact && <span style={{ marginLeft: "auto" }}><Kbd>1</Kbd></span>}
      </button>

      <div>
        {!compact && <Eyebrow style={{ padding: "0 10px 8px" }}>Accounts</Eyebrow>}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <AccountRow
            all
            accent={accent}
            accountId={accountId}
            setAccountId={setAccountId}
            totalUnread={totalUnread}
            compact={compact}
          />
          {accounts.map((acc) => (
            <AccountRow
              key={acc.id || acc.name}
              acc={acc}
              accent={accent}
              accountId={accountId}
              setAccountId={setAccountId}
              totalUnread={totalUnread}
              compact={compact}
            />
          ))}
        </div>
      </div>

      {!compact && (
        <div>
          <Eyebrow style={{ padding: "0 10px 8px" }}>Triage lanes</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <LaneAll accent={accent} lane={lane} setLane={setLane} laneCounts={laneCounts} />
            <LaneRow laneKey="action" lane={lane} setLane={setLane} laneCounts={laneCounts} />
            <LaneRow laneKey="fyi" lane={lane} setLane={setLane} laneCounts={laneCounts} />
            <LaneRow laneKey="noise" lane={lane} setLane={setLane} laneCounts={laneCounts} />
          </div>
        </div>
      )}

      {!compact && (
        <div style={{ marginTop: "auto", padding: 10 }}>
          <Eyebrow style={{ marginBottom: 8 }}>Shortcuts</Eyebrow>
          <div style={{ display: "grid", rowGap: 6, fontSize: 10, color: "rgba(205,214,244,0.5)" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Kbd>J</Kbd><Kbd>K</Kbd><span>Navigate</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Kbd>E</Kbd><span>Hold · Trash</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Kbd>R</Kbd><span>Reply</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Kbd>S</Kbd><span>Hold · Snooze</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Kbd>P</Kbd><span>Pin</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Kbd>⌘F</Kbd><span>Find</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Kbd>⌘K</Kbd><span>Command</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ======================================================================
 * DIGEST STRIP
 * ====================================================================== */
function DigestStrip({ accent, counts, liveCount, summary, onJumpLane }) {
  const items = [
    { key: "action", count: counts.action, verb: "need you", ...LANE.action },
    { key: "fyi",    count: counts.fyi,    verb: "for your info", ...LANE.fyi },
    { key: "noise",  count: counts.noise,  verb: "filtered", ...LANE.noise },
  ];
  return (
    <div
      style={{
        margin: "14px 18px 0", padding: "14px 18px",
        borderRadius: 12,
        background: `linear-gradient(135deg, ${accent}14, rgba(137,220,235,0.04))`,
        border: `1px solid ${accent}38`,
        display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          paddingRight: 22, borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <Sparkles size={14} color={accent} />
        <div>
          <div
            style={{
              fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
              color: accent, fontWeight: 700,
            }}
          >
            Claude briefing
          </div>
          {summary && (
            <div
              className="ea-display"
              style={{
                fontSize: 12, color: "rgba(205,214,244,0.9)",
                marginTop: 4, fontStyle: "italic",
              }}
            >
              {summary}
            </div>
          )}
        </div>
      </div>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onJumpLane(it.key)}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 10, padding: "2px 6px",
            borderRadius: 8, fontFamily: "inherit",
          }}
        >
          <span style={{ width: 3, height: 26, borderRadius: 2, background: it.color, opacity: 0.8 }} />
          <div style={{ textAlign: "left" }}>
            <div
              style={{
                fontSize: 18, fontWeight: 500, color: "#fff", lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {it.count}
            </div>
            <div
              style={{
                fontSize: 10, color: it.color, letterSpacing: 0.6,
                textTransform: "uppercase", fontWeight: 600, marginTop: 3,
              }}
            >
              {it.verb}
            </div>
          </div>
        </button>
      ))}
      <span style={{ flex: 1 }} />
      {liveCount > 0 && (
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "6px 10px 6px 8px", borderRadius: 8,
            background: "rgba(137,180,250,0.08)",
            border: "1px dashed rgba(137,180,250,0.28)",
          }}
        >
          <span
            style={{
              position: "relative", display: "inline-flex",
              alignItems: "center", justifyContent: "center",
              width: 10, height: 10,
            }}
          >
            <span
              style={{
                position: "absolute", inset: 0, borderRadius: 999,
                background: "#89b4fa", opacity: 0.3,
                animation: "livepulse 2s ease-out infinite",
              }}
            />
            <span
              style={{
                width: 5, height: 5, borderRadius: 999, background: "#89b4fa",
                boxShadow: "0 0 6px #89b4fa",
              }}
            />
          </span>
          <div style={{ textAlign: "left" }}>
            <div
              style={{
                fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
                color: "#89b4fa", fontWeight: 700,
              }}
            >
              Live · untriaged
            </div>
            <div style={{ fontSize: 11, color: "rgba(205,214,244,0.85)", marginTop: 2 }}>
              <span
                style={{
                  fontWeight: 600, color: "#fff",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {liveCount}
              </span>{" "}
              new since briefing
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ======================================================================
 * LIST (swimlane or flat)
 * ====================================================================== */
function EmailRow({ email, account, selected, onOpen, density, showPreview, accent, pinned }) {
  const [hover, setHover] = useState(false);
  const untriaged = email._untriaged;
  const laneKey = email._lane;
  const L = laneKey && LANE[laneKey];
  const urgColor = email.urgency === "high" ? "#f38ba8"
                  : email.urgency === "medium" ? "#fab387"
                  : "#a6adc8";
  const dimmed = email.read && !pinned;
  const barColor = pinned ? accent : (untriaged ? "#89b4fa" : (L ? L.color : "#6c7086"));
  const vPad = density === "compact" ? 8 : density === "comfortable" ? 14 : 11;
  const hPad = 14;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(email)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(email); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "flex", alignItems: "flex-start", gap: 10,
        padding: `${vPad}px ${hPad}px ${vPad}px ${hPad + 4}px`,
        cursor: "pointer",
        background: selected ? `${accent}14` : hover ? "rgba(255,255,255,0.025)" : "transparent",
        borderLeft: selected ? `2px solid ${accent}` : "2px solid transparent",
        transition: "background 120ms, border-color 120ms",
        opacity: dimmed && !hover ? 0.55 : 1,
      }}
    >
      <div
        style={{
          position: "absolute", left: 0, top: vPad, bottom: vPad,
          width: 3, borderRadius: 2,
          background: untriaged
            ? `repeating-linear-gradient(180deg, ${barColor} 0 4px, transparent 4px 7px)`
            : barColor,
          opacity: pinned ? 0.9 : untriaged ? 0.55 : 0.7,
          boxShadow: pinned ? `0 0 8px ${accent}66`
                   : untriaged ? "none"
                   : `0 0 6px ${barColor}40`,
        }}
      />
      {density === "compact" ? (
        <div
          style={{
            width: 6, height: 6, marginTop: 8, borderRadius: 999,
            background: email.read ? "transparent" : urgColor, flexShrink: 0,
            boxShadow: email.read ? "none" : `0 0 6px ${urgColor}80`,
          }}
        />
      ) : (
        <Avatar
          name={email.from}
          email={email.fromEmail}
          color={account?.color || accent}
          size={density === "comfortable" ? 30 : 26}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 12, fontWeight: email.read ? 500 : 600,
              color: email.read ? "rgba(205,214,244,0.7)" : "rgba(255,255,255,0.96)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              maxWidth: 200,
            }}
          >
            {email.from}
          </span>
          {pinned && <Pin size={10} color={accent} />}
          <span style={{ flex: 1 }} />
          <span
            style={{
              fontSize: 10, fontVariantNumeric: "tabular-nums", fontWeight: 500,
              color: email.urgency === "high" ? urgColor : "rgba(205,214,244,0.4)",
            }}
          >
            {timeAgo(email.date)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
          <span
            style={{
              flex: 1, fontSize: 13, fontWeight: email.read ? 400 : 600,
              color: email.read ? "rgba(205,214,244,0.78)" : "rgba(255,255,255,0.96)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {email.subject}
          </span>
          {untriaged && (
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
                padding: "2px 6px", borderRadius: 4,
                color: "#89b4fa", background: "rgba(137,180,250,0.08)",
                border: "1px dashed rgba(137,180,250,0.28)",
              }}
            >
              <span
                style={{
                  width: 4, height: 4, borderRadius: 999, background: "#89b4fa",
                  boxShadow: "0 0 5px #89b4fa",
                }}
              />
              Live
            </span>
          )}
          {!untriaged && email.urgentFlag && email._lane !== "noise" && (
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
                padding: "2px 6px", borderRadius: 4,
                color: urgColor, background: `${urgColor}1c`, border: `1px solid ${urgColor}35`,
              }}
            >
              {email.urgentFlag.label || email.urgency}
            </span>
          )}
        </div>
        {showPreview && density !== "compact" && email.preview && (
          <div
            style={{
              marginTop: 4, fontSize: 11, color: "rgba(205,214,244,0.45)",
              lineHeight: 1.5,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}
          >
            {email.preview}
          </div>
        )}
      </div>
    </div>
  );
}

function StickyHeader({ children, borderColor }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "12px 16px 8px",
        position: "sticky", top: 0, zIndex: 2,
        background: "linear-gradient(180deg, rgba(30,30,46,0.98), rgba(30,30,46,0.92))",
        backdropFilter: "blur(8px)",
        borderBottom: `1px solid ${borderColor}`,
      }}
    >
      {children}
    </div>
  );
}

function InboxList({
  accent, emails, accountsById,
  selectedId, onOpen, density, layout, showPreview, pinnedIds,
  searchQuery, onSearchChange, onMarkAllRead, onRefresh,
  totalCount, unreadCount, briefingAgoLabel, briefingGeneratedAt, searchRef,
}) {
  const [collapsed, setCollapsed] = useState({});
  const toggleLane = (k) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  const grouped = useMemo(() => {
    const g = { pinned: [], live: [], action: [], fyi: [], noise: [] };
    for (const e of emails) {
      const key = e.uid || e.id;
      if (pinnedIds?.has?.(key) || pinnedIds?.has?.(e.id)) g.pinned.push(e);
      else if (e._untriaged) g.live.push(e);
      else g[e._lane]?.push(e);
    }
    g.pinned.sort((a, b) => new Date(b.date) - new Date(a.date));
    g.live.sort((a, b) => new Date(b.date) - new Date(a.date));
    return g;
  }, [emails, pinnedIds]);

  const renderRows = (list) => list.map((email) => {
    const rowKey = email.id || email.uid;
    return (
      <motion.div
        key={rowKey}
        layout
        layoutId={rowKey}
        transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <EmailRow
          email={email}
          account={accountsById[email.accountId] || accountsById[email._accountKey]}
          selected={selectedId === email.id}
          onOpen={onOpen}
          density={density}
          showPreview={showPreview}
          accent={accent}
          pinned={!!(pinnedIds?.has?.(email.uid) || pinnedIds?.has?.(email.id))}
        />
      </motion.div>
    );
  });

  return (
    <div
      style={{
        display: "flex", flexDirection: "column", minWidth: 0, flex: 1,
        background: "rgba(24,24,37,0.30)",
        borderRight: "1px solid rgba(255,255,255,0.04)",
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: "12px 14px", display: "flex", alignItems: "center", gap: 10,
          borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0,
        }}
      >
        <div
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 8,
            padding: "7px 10px", borderRadius: 8,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <Search size={12} color="rgba(205,214,244,0.4)" />
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === "Escape") {
                e.preventDefault();
                if (searchQuery) onSearchChange("");
                e.currentTarget.blur();
              }
            }}
            placeholder='Search or ask Claude — "bills due this week"'
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: 12, color: "#cdd6f4", fontFamily: "inherit",
            }}
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              title="Clear search"
              style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 18, height: 18, padding: 0,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 4, cursor: "pointer",
                color: "rgba(205,214,244,0.7)", fontFamily: "inherit",
                transition: "all 120ms",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(243,139,168,0.14)";
                e.currentTarget.style.borderColor = "rgba(243,139,168,0.32)";
                e.currentTarget.style.color = "#f38ba8";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.color = "rgba(205,214,244,0.7)";
              }}
            >
              <X size={10} />
            </button>
          ) : (
            <Kbd>⌘F</Kbd>
          )}
        </div>
        <IconBtn onClick={onMarkAllRead} title="Mark all read"><CheckCheck size={11} /></IconBtn>
        <IconBtn onClick={onRefresh} title="Refresh"><RefreshCw size={11} /></IconBtn>
      </div>

      <div
        style={{
          padding: "8px 16px", display: "flex", alignItems: "center", gap: 10,
          borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: "rgba(205,214,244,0.6)" }}>
          <span
            style={{
              color: "#fff", fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {unreadCount}
          </span>{" "}
          <span style={{ color: "rgba(205,214,244,0.4)" }}>unread · </span>
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{totalCount}</span>
          <span style={{ color: "rgba(205,214,244,0.4)" }}> total</span>
        </span>
        <span style={{ flex: 1 }} />
        {briefingAgoLabel && (
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 10, color: `${accent}cc`,
            }}
          >
            <Sparkles size={10} color={accent} />
            {briefingAgoLabel}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {layout === "swimlanes" ? (
          <>
            {grouped.pinned.length > 0 && (
              <div>
                <StickyHeader borderColor={`${accent}22`}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleLane("pinned")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleLane("pinned"); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      cursor: "pointer", background: "transparent", border: "none",
                      fontFamily: "inherit", color: "inherit", padding: 0,
                    }}
                  >
                    <Pin size={11} color={accent} />
                    <span
                      style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: 2,
                        textTransform: "uppercase", color: accent,
                      }}
                    >
                      Pinned
                    </span>
                    <span
                      style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999,
                        background: `${accent}22`, color: `${accent}cc`,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {grouped.pinned.length}
                    </span>
                    <span style={{ flex: 1 }} />
                    {collapsed.pinned ? <ChevronRight size={12} color="rgba(205,214,244,0.4)" /> : <ChevronDown size={12} color="rgba(205,214,244,0.4)" />}
                  </div>
                </StickyHeader>
                {!collapsed.pinned && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {renderRows(grouped.pinned)}
                  </div>
                )}
              </div>
            )}
            {grouped.live.length > 0 && (
              <div>
                <StickyHeader borderColor="rgba(137,180,250,0.12)">
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleLane("live")}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleLane("live"); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, width: "100%",
                      cursor: "pointer", background: "transparent", border: "none",
                      fontFamily: "inherit", color: "inherit", padding: 0,
                    }}
                  >
                    <span
                      style={{
                        position: "relative", display: "inline-flex",
                        alignItems: "center", justifyContent: "center",
                        width: 10, height: 10,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute", inset: 0, borderRadius: 999,
                          background: "#89b4fa", opacity: 0.3,
                          animation: "livepulse 2s ease-out infinite",
                        }}
                      />
                      <span
                        style={{
                          width: 5, height: 5, borderRadius: 999, background: "#89b4fa",
                          boxShadow: "0 0 8px #89b4fa",
                        }}
                      />
                    </span>
                    <span
                      style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: 2,
                        textTransform: "uppercase", color: "#89b4fa",
                      }}
                    >
                      {briefingPhaseLabel(briefingGeneratedAt)}
                    </span>
                    <span
                      style={{
                        fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999,
                        background: "rgba(137,180,250,0.14)", color: "rgba(137,180,250,0.9)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {grouped.live.length} new
                    </span>
                    <span style={{ flex: 1 }} />
                    <span
                      style={{
                        fontSize: 9, fontWeight: 600, letterSpacing: 0.5,
                        textTransform: "uppercase", color: "rgba(205,214,244,0.4)",
                      }}
                    >
                      Not yet triaged
                    </span>
                    {collapsed.live ? <ChevronRight size={12} color="rgba(205,214,244,0.4)" /> : <ChevronDown size={12} color="rgba(205,214,244,0.4)" />}
                  </div>
                </StickyHeader>
                {!collapsed.live && (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {renderRows(grouped.live)}
                  </div>
                )}
              </div>
            )}
            {["action", "fyi", "noise"].map((k) => (
              grouped[k].length > 0 && (
                <div key={k}>
                  <StickyHeader borderColor="rgba(255,255,255,0.03)">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleLane(k)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleLane(k); }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, width: "100%",
                        cursor: "pointer", background: "transparent", border: "none",
                        fontFamily: "inherit", color: "inherit", padding: 0,
                      }}
                    >
                      <LaneIcon laneKey={k} />
                      <span
                        style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: 2,
                          textTransform: "uppercase", color: LANE[k].color,
                        }}
                      >
                        {LANE[k].label}
                      </span>
                      <span
                        style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999,
                          background: LANE[k].soft, color: `${LANE[k].color}cc`,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {grouped[k].length}
                      </span>
                      <span style={{ flex: 1 }} />
                      {collapsed[k] ? <ChevronRight size={12} color="rgba(205,214,244,0.4)" /> : <ChevronDown size={12} color="rgba(205,214,244,0.4)" />}
                    </div>
                  </StickyHeader>
                  {!collapsed[k] && (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {renderRows(grouped[k])}
                    </div>
                  )}
                </div>
              )
            ))}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {renderRows(emails)}
          </div>
        )}
        {emails.length === 0 && (
          <div
            style={{
              padding: 40, textAlign: "center",
              color: "rgba(205,214,244,0.4)", fontSize: 12,
            }}
          >
            <Mail size={22} color="rgba(205,214,244,0.25)" style={{ marginBottom: 10 }} />
            <div>No emails here.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "6px 10px", borderRadius: 8,
        fontSize: 11, fontWeight: 500, fontFamily: "inherit",
        cursor: "pointer", transition: "all 150ms",
        background: hover ? "rgba(255,255,255,0.04)" : "transparent",
        color: hover ? "rgba(205,214,244,0.9)" : "rgba(205,214,244,0.55)",
        border: `1px solid ${hover ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)"}`,
        letterSpacing: 0.2, whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function LaneIcon({ laneKey }) {
  const color = LANE[laneKey].color;
  const Icon = laneKey === "action" ? Zap : laneKey === "fyi" ? FileText : BellOff;
  return <Icon size={11} color={color} />;
}

/* ======================================================================
 * READER (right pane)
 * ====================================================================== */
function defaultSnoozeTs() {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  t.setHours(9, 0, 0, 0);
  return t.getTime();
}

// Build snooze presets from "now". Filters out any preset already in the past
// (e.g. "Tonight 7pm" after 7pm) so the picker never offers a no-op.
function buildSnoozePresets() {
  const now = new Date();
  const nowTs = now.getTime();
  const tonight7 = new Date(now); tonight7.setHours(19, 0, 0, 0);
  const tomorrow9 = new Date(now); tomorrow9.setDate(now.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0);
  const weekendSat = new Date(now);
  const daysToSat = (6 - now.getDay() + 7) % 7 || 7;
  weekendSat.setDate(now.getDate() + daysToSat); weekendSat.setHours(9, 0, 0, 0);
  const nextMon = new Date(now);
  const daysToMon = (8 - now.getDay()) % 7 || 7;
  nextMon.setDate(now.getDate() + daysToMon); nextMon.setHours(9, 0, 0, 0);
  return [
    { label: "1 hour", at: nowTs + 3600_000 },
    { label: "3 hours", at: nowTs + 3 * 3600_000 },
    tonight7.getTime() > nowTs ? { label: "Tonight 7pm", at: tonight7.getTime() } : null,
    { label: "Tomorrow 9am", at: tomorrow9.getTime() },
    { label: "This weekend", at: weekendSat.getTime() },
    { label: "Next Monday", at: nextMon.getTime() },
  ].filter(Boolean);
}

// Floating picker anchored to the Snooze button. Follows the project's
// "Floating Panel Pattern" — portal, fixed positioning, isolated stacking,
// click-outside dismiss, and wheel-boundary capture so scroll inside the
// picker can't leak to the page.
function SnoozePicker({ anchorRef, onSelect, onClose }) {
  const panelRef = useRef(null);
  const [pos, setPos] = useState(null);

  useEffect(() => {
    function updatePos() {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      const panelW = 220, panelH = 260;
      setPos({
        top: Math.min(r.bottom + 6, window.innerHeight - panelH - 10),
        left: Math.max(10, Math.min(r.left, window.innerWidth - panelW - 10)),
      });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [anchorRef]);

  useEffect(() => {
    function onDown(e) {
      if (panelRef.current?.contains(e.target)) return;
      if (anchorRef.current?.contains(e.target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose, anchorRef]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return undefined;
    function onWheel(e) {
      const atTop = el.scrollTop === 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) e.preventDefault();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pos]);

  if (!pos) return null;
  const presets = buildSnoozePresets();

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      style={{
        position: "fixed", top: pos.top, left: pos.left,
        width: 220, maxHeight: 260, overflowY: "auto",
        overscrollBehavior: "contain", isolation: "isolate",
        background: "#16161e",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 8,
        boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
        padding: 6,
        zIndex: 9999,
        fontFamily: "inherit",
      }}
    >
      <div
        style={{
          padding: "6px 10px 8px",
          fontSize: 10, color: "rgba(205,214,244,0.4)",
          textTransform: "uppercase", letterSpacing: 0.5,
        }}
      >
        Snooze until
      </div>
      {presets.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => { onSelect(p.at); onClose(); }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", padding: "8px 10px",
            background: "transparent", border: "none", cursor: "pointer",
            color: "rgba(205,214,244,0.85)", fontSize: 12, fontFamily: "inherit",
            borderRadius: 6, textAlign: "left",
          }}
        >
          <span>{p.label}</span>
          <span style={{ fontSize: 10, color: "rgba(205,214,244,0.4)" }}>
            {new Date(p.at).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}
          </span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

function QuickAction({
  icon: Icon, label, onClick, primary, danger, hint,
  accent = "#cba6da", buttonRef, title,
  holdProgress = 0, holdColor,
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative", overflow: "hidden",
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "7px 11px", borderRadius: 8,
        fontSize: 11, fontWeight: 600, fontFamily: "inherit",
        cursor: "pointer", transition: "all 120ms",
        background: primary ? `linear-gradient(135deg, ${accent}38, rgba(137,220,235,0.18))`
                 : hover ? "rgba(255,255,255,0.05)"
                 : "rgba(255,255,255,0.02)",
        border: primary ? `1px solid ${accent}66`
              : `1px solid ${danger ? "rgba(243,139,168,0.22)" : "rgba(255,255,255,0.08)"}`,
        color: primary ? accent : danger ? "#f38ba8" : "rgba(205,214,244,0.7)",
        whiteSpace: "nowrap",
      }}
    >
      {holdProgress > 0 && holdColor && (
        <span
          aria-hidden
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: `${holdProgress * 100}%`,
            background: `linear-gradient(90deg, ${holdColor}38, ${holdColor}1f)`,
            pointerEvents: "none",
            transition: "width 40ms linear",
          }}
        />
      )}
      {Icon && <Icon size={11} style={{ position: "relative" }} />}
      {label && <span style={{ position: "relative" }}>{label}</span>}
      {hint && (
        <span style={{ position: "relative", fontSize: 9, opacity: 0.6, marginLeft: 2, fontFamily: "Fira Code, monospace" }}>
          {hint}
        </span>
      )}
    </button>
  );
}

function TriagePanel({ email, accent }) {
  if (!email?.claude && !email?.aiSummary) return null;
  const summary = email.claude?.summary || email.aiSummary;
  const points = email.claude?.points || email.claude?.bulletPoints || [];
  const why = email.claude?.why;
  const laneKey = email._lane;
  const L = laneKey && LANE[laneKey];
  const urg = email.urgency;
  const urgColor = urg === "high" ? "#f38ba8" : urg === "medium" ? "#fab387" : "#a6adc8";

  return (
    <div
      style={{
        margin: "16px 20px 0",
        borderRadius: 12, overflow: "hidden",
        background: `linear-gradient(135deg, ${accent}10, rgba(137,220,235,0.02))`,
        border: `1px solid ${accent}38`,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 6px" }}>
        <span
          style={{
            width: 22, height: 22, borderRadius: 6,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            background: `${accent}24`,
          }}
        >
          <Sparkles size={11} color={accent} />
        </span>
        <span
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            textTransform: "uppercase", color: accent,
          }}
        >
          Claude triage
        </span>
        <span style={{ flex: 1 }} />
        {L && (
          <span
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
              padding: "3px 7px", borderRadius: 4,
              color: L.color, background: L.soft, border: `1px solid ${L.border}`,
            }}
          >
            {L.label}
          </span>
        )}
        {urg && (
          <span
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase",
              padding: "3px 7px", borderRadius: 4,
              color: urgColor, background: `${urgColor}22`, border: `1px solid ${urgColor}44`,
            }}
          >
            {urg} urgency
          </span>
        )}
      </div>
      <div style={{ padding: "4px 14px 14px" }}>
        {summary && (
          <p
            className="ea-display"
            style={{
              margin: "4px 0 10px",
              fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.92)",
              fontWeight: 400,
            }}
          >
            {summary}
          </p>
        )}
        {points.length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", rowGap: 4 }}>
            {points.map((p, i) => (
              <li
                key={i}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 7,
                  fontSize: 11, color: "rgba(205,214,244,0.82)", lineHeight: 1.45,
                }}
              >
                <span
                  style={{
                    marginTop: 6, width: 3, height: 3, borderRadius: 999,
                    background: accent, flexShrink: 0, opacity: 0.8,
                  }}
                />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
        {why && L && (
          <div
            style={{
              marginTop: 10, paddingTop: 10,
              borderTop: `1px dashed ${accent}33`,
              fontSize: 10, color: "rgba(205,214,244,0.5)",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <AlertCircle size={10} color={`${accent}aa`} />
            Why this landed in{" "}
            <span style={{ color: L.color, fontWeight: 600 }}>{L.label}</span>: {why}
          </div>
        )}
      </div>
    </div>
  );
}

function EmailBodyPane({ state, fallback }) {
  const { loading, body, error } = state;
  if (loading) {
    return (
      <div style={{ padding: "22px 24px", display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 12, height: 12, borderRadius: "50%",
            border: "1.5px solid rgba(255,255,255,0.06)",
            borderTopColor: "rgba(205,214,244,0.6)",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span style={{ fontSize: 11, color: "rgba(205,214,244,0.5)" }}>Loading email…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: "22px 24px", fontSize: 12, color: "#f38ba8" }}>{error}</div>
    );
  }
  const text = body || fallback;
  if (!text) {
    return (
      <div style={{ padding: "22px 24px", fontSize: 12, color: "rgba(205,214,244,0.45)" }}>
        Email body unavailable.
      </div>
    );
  }
  const isHtml = /<[a-z!/]/i.test(text);
  if (isHtml) {
    // Iframe handles its own scroll; outer wrapper just clips and tints.
    return (
      <div
        style={{
          flex: 1, minHeight: 0, display: "flex", padding: "12px 16px 16px",
        }}
      >
        <div
          style={{
            flex: 1, minHeight: 0, borderRadius: 8, overflow: "hidden",
            background: "#fff",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <EmailIframe html={text} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 24px 28px" }}>
      <div
        style={{
          fontSize: 13.5, lineHeight: 1.7, color: "rgba(205,214,244,0.88)",
          whiteSpace: "pre-wrap",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function Reader({ email, account, accent, pinned, onAction, onClose, showTriage, showDraft, billOpen, setBillOpen, trashHoldProgress = 0, snoozeHoldProgress = 0 }) {
  const snoozeBtnRef = useRef(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  // Parent re-keys this component on email.id change so `drafting` resets
  // automatically — no setState-in-effect reconciliation needed.
  const [drafting, setDrafting] = useState(false);
  // Lazy-mount the bill form. Once the user has opened it for this email we
  // keep it mounted (the form state + Actual metadata is cheap to hold) so
  // the drawer can close-animate smoothly without the content flashing out.
  const [billMounted, setBillMounted] = useState(billOpen);
  useEffect(() => {
    if (billOpen) setBillMounted(true);
  }, [billOpen]);
  const emailKey = email?.uid || email?.id;
  // Seed from cache (or props) so flipping back to a previously-viewed email
  // renders the body synchronously instead of flashing the spinner. The
  // cache lives in api.js with a 5-minute TTL.
  const [bodyState, setBodyState] = useState(() => {
    if (!email) return { loading: false, body: null, error: null };
    if (email.fullBody) return { loading: false, body: email.fullBody, error: null };
    const cached = peekEmailBody(emailKey);
    if (cached) {
      return { loading: false, body: cached.html_body || cached.body || "", error: null };
    }
    return { loading: true, body: null, error: null };
  });

  // Intentionally NOT depending on the whole `email` object — when
  // markEmailRead flips `read` to true, the parent rebuilds the email object
  // (deep clone), which would re-fire this effect and re-fetch the body
  // (causing the load-twice flicker the user reported). Keying off uid/id
  // and the synchronously-known fullBody flag is enough.
  const hasFullBody = !!email?.fullBody;
  useEffect(() => {
    if (!emailKey) return undefined;
    if (hasFullBody) {
      setBodyState({ loading: false, body: email.fullBody, error: null });
      return undefined;
    }
    const cached = peekEmailBody(emailKey);
    if (cached) {
      setBodyState({ loading: false, body: cached.html_body || cached.body || "", error: null });
      return undefined;
    }
    let cancelled = false;
    setBodyState({ loading: true, body: null, error: null });
    getEmailBody(emailKey)
      .then((res) => {
        if (cancelled) return;
        setBodyState({ loading: false, body: res.html_body || res.body || "", error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setBodyState({ loading: false, body: null, error: err.message || "Failed to load email" });
      });
    return () => { cancelled = true; };
    // email.fullBody captured via hasFullBody flag; full email object
    // intentionally omitted to avoid re-fetch on read-state mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailKey, hasFullBody]);

  if (!email) {
    return (
      <div
        style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 10,
          color: "rgba(205,214,244,0.35)",
          background: "rgba(22,22,30,0.5)",
        }}
      >
        <Mail size={32} color="rgba(205,214,244,0.15)" />
        <div style={{ fontSize: 12 }}>Select an email</div>
        <div style={{ fontSize: 10, color: "rgba(205,214,244,0.3)" }}>
          <Kbd>J</Kbd> <Kbd>K</Kbd> to navigate
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1.3, minWidth: 0,
        display: "flex", flexDirection: "column",
        background: "rgba(22,22,30,0.5)",
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          display: "flex", alignItems: "center", gap: 8,
          borderBottom: "1px solid rgba(255,255,255,0.05)",
          flexShrink: 0,
        }}
      >
        <QuickAction icon={ArrowUp} hint="K" onClick={() => onAction("prev")} accent={accent} />
        <QuickAction icon={ArrowDown} hint="J" onClick={() => onAction("next")} accent={accent} />
        <span style={{ flex: 1 }} />
        {(email._untriaged || email.hasBill) && (
          <QuickAction
            icon={CreditCard}
            label={billOpen ? "Hide bill" : "Pay bill"}
            primary={!billOpen}
            onClick={() => setBillOpen((v) => !v)}
            accent="#a6e3a1"
          />
        )}
        <QuickAction
          icon={Pin}
          label={pinned ? "Pinned" : "Pin"}
          hint="P"
          onClick={() => onAction("pin")}
          accent={accent}
        />
        <QuickAction
          icon={Clock}
          label="Snooze"
          hint="S"
          buttonRef={snoozeBtnRef}
          onClick={() => setSnoozeOpen((v) => !v)}
          accent={accent}
          holdProgress={snoozeHoldProgress}
          holdColor="#f97316"
        />
        {snoozeOpen && (
          <SnoozePicker
            anchorRef={snoozeBtnRef}
            onSelect={(untilTs) => onAction("snooze", untilTs)}
            onClose={() => setSnoozeOpen(false)}
          />
        )}
        {(() => {
          const url = getGmailUrl(email);
          if (!url) return null;
          return (
            <QuickAction
              icon={ExternalLink}
              label="Open in Gmail"
              hint="O"
              title="Open in Gmail"
              onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              accent={accent}
            />
          );
        })()}
        <QuickAction
          icon={Trash2}
          label="Trash"
          hint="E"
          danger
          onClick={() => onAction("trash")}
          accent={accent}
          holdProgress={trashHoldProgress}
          holdColor="#f38ba8"
        />
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "rgba(205,214,244,0.5)", padding: 4, borderRadius: 4,
            display: "inline-flex", fontFamily: "inherit",
          }}
        >
          <X size={12} />
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ padding: "22px 24px 8px", flexShrink: 0 }}>
          <h1
            className="ea-display"
            style={{
              margin: 0, fontSize: 21, fontWeight: 500, color: "#fff",
              lineHeight: 1.2, letterSpacing: -0.3,
            }}
          >
            {email.subject}
          </h1>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar
              name={email.from}
              email={email.fromEmail}
              color={account?.color || accent}
              size={34}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                {email.from}
                {email.fromEmail && (
                  <span
                    style={{
                      fontSize: 11, color: "rgba(205,214,244,0.45)",
                      fontWeight: 400, marginLeft: 6,
                    }}
                  >
                    &lt;{email.fromEmail}&gt;
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11, color: "rgba(205,214,244,0.5)", marginTop: 2,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <span>to me</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{timeClock(email.date)}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span>{timeSince(email.date)}</span>
                {account?.name && (
                  <>
                    <span style={{ opacity: 0.4 }}>·</span>
                    <span style={{ color: account.color }}>{account.name}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {showTriage && email.claude && (
          <div style={{ flexShrink: 0 }}>
            <TriagePanel email={email} accent={accent} />
          </div>
        )}

        {email._untriaged && (
          <div
            style={{
              margin: "16px 20px 0",
              borderRadius: 12, padding: "10px 14px",
              background: "linear-gradient(135deg, rgba(137,180,250,0.06), rgba(137,180,250,0.02))",
              border: "1px dashed rgba(137,180,250,0.28)",
              display: "flex", alignItems: "center", gap: 10,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "relative", display: "inline-flex",
                alignItems: "center", justifyContent: "center",
                width: 22, height: 22, borderRadius: 6,
                background: "rgba(137,180,250,0.12)",
              }}
            >
              <span
                style={{
                  position: "absolute", inset: 4, borderRadius: 999,
                  background: "#89b4fa", opacity: 0.3,
                  animation: "livepulse 2s ease-out infinite",
                }}
              />
              <span style={{ width: 5, height: 5, borderRadius: 999, background: "#89b4fa", boxShadow: "0 0 6px #89b4fa", position: "relative" }} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 2,
                  textTransform: "uppercase", color: "#89b4fa",
                }}
              >
                Live · not yet triaged
              </div>
              <div
                className="ea-display"
                style={{
                  fontSize: 11, color: "rgba(205,214,244,0.7)", marginTop: 3,
                  fontStyle: "italic",
                }}
              >
                Arrived after your last briefing. Claude hasn't weighed in.
              </div>
            </div>
          </div>
        )}

        {/* Body split: email fills remaining space on the left; when the user
           opens Pay bill, the drawer slides in from the right via a max-width
           transition on its outer wrapper so the email iframe visibly
           narrows alongside the drawer's reveal (no jump). The inner aside
           stays at a fixed 360px width; the wrapper's overflow:hidden clips
           it while max-width animates. */}
        <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            <EmailBodyPane state={bodyState} fallback={email.body || email.preview} />
          </div>
          <div
            style={{
              maxWidth: billOpen ? 360 : 0,
              flexShrink: 0,
              overflow: "hidden",
              transition: "max-width 320ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {billMounted && (
              <aside
                style={{
                  width: 360,
                  height: "100%",
                  display: "flex", flexDirection: "column",
                  borderLeft: "1px solid rgba(203,166,218,0.12)",
                  background: "rgba(22,22,30,0.55)",
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                  isolation: "isolate",
                  opacity: billOpen ? 1 : 0,
                  transition: "opacity 200ms ease",
                }}
              >
                <div
                  style={{
                    padding: "11px 16px",
                    display: "flex", alignItems: "center", gap: 8,
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: 2,
                      textTransform: "uppercase", color: "#cba6da",
                    }}
                  >
                    Pay bill
                  </span>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    onClick={() => setBillOpen(false)}
                    aria-label="Close bill pay"
                    style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      color: "rgba(205,214,244,0.5)", padding: 4, borderRadius: 4,
                      display: "inline-flex", fontFamily: "inherit",
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
                <div style={{ padding: "14px 16px 18px" }}>
                  <BillBadge
                    layout="drawer"
                    bill={email.extractedBill || {
                      payee: "",
                      amount: null,
                      due_date: "",
                      type: "expense",
                    }}
                    model={email.billModel}
                    emailSubject={email.subject}
                    emailFrom={email.from}
                    emailBody={email.body || email.preview}
                  />
                </div>
              </aside>
            )}
          </div>
        </div>

        {showDraft && email.claude?.draftReply && (
          <div style={{ flexShrink: 0, maxHeight: "45%", overflowY: "auto" }}>
            <DraftReply
              key={email.id}
              email={email}
              accent={accent}
              onSend={() => { setDrafting(false); onAction("trash"); }}
              onDiscard={() => setDrafting(false)}
            />
          </div>
        )}
      </div>

      {!drafting && !showDraft && email.claude?.draftReply && (
        <div
          style={{
            padding: "10px 20px", flexShrink: 0,
            borderTop: "1px solid rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(24,24,37,0.8)",
          }}
        >
          <Sparkles size={11} color={accent} />
          <span style={{ fontSize: 11, color: "rgba(205,214,244,0.7)", flex: 1 }}>
            Claude drafted a reply.{" "}
            <span style={{ color: "rgba(205,214,244,0.45)" }}>
              Press <Kbd>R</Kbd> to review.
            </span>
          </span>
          <QuickAction icon={Reply} label="Review reply" primary onClick={() => setDrafting(true)} hint="R" accent={accent} />
        </div>
      )}
    </div>
  );
}

function DraftReply({ email, accent, onSend, onDiscard }) {
  // Parent keys this on email.id so the initializer runs fresh per email.
  const [text, setText] = useState(email.claude?.draftReply || "");
  return (
    <div
      style={{
        margin: "16px 20px 24px",
        borderRadius: 12, overflow: "hidden",
        background: "rgba(24,24,37,0.6)",
        border: `1px solid ${accent}44`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.05)",
        }}
      >
        <Sparkles size={11} color={accent} />
        <span
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 2,
            textTransform: "uppercase", color: accent,
          }}
        >
          Drafted by Claude
        </span>
        <span style={{ fontSize: 10, color: "rgba(205,214,244,0.5)", marginLeft: 4 }}>
          · Replying to {email.from}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onDiscard}
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            color: "rgba(205,214,244,0.5)", padding: 4, borderRadius: 4,
            display: "inline-flex", fontFamily: "inherit",
          }}
        >
          <X size={12} />
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{
          width: "100%", background: "transparent", border: "none", outline: "none",
          padding: "12px 14px", resize: "vertical",
          fontFamily: "inherit", fontSize: 13, color: "#cdd6f4", lineHeight: 1.55,
          boxSizing: "border-box",
        }}
      />
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 14px 10px",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "rgba(205,214,244,0.4)" }}>
          <Kbd>⌘</Kbd> <Kbd>↵</Kbd>
        </span>
        <QuickAction icon={Send} label="Send" primary onClick={onSend} accent={accent} />
      </div>
    </div>
  );
}

/* ======================================================================
 * TOP-LEVEL VIEW
 * ====================================================================== */
export default function InboxView({
  accent,
  customize,
  emailAccounts,
  briefingSummary,
  briefingGeneratedAt,
  liveEmails = [],
  pinnedIds,
  pinnedSnapshots = [],
  snoozedEntries = [],
  onOpenDashboard,
  onRefresh,
  seedSelectedId,
}) {
  const [accountId, setAccountId] = useState("__all");
  const [lane, setLane] = useState("__all");
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);
  // Reconcile external seed/pinned props by re-keying the inner view below.
  const [selectedId, setSelectedId] = useState(seedSelectedId || null);
  const [pinnedSet, setPinnedSet] = useState(() => new Set(pinnedIds || []));
  // Snapshots are keyed by uid and merged into flatEmails so pinned rows keep
  // rendering even when they've aged out of the current briefing window.
  const [pinnedSnapshotMap, setPinnedSnapshotMap] = useState(
    () => new Map((pinnedSnapshots || []).map((e) => [e.uid || e.id, e])),
  );
  // Snoozes: uid → until_ts (epoch ms). Emails with an active snooze are
  // hidden from visibleEmails until the timestamp passes. Snapshots aren't
  // kept client-side: when a snooze expires the server-side /api/live/all
  // poll naturally drops it (SELECT filters by until_ts > now), and the
  // email re-enters the inbox via its original briefing/live source.
  const [snoozedMap, setSnoozedMap] = useState(
    () => new Map((snoozedEntries || []).map((s) => [s.uid, s.until_ts])),
  );
  // Ticks every 30s so snoozes expiring mid-session re-enter the list without
  // requiring a full live refresh.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  // Session-local overrides for live (untriaged) emails. These aren't part
  // of the briefing, so the context handlers can't track them — we mirror
  // Gmail/iCloud mutations here until the next live poll refreshes the list.
  const [liveReadUids, setLiveReadUids] = useState(() => new Set());
  const [liveTrashedUids, setLiveTrashedUids] = useState(() => new Set());
  // Pay-bill drawer open/close. Lifted here (instead of inside Reader) so the
  // inbox list can shrink in coordination with the drawer sliding in.
  const [billOpen, setBillOpen] = useState(false);
  const { markEmailRead, markAccountEmailsRead, handleDismiss } = useDashboard();

  // Sync external seedSelectedId and pinnedIds changes into local state.
  // React 19 flags setState-in-effect; these are driven entirely by props
  // (no derivation from local state possible), so we disable the rule.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seedSelectedId) setSelectedId(seedSelectedId);
  }, [seedSelectedId]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinnedSet(new Set(pinnedIds || []));
  }, [pinnedIds]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPinnedSnapshotMap(new Map((pinnedSnapshots || []).map((e) => [e.uid || e.id, e])));
  }, [pinnedSnapshots]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSnoozedMap(new Map((snoozedEntries || []).map((s) => [s.uid, s.until_ts])));
  }, [snoozedEntries]);

  const accountsById = useMemo(() => {
    const map = {};
    for (const acc of emailAccounts) {
      map[acc.id || acc.name] = acc;
    }
    return map;
  }, [emailAccounts]);

  const flatEmails = useMemo(() => {
    const out = [];
    const seenUids = new Set();
    const pushEmail = (entry) => {
      const key = entry.uid || entry.id;
      if (key) seenUids.add(key);
      out.push(entry);
    };
    for (const acc of emailAccounts) {
      for (const e of acc.important || []) {
        pushEmail({
          ...e,
          _accountKey: acc.id || acc.name,
          _account: acc,
          _lane: deriveLane(e),
          _untriaged: false,
        });
      }
      for (const e of acc.noise || []) {
        pushEmail({
          ...e,
          _accountKey: acc.id || acc.name,
          _account: acc,
          _lane: "noise",
          _untriaged: false,
        });
      }
    }
    // Merge live emails from /api/live/all (arrived after last briefing,
    // not yet triaged by Claude). Match to an existing briefing account by
    // label when possible so the account sidebar groups them correctly;
    // fall back to a synthesized account from the email's own fields.
    const accountByName = new Map(emailAccounts.map((a) => [a.name, a]));
    const synthAccount = (e) => accountByName.get(e.account_label) || {
      name: e.account_label || "Live",
      color: e.account_color || "#89b4fa",
      icon: e.account_icon || "Mail",
      important: [],
      noise: [],
    };
    for (const e of liveEmails) {
      if (liveTrashedUids.has(e.uid)) continue;
      const acc = synthAccount(e);
      pushEmail({
        ...e,
        id: e.id || e.uid,
        preview: e.preview || e.body_preview || "",
        fromEmail: e.fromEmail || e.from_email,
        read: e.read || liveReadUids.has(e.uid),
        _accountKey: acc.id || acc.name,
        _account: acc,
        _lane: null,
        _untriaged: true,
        _live: true,
      });
    }
    // Merge pin snapshots for emails that have aged out of the briefing/live
    // window. Dedup on uid — if the email is already in the list, the live
    // version wins (fresher read state, full body).
    for (const snap of pinnedSnapshotMap.values()) {
      const key = snap.uid || snap.id;
      if (!key || seenUids.has(key)) continue;
      const acc = synthAccount(snap);
      pushEmail({
        ...snap,
        id: snap.id || snap.uid,
        preview: snap.preview || snap.body_preview || "",
        fromEmail: snap.fromEmail || snap.from_email,
        _accountKey: acc.id || acc.name,
        _account: acc,
        _lane: snap._lane || deriveLane(snap),
        _untriaged: false,
        _fromPinSnapshot: true,
      });
    }
    return out;
  }, [emailAccounts, liveEmails, liveReadUids, liveTrashedUids, pinnedSnapshotMap]);

  const visibleEmails = useMemo(() => {
    return flatEmails.filter((e) => {
      const uid = e.uid || e.id;
      const snoozeUntil = snoozedMap.get(uid);
      if (snoozeUntil && snoozeUntil > nowTick) return false;
      if (accountId !== "__all" && e._accountKey !== accountId) return false;
      if (lane !== "__all" && e._lane !== lane) return false;
      if (search) {
        const hay = `${e.subject || ""} ${e.from || ""} ${e.preview || ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => {
      // Pinned emails stick to the top regardless of lane/untriaged state.
      const aPin = pinnedSet.has(a.uid || a.id);
      const bPin = pinnedSet.has(b.uid || b.id);
      if (aPin !== bPin) return aPin ? -1 : 1;
      const order = { action: 0, fyi: 1, noise: 2 };
      if (a._untriaged && !b._untriaged) return -1;
      if (!a._untriaged && b._untriaged) return 1;
      if (order[a._lane] !== order[b._lane]) return (order[a._lane] ?? 3) - (order[b._lane] ?? 3);
      return new Date(b.date) - new Date(a.date);
    });
  }, [flatEmails, accountId, lane, search, snoozedMap, nowTick, pinnedSet]);

  const laneCounts = useMemo(() => {
    const c = { action: 0, fyi: 0, noise: 0 };
    for (const e of flatEmails) {
      if (accountId !== "__all" && e._accountKey !== accountId) continue;
      if (e._untriaged) continue;
      if (e._lane in c) c[e._lane]++;
    }
    return c;
  }, [flatEmails, accountId]);

  const liveCount = useMemo(() => {
    return flatEmails.filter((e) => e._untriaged
      && (accountId === "__all" || e._accountKey === accountId)).length;
  }, [flatEmails, accountId]);

  const totalUnread = useMemo(() => {
    return flatEmails.filter((e) => !e.read).length;
  }, [flatEmails]);
  const unreadInView = useMemo(() => {
    return visibleEmails.filter((e) => !e.read).length;
  }, [visibleEmails]);

  const selectedEmail = useMemo(() => {
    if (!selectedId) return null;
    return flatEmails.find((e) => e.id === selectedId) || null;
  }, [selectedId, flatEmails]);

  const trashHold = useKeyHold({
    key: "e",
    durationMs: 750,
    enabled: !!selectedEmail,
    onComplete: () => onAction("trash"),
  });

  const snoozeHold = useKeyHold({
    key: "s",
    durationMs: 750,
    enabled: !!selectedEmail,
    onComplete: () => onAction("snooze", defaultSnoozeTs()),
  });

  // Close the pay-bill drawer when moving to a different email so the user
  // always starts from a clean collapsed state — avoids the "did I already
  // open it?" confusion and the form visibly re-seeding with the new email's
  // extractedBill fields. React 19 flags setState-in-effect; this is a pure
  // prop-driven reset with no derived source, so we suppress the rule to
  // match the other seed/prop sync effects in this file.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBillOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const email = flatEmails.find((e) => e.id === selectedId);
    if (!email) return undefined;
    const t = setTimeout(() => {
      if (email._live) {
        // Live emails aren't in the briefing — mark on Gmail/iCloud directly
        // and mirror locally so the row dims without waiting for the next poll.
        setLiveReadUids((prev) => {
          if (prev.has(email.uid)) return prev;
          const next = new Set(prev);
          next.add(email.uid);
          return next;
        });
        markEmailAsRead(email.uid).catch(() => {});
      } else {
        markEmailRead(selectedId);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [selectedId, flatEmails, markEmailRead]);

  const moveBy = useCallback((dir) => {
    const idx = visibleEmails.findIndex((e) => e.id === selectedId);
    const nextIdx = Math.max(0, Math.min(visibleEmails.length - 1, idx + dir));
    const next = visibleEmails[nextIdx];
    if (next) setSelectedId(next.id);
  }, [visibleEmails, selectedId]);

  // Build a durable email snapshot for server-side pin/snooze storage. Strips
  // the transient _-prefixed fields that flatEmails attaches (account refs,
  // lane, live/untriaged flags) and keeps only what a row needs to render.
  const buildEmailSnapshot = useCallback((email) => {
    if (!email) return null;
    const acc = email._account;
    return {
      uid: email.uid || email.id,
      id: email.id || email.uid,
      subject: email.subject,
      from: email.from,
      fromEmail: email.fromEmail || email.from_email,
      from_email: email.from_email || email.fromEmail,
      preview: email.preview || email.body_preview || "",
      body_preview: email.body_preview || email.preview || "",
      date: email.date,
      read: !!email.read,
      account_id: email.account_id || acc?.account_id || acc?.id,
      account_email: email.account_email || acc?.email,
      account_label: email.account_label || acc?.name,
      account_color: email.account_color || acc?.color,
      account_icon: email.account_icon || acc?.icon,
      urgency: email.urgency,
      hasBill: email.hasBill,
      extractedBill: email.extractedBill,
      claude: email.claude,
      aiSummary: email.aiSummary,
    };
  }, []);

  const onAction = useCallback((kind, payload) => {
    if (!selectedEmail) return;
    const id = selectedEmail.id;
    const uid = selectedEmail.uid || id;
    if (kind === "next") moveBy(1);
    else if (kind === "prev") moveBy(-1);
    else if (kind === "trash") {
      if (selectedEmail._live) {
        // Live emails: hide locally + trash on the mail server.
        setLiveTrashedUids((prev) => {
          const n = new Set(prev);
          n.add(uid);
          return n;
        });
        trashEmail(uid).catch(() => {});
      } else {
        handleDismiss(id);
        // Briefing-path emails use the in-memory dismiss flow; still trash on
        // the mail server so the source is gone, matching the live path.
        trashEmail(uid).catch(() => {});
      }
      // Trash supersedes pin/snooze — clear both locally. Server mirrors this
      // in the trash endpoint so the next live poll agrees.
      setPinnedSet((p) => {
        if (!p.has(uid) && !p.has(id)) return p;
        const n = new Set(p); n.delete(uid); n.delete(id); return n;
      });
      setSnoozedMap((p) => {
        if (!p.has(uid)) return p;
        const n = new Map(p); n.delete(uid); return n;
      });
      moveBy(1);
    } else if (kind === "snooze") {
      const untilTs = Number(payload);
      if (!Number.isFinite(untilTs) || untilTs <= Date.now()) return;
      setSnoozedMap((p) => {
        const n = new Map(p); n.set(uid, untilTs); return n;
      });
      const snapshot = buildEmailSnapshot(selectedEmail);
      snoozeEmail(uid, untilTs, snapshot).catch(() => {
        // Roll back on failure so the email reappears instead of silently
        // vanishing from the inbox.
        setSnoozedMap((p) => {
          const n = new Map(p); n.delete(uid); return n;
        });
      });
      moveBy(1);
    } else if (kind === "pin") {
      const key = uid;
      const isPinned = pinnedSet.has(key) || pinnedSet.has(id);
      setPinnedSet((p) => {
        const n = new Set(p);
        if (isPinned) { n.delete(key); n.delete(id); } else { n.add(key); }
        return n;
      });
      if (isPinned) {
        setPinnedSnapshotMap((p) => {
          if (!p.has(key)) return p;
          const n = new Map(p); n.delete(key); return n;
        });
        unpinEmail(key).catch(() => {
          // Restore on failure.
          setPinnedSet((p) => { const n = new Set(p); n.add(key); return n; });
        });
      } else {
        const snapshot = buildEmailSnapshot(selectedEmail);
        setPinnedSnapshotMap((p) => {
          const n = new Map(p); n.set(key, snapshot); return n;
        });
        pinEmail(key, snapshot).catch(() => {
          setPinnedSet((p) => { const n = new Set(p); n.delete(key); return n; });
          setPinnedSnapshotMap((p) => {
            const n = new Map(p); n.delete(key); return n;
          });
        });
      }
    }
  }, [selectedEmail, moveBy, handleDismiss, pinnedSet, buildEmailSnapshot]);

  useEffect(() => {
    function onKey(e) {
      // Cmd+F / Ctrl+F → focus inbox search (intercept browser find)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        e.stopPropagation();
        searchRef.current?.focus();
        searchRef.current?.select?.();
        return;
      }
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); moveBy(1); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); moveBy(-1); }
      else if (e.key === "p") { e.preventDefault(); onAction("pin"); }
      else if (e.key === "o") {
        e.preventDefault();
        if (!selectedEmail) return;
        const url = getGmailUrl(selectedEmail);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveBy, onAction, selectedEmail]);

  const selectedAccount = selectedEmail
    ? accountsById[selectedEmail._accountKey] || selectedEmail._account
    : null;

  const showTriage = customize.aiVerbosity !== "minimal";
  const showDraft = customize.aiVerbosity === "full";
  const showPreview = customize.showPreview;
  const density = customize.inboxDensity;
  const sidebarCompact = customize.sidebarCompact;
  const layout = customize.inboxLayout;
  const grouping = customize.inboxGrouping;

  const briefingAgoLabel = briefingGeneratedAt
    ? `Triaged ${timeSince(briefingGeneratedAt)}`
    : null;

  return (
    <div
      style={{
        position: "relative", display: "flex", flexDirection: "column",
        height: "100%", minHeight: 0,
        background: "transparent", color: "#cdd6f4",
      }}
    >
      <DigestStrip
        accent={accent}
        counts={laneCounts}
        liveCount={liveCount}
        summary={briefingSummary}
        onJumpLane={(k) => setLane(k)}
      />

      <div style={{ flex: 1, display: "flex", minHeight: 0, padding: "14px 18px 18px", gap: 14 }}>
        <Sidebar
          accent={accent}
          accounts={emailAccounts}
          accountId={accountId}
          setAccountId={setAccountId}
          lane={lane}
          setLane={setLane}
          laneCounts={laneCounts}
          totalUnread={totalUnread}
          compact={sidebarCompact}
          onOpenDashboard={onOpenDashboard}
        />

        <div
          style={{
            flex: 1, display: "flex", minWidth: 0, minHeight: 0,
            border: "1px solid rgba(255,255,255,0.05)",
            borderRadius: 14, overflow: "hidden",
            background: "rgba(22,22,30,0.4)",
            boxShadow: "0 20px 40px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)",
          }}
        >
          {/* List column — shrinks to a narrower rail when the pay-bill
             drawer is open so the Reader (+ drawer) can claim more space. */}
          <div
            style={{
              flexGrow: 0, flexShrink: 0,
              flexBasis: billOpen ? "28%" : "43%",
              minWidth: 260,
              display: "flex", flexDirection: "column",
              minHeight: 0, overflow: "hidden",
              transition: "flex-basis 320ms cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <InboxList
              accent={accent}
              emails={visibleEmails}
              accountsById={accountsById}
              selectedId={selectedId}
              onOpen={(e) => setSelectedId(e.id)}
              density={density}
              layout={grouping}
              showPreview={showPreview}
              pinnedIds={pinnedSet}
              searchQuery={search}
              onSearchChange={setSearch}
              onMarkAllRead={markAccountEmailsRead}
              onRefresh={onRefresh}
              totalCount={visibleEmails.length}
              unreadCount={unreadInView}
              briefingAgoLabel={briefingAgoLabel}
              briefingGeneratedAt={briefingGeneratedAt}
              searchRef={searchRef}
            />
          </div>
          {layout !== "list-only" && (
            <Reader
              key={selectedEmail?.id || "empty"}
              email={selectedEmail}
              account={selectedAccount}
              accent={accent}
              pinned={!!selectedEmail && (pinnedSet.has(selectedEmail.uid) || pinnedSet.has(selectedEmail.id))}
              onAction={onAction}
              onClose={() => setSelectedId(null)}
              showTriage={showTriage}
              showDraft={showDraft}
              billOpen={billOpen}
              setBillOpen={setBillOpen}
              trashHoldProgress={trashHold.progress}
              snoozeHoldProgress={snoozeHold.progress}
            />
          )}
        </div>
      </div>
    </div>
  );
}
