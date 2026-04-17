import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Inbox, Mail, Send, Archive, Trash2, Pin, Clock, Check, CheckCheck,
  RefreshCw, Search, ChevronDown, ChevronRight, Zap, FileText, BellOff,
  Layers, Sparkles, X, Reply, ArrowUp, ArrowDown, Briefcase, GraduationCap,
  DollarSign, AlertCircle,
} from "lucide-react";
import { deriveLane, LANE } from "../../lib/redesign-helpers";
import { useDashboard } from "../../context/DashboardContext";

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
  const isActive = accountId === (all ? "__all" : acc.id);
  const color = all ? accent : (acc?.color || accent);
  const count = all ? totalUnread : acc?.unread;
  const Icon = ACCOUNT_ICON[acc?.icon] || (all ? Inbox : Mail);

  return (
    <button
      type="button"
      onClick={() => setAccountId(all ? "__all" : acc.id)}
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
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Kbd>E</Kbd><span>Archive</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Kbd>R</Kbd><span>Reply</span></div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Kbd>S</Kbd><span>Snooze</span></div>
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
  totalCount, unreadCount, briefingAgoLabel,
}) {
  const [collapsed, setCollapsed] = useState({});
  const toggleLane = (k) => setCollapsed((c) => ({ ...c, [k]: !c[k] }));

  const grouped = useMemo(() => {
    const g = { live: [], action: [], fyi: [], noise: [] };
    for (const e of emails) {
      if (e._untriaged) g.live.push(e);
      else g[e._lane]?.push(e);
    }
    g.live.sort((a, b) => new Date(b.date) - new Date(a.date));
    return g;
  }, [emails]);

  const renderRows = (list) => list.map((email) => (
    <EmailRow
      key={email.id || email.uid}
      email={email}
      account={accountsById[email.accountId] || accountsById[email._accountKey]}
      selected={selectedId === email.id}
      onOpen={onOpen}
      density={density}
      showPreview={showPreview}
      accent={accent}
      pinned={pinnedIds?.has?.(email.id)}
    />
  ));

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
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder='Search or ask Claude — "bills due this week"'
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: 12, color: "#cdd6f4", fontFamily: "inherit",
            }}
          />
          <Kbd>⌘K</Kbd>
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
                      Since this morning's briefing
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
function QuickAction({ icon: Icon, label, onClick, primary, danger, hint, accent = "#cba6da" }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
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
      {Icon && <Icon size={11} />}
      {label && <span>{label}</span>}
      {hint && (
        <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2, fontFamily: "Fira Code, monospace" }}>
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

function Reader({ email, account, accent, pinned, onAction, onClose, showTriage, showDraft }) {
  // Parent re-keys this component on email.id change so `drafting` resets
  // automatically — no setState-in-effect reconciliation needed.
  const [drafting, setDrafting] = useState(false);

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
        <QuickAction
          icon={Pin}
          label={pinned ? "Pinned" : "Pin"}
          onClick={() => onAction("pin")}
          accent={accent}
        />
        <QuickAction icon={Clock} label="Snooze" hint="S" onClick={() => onAction("snooze")} accent={accent} />
        <QuickAction icon={Archive} label="Archive" hint="E" onClick={() => onAction("archive")} accent={accent} />
        <QuickAction icon={Trash2} label="Trash" danger onClick={() => onAction("trash")} accent={accent} />
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

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        <div style={{ padding: "22px 24px 8px" }}>
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
                <span>{timeAgo(email.date)} ago</span>
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

        {showTriage && email.claude && <TriagePanel email={email} accent={accent} />}

        <div style={{ padding: "22px 24px 28px" }}>
          <div
            style={{
              fontSize: 13.5, lineHeight: 1.7, color: "rgba(205,214,244,0.88)",
              whiteSpace: "pre-wrap",
            }}
          >
            {email.body || email.preview || (
              <span style={{ color: "rgba(205,214,244,0.45)" }}>
                No body preview available. Open in the full reader overlay for the rendered email.
              </span>
            )}
          </div>
        </div>

        {showDraft && email.claude?.draftReply && (
          <DraftReply
            key={email.id}
            email={email}
            accent={accent}
            onSend={() => { setDrafting(false); onAction("archive"); }}
            onDiscard={() => setDrafting(false)}
          />
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
  pinnedIds,
  onOpenDashboard,
  onRefresh,
  seedSelectedId,
}) {
  const [accountId, setAccountId] = useState("__all");
  const [lane, setLane] = useState("__all");
  const [search, setSearch] = useState("");
  // Reconcile external seed/pinned props by re-keying the inner view below.
  const [selectedId, setSelectedId] = useState(seedSelectedId || null);
  const [pinnedSet, setPinnedSet] = useState(() => new Set(pinnedIds || []));
  // snoozed is tracked locally-only for this session — we don't persist yet
  const [, setSnoozedSet] = useState(() => new Set());
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

  const accountsById = useMemo(() => {
    const map = {};
    for (const acc of emailAccounts) {
      map[acc.id || acc.name] = acc;
    }
    return map;
  }, [emailAccounts]);

  const flatEmails = useMemo(() => {
    const briefingCutoff = briefingGeneratedAt ? new Date(briefingGeneratedAt).getTime() : null;
    const out = [];
    for (const acc of emailAccounts) {
      for (const e of acc.important || []) {
        const lane_ = deriveLane(e);
        const untriaged = briefingCutoff && e.date
          ? new Date(e.date).getTime() > briefingCutoff
          : false;
        out.push({
          ...e,
          _accountKey: acc.id || acc.name,
          _account: acc,
          _lane: untriaged ? null : lane_,
          _untriaged: untriaged,
        });
      }
      for (const e of acc.noise || []) {
        out.push({
          ...e,
          _accountKey: acc.id || acc.name,
          _account: acc,
          _lane: "noise",
          _untriaged: false,
        });
      }
    }
    return out;
  }, [emailAccounts, briefingGeneratedAt]);

  const visibleEmails = useMemo(() => {
    return flatEmails.filter((e) => {
      if (accountId !== "__all" && e._accountKey !== accountId) return false;
      if (lane !== "__all" && e._lane !== lane) return false;
      if (search) {
        const hay = `${e.subject || ""} ${e.from || ""} ${e.preview || ""}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => {
      const order = { action: 0, fyi: 1, noise: 2 };
      if (a._untriaged && !b._untriaged) return -1;
      if (!a._untriaged && b._untriaged) return 1;
      if (order[a._lane] !== order[b._lane]) return (order[a._lane] ?? 3) - (order[b._lane] ?? 3);
      return new Date(b.date) - new Date(a.date);
    });
  }, [flatEmails, accountId, lane, search]);

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

  useEffect(() => {
    if (!selectedId) return undefined;
    const t = setTimeout(() => {
      markEmailRead(selectedId);
    }, 500);
    return () => clearTimeout(t);
  }, [selectedId, markEmailRead]);

  const moveBy = useCallback((dir) => {
    const idx = visibleEmails.findIndex((e) => e.id === selectedId);
    const nextIdx = Math.max(0, Math.min(visibleEmails.length - 1, idx + dir));
    const next = visibleEmails[nextIdx];
    if (next) setSelectedId(next.id);
  }, [visibleEmails, selectedId]);

  const onAction = useCallback((kind) => {
    if (!selectedEmail) return;
    const id = selectedEmail.id;
    if (kind === "next") moveBy(1);
    else if (kind === "prev") moveBy(-1);
    else if (kind === "archive" || kind === "trash") {
      handleDismiss(id);
      moveBy(1);
    } else if (kind === "snooze") {
      setSnoozedSet((p) => { const n = new Set(p); n.add(id); return n; });
    } else if (kind === "pin") {
      setPinnedSet((p) => {
        const n = new Set(p);
        if (n.has(id)) n.delete(id); else n.add(id);
        return n;
      });
    }
  }, [selectedEmail, moveBy, handleDismiss]);

  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j") { e.preventDefault(); moveBy(1); }
      else if (e.key === "k") { e.preventDefault(); moveBy(-1); }
      else if (e.key === "e") { e.preventDefault(); onAction("archive"); }
      else if (e.key === "s") { e.preventDefault(); onAction("snooze"); }
      else if (e.key === "p") { e.preventDefault(); onAction("pin"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveBy, onAction]);

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
    ? `Triaged ${timeAgo(briefingGeneratedAt)} ago`
    : null;

  return (
    <div
      style={{
        position: "relative", display: "flex", flexDirection: "column",
        height: "100%", minHeight: 0,
        background: "transparent", color: "#cdd6f4",
      }}
    >
      {accountId === "__all" && lane === "__all" && (
        <DigestStrip
          accent={accent}
          counts={laneCounts}
          liveCount={liveCount}
          summary={briefingSummary}
          onJumpLane={(k) => setLane(k)}
        />
      )}

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
          />
          {layout !== "list-only" && (
            <Reader
              key={selectedEmail?.id || "empty"}
              email={selectedEmail}
              account={selectedAccount}
              accent={accent}
              pinned={selectedEmail && pinnedSet.has(selectedEmail.id)}
              onAction={onAction}
              onClose={() => setSelectedId(null)}
              showTriage={showTriage}
              showDraft={showDraft}
            />
          )}
        </div>
      </div>
    </div>
  );
}
