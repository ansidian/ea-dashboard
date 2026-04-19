import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCheck, Filter, Search, Sparkles,
} from "lucide-react";
import useKeyHold from "../../hooks/useKeyHold";
import { useDashboard } from "../../context/DashboardContext";
import {
  markEmailAsRead, markEmailAsUnread, trashEmail,
  pinEmail, unpinEmail, snoozeEmail, markAllEmailsAsRead,
} from "../../api";
import { getGmailUrl } from "../../lib/email-links";
import {
  timeSince,
  defaultSnoozeTs,
  makeSynthAccount,
  collectBriefingEmails,
  collectLiveEmails,
  collectResurfaced,
  collectPinSnapshots,
} from "./helpers";

import Sidebar from "./Sidebar";
import DigestStrip from "./DigestStrip";
import InboxList from "./InboxList";
import EmailRow from "./EmailRow";
import Reader from "./reader/Reader";

const MOBILE_FILTER_CHIPS = [
  { key: "__all", label: "All" },
  { key: "__live", label: "New" },
  { key: "action", label: "Action" },
  { key: "fyi", label: "FYI" },
  { key: "noise", label: "Noise" },
];

function MobileChip({ active, label, count, onClick, accent }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        width: "100%",
        minWidth: 0,
        padding: "8px 6px",
        borderRadius: 999,
        border: `1px solid ${active ? `${accent}48` : "rgba(255,255,255,0.08)"}`,
        background: active ? `${accent}16` : "rgba(255,255,255,0.03)",
        color: active ? "#fff" : "rgba(205,214,244,0.72)",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 10.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </span>
      <span
        style={{
          minWidth: 16,
          height: 16,
          padding: "0 4px",
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: active ? `${accent}28` : "rgba(255,255,255,0.06)",
          color: active ? accent : "rgba(205,214,244,0.5)",
          fontSize: 8.5,
          fontWeight: 700,
          fontVariantNumeric: "tabular-nums",
          flexShrink: 0,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function MobileIconButton({ icon, label, onClick, accent, buttonRef, tinted = false, testId }) {
  const Icon = icon;
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
      style={{
        width: 34,
        height: 34,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        border: `1px solid ${tinted ? `${accent}40` : "rgba(255,255,255,0.08)"}`,
        background: tinted ? `${accent}16` : "rgba(255,255,255,0.03)",
        color: tinted ? accent : "rgba(205,214,244,0.7)",
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <Icon size={15} />
    </button>
  );
}

function MobileFilterSheet({
  open,
  accent,
  triggerRef,
  panelRef,
  accountId,
  setAccountId,
  accounts,
  totalUnread,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (panelRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return;
      onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose, panelRef, triggerRef]);

  useEffect(() => {
    if (!open) return undefined;
    const el = panelRef.current;
    if (!el) return undefined;
    function onWheel(e) {
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        e.preventDefault();
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, panelRef]);

  if (!open) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
        background: "rgba(0,0,0,0.48)",
      }}
    >
      <div
        ref={panelRef}
        data-testid="inbox-mobile-filter-sheet"
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "72vh",
          padding: "16px 16px 24px",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          background: "#16161e",
          borderTop: `1px solid ${accent}30`,
          boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
          overflowY: "auto",
          overscrollBehavior: "contain",
          isolation: "isolate",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <div
            style={{
              width: 42,
              height: 4,
              borderRadius: 999,
              background: "rgba(255,255,255,0.16)",
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: accent,
            }}
          >
            Accounts
          </span>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "rgba(205,214,244,0.55)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
            }}
          >
            Done
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              setAccountId("__all");
              onClose();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "12px 14px",
              borderRadius: 12,
              background: accountId === "__all" ? `${accent}14` : "rgba(255,255,255,0.03)",
              border: `1px solid ${accountId === "__all" ? `${accent}40` : "rgba(255,255,255,0.08)"}`,
              color: "#fff",
              cursor: "pointer",
              fontFamily: "inherit",
              textAlign: "left",
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>All accounts</div>
              <div style={{ fontSize: 11, color: "rgba(205,214,244,0.5)", marginTop: 2 }}>
                {totalUnread} unread across inbox
              </div>
            </div>
          </button>
          {accounts.map((acc) => {
            const accKey = acc.id || acc.name;
            const active = accountId === accKey;
            return (
              <button
                key={accKey}
                type="button"
                onClick={() => {
                  setAccountId(accKey);
                  onClose();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: active ? `${acc.color || accent}14` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${active ? `${acc.color || accent}40` : "rgba(255,255,255,0.08)"}`,
                  color: "#fff",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 999,
                    background: acc.color || accent,
                    boxShadow: `0 0 8px ${(acc.color || accent)}66`,
                    flexShrink: 0,
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {acc.name || acc.email}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(205,214,244,0.5)",
                      marginTop: 2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {acc.email}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: acc.color || accent,
                    background: `${acc.color || accent}18`,
                    borderRadius: 999,
                    padding: "2px 7px",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {acc.unread || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
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
  resurfacedEntries = [],
  onOpenDashboard,
  onRefresh,
  seedSelectedId,
  isMobile = false,
}) {
  const [accountId, setAccountId] = useState("__all");
  const [lane, setLane] = useState("__all");
  const [search, setSearch] = useState("");
  const searchRef = useRef(null);
  const mobileFilterTriggerRef = useRef(null);
  const mobileFilterPanelRef = useRef(null);
  // Reconcile external seed/pinned props by re-keying the inner view below.
  const [selectedId, setSelectedId] = useState(seedSelectedId || null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
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
  // Resurfaced snapshots (snooze woke up → inject as fresh live/untriaged).
  // Keyed by uid; server cleanup TTL bounds the size of this map.
  const [resurfacedMap, setResurfacedMap] = useState(
    () => new Map((resurfacedEntries || []).map((r) => [r.uid, r])),
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
  const { markEmailRead, markEmailUnread, handleDismiss } = useDashboard();

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
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResurfacedMap(new Map((resurfacedEntries || []).map((r) => [r.uid, r])));
  }, [resurfacedEntries]);
  const accountsById = useMemo(() => {
    const map = {};
    for (const acc of emailAccounts) {
      map[acc.id || acc.name] = acc;
    }
    return map;
  }, [emailAccounts]);

  // Merge order matters: first push wins dedup (by uid|id). Briefing entries
  // come first so their lane/_account take precedence over live/resurfaced
  // re-fetches of the same uid; pin snapshots come last as a stale-fallback.
  const flatEmails = useMemo(() => {
    const synthAccount = makeSynthAccount(emailAccounts);
    const out = [];
    const seenUids = new Set();
    const pushEmail = (entry) => {
      const key = entry.uid || entry.id;
      if (key && seenUids.has(key)) return;
      if (key) seenUids.add(key);
      out.push(entry);
    };
    for (const entry of collectBriefingEmails(emailAccounts)) pushEmail(entry);
    for (const entry of collectLiveEmails(liveEmails, synthAccount, liveTrashedUids, liveReadUids, resurfacedMap)) pushEmail(entry);
    for (const entry of collectResurfaced(resurfacedMap, synthAccount, liveReadUids, liveTrashedUids)) pushEmail(entry);
    for (const entry of collectPinSnapshots(pinnedSnapshotMap, synthAccount)) pushEmail(entry);
    return out;
  }, [emailAccounts, liveEmails, liveReadUids, liveTrashedUids, pinnedSnapshotMap, resurfacedMap]);

  const visibleEmails = useMemo(() => {
    return flatEmails.filter((e) => {
      const uid = e.uid || e.id;
      const snoozeUntil = snoozedMap.get(uid);
      if (snoozeUntil && snoozeUntil > nowTick) return false;
      if (accountId !== "__all" && e._accountKey !== accountId) return false;
      if (lane === "__live" && !e._untriaged) return false;
      if (lane !== "__all" && lane !== "__live" && e._lane !== lane) return false;
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
      // Resurfaced emails sort by their wake time (not original delivery) so
      // they rank among other live/untriaged emails by recency of arrival.
      const aKey = a._resurfacedAt || new Date(a.date).getTime();
      const bKey = b._resurfacedAt || new Date(b.date).getTime();
      return bKey - aKey;
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

  const mobileChipCounts = useMemo(() => {
    const counts = {
      __all: 0,
      __live: 0,
      action: 0,
      fyi: 0,
      noise: 0,
    };
    for (const e of flatEmails) {
      const uid = e.uid || e.id;
      const snoozeUntil = snoozedMap.get(uid);
      if (snoozeUntil && snoozeUntil > nowTick) continue;
      if (accountId !== "__all" && e._accountKey !== accountId) continue;
      counts.__all += 1;
      if (e._untriaged) counts.__live += 1;
      else if (e._lane && counts[e._lane] != null) counts[e._lane] += 1;
    }
    return counts;
  }, [flatEmails, snoozedMap, nowTick, accountId]);

  const totalUnread = useMemo(() => {
    return flatEmails.filter((e) => !e.read).length;
  }, [flatEmails]);
  const unreadInView = useMemo(() => {
    return visibleEmails.filter((e) => !e.read).length;
  }, [visibleEmails]);

  const selectedEmail = useMemo(() => {
    if (!selectedId) return null;
    return flatEmails.find((e) => e.id === selectedId || e.uid === selectedId) || null;
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

  // Auto-read the currently-selected email after a 500ms dwell. Keyed only on
  // `selectedId`: including `flatEmails` would let a within-selection state
  // change (e.g., the user toggling this row back to unread) reschedule the
  // timer and flip it right back to read. Deselect → re-select of the same id
  // still re-triggers auto-read because React treats it as a fresh run.
  const flatEmailsRef = useRef(flatEmails);
  useEffect(() => { flatEmailsRef.current = flatEmails; }, [flatEmails]);
  const markEmailReadRef = useRef(markEmailRead);
  useEffect(() => { markEmailReadRef.current = markEmailRead; }, [markEmailRead]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const t = setTimeout(() => {
      const email = flatEmailsRef.current.find((e) => e.id === selectedId || e.uid === selectedId);
      if (!email || email.read) return;
      if (email._live) {
        setLiveReadUids((prev) => {
          if (prev.has(email.uid)) return prev;
          const next = new Set(prev);
          next.add(email.uid);
          return next;
        });
        markEmailAsRead(email.uid).catch(() => {});
      } else {
        // Both calls matter: the context update flips the row locally without
        // waiting for a roundtrip; the API call syncs Gmail/iCloud and
        // persists the read flag into the stored briefing JSON so a page
        // reload doesn't revert the row to its briefing-generation state.
        markEmailReadRef.current(selectedId);
        if (email.uid) markEmailAsRead(email.uid).catch(() => {});
      }
    }, 500);
    return () => clearTimeout(t);
  }, [selectedId]);

  // Mark all currently-visible unread emails as read. Covers three paths the
  // briefing-only `markAccountEmailsRead` doesn't touch:
  // - live (untriaged) emails → mirrored locally via liveReadUids
  // - resurfaced snapshots → same, so the row dims without waiting for a poll
  // - briefing emails → context handles local state; we still call Gmail so
  //   the next briefing regen matches reality
  // One batched server call per path keeps the Gmail API traffic bounded even
  // when the inbox is huge.
  const markAllVisibleRead = useCallback(() => {
    const unread = visibleEmails.filter((e) => !e.read);
    if (unread.length === 0) return;
    const liveUids = [];
    for (const e of unread) {
      if (e._live && e.uid) liveUids.push(e.uid);
      else markEmailRead(e.id || e.uid);
    }
    if (liveUids.length) {
      setLiveReadUids((prev) => {
        const next = new Set(prev);
        for (const uid of liveUids) next.add(uid);
        return next;
      });
    }
    const allUids = unread.map((e) => e.uid).filter(Boolean);
    if (allUids.length) {
      markAllEmailsAsRead(allUids).catch(() => {});
    }
  }, [visibleEmails, markEmailRead]);

  const moveBy = useCallback((dir) => {
    const idx = visibleEmails.findIndex((e) => e.id === selectedId || e.uid === selectedId);
    const nextIdx = Math.max(0, Math.min(visibleEmails.length - 1, idx + dir));
    const next = visibleEmails[nextIdx];
    if (next) setSelectedId(next.id || next.uid);
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
    } else if (kind === "toggle-read") {
      const markingUnread = !!selectedEmail.read;
      if (selectedEmail._live) {
        setLiveReadUids((prev) => {
          const n = new Set(prev);
          if (markingUnread) n.delete(uid); else n.add(uid);
          return n;
        });
        const call = markingUnread ? markEmailAsUnread : markEmailAsRead;
        call(uid).catch(() => {});
      } else {
        if (markingUnread) {
          markEmailUnread(id);
          markEmailAsUnread(uid).catch(() => {});
        } else {
          markEmailRead(id);
          markEmailAsRead(uid).catch(() => {});
        }
      }
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
  }, [selectedEmail, moveBy, handleDismiss, pinnedSet, buildEmailSnapshot, markEmailRead, markEmailUnread]);

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
  const showPreview = isMobile ? true : customize.showPreview;
  const density = isMobile ? "default" : customize.inboxDensity;
  const sidebarCompact = isMobile ? false : customize.sidebarCompact;
  const layout = isMobile ? "two-pane" : customize.inboxLayout;
  const grouping = isMobile ? "flat" : customize.inboxGrouping;

  // briefingGeneratedAt is SQLite's `datetime('now')` output — a naive UTC
  // string with no zone marker. Chrome parses that as local time, which makes
  // `timeSince` return "just now" for hours-old briefings. Match the Z-suffix
  // normalization Dashboard.jsx uses so the label reflects real elapsed time.
  const briefingAgoLabel = briefingGeneratedAt
    ? `Triaged ${timeSince(briefingGeneratedAt.endsWith("Z") ? briefingGeneratedAt : `${briefingGeneratedAt}Z`)}`
    : null;

  const scopedAccount = accountId === "__all"
    ? null
    : emailAccounts.find((acc) => (acc.id || acc.name) === accountId);

  if (isMobile) {
    return (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          background: "transparent",
          color: "#cdd6f4",
        }}
      >
        {selectedEmail ? (
          <Reader
            key={selectedEmail?.id || selectedEmail?.uid || "empty"}
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
            isMobile
          />
        ) : (
          <div
            data-testid="inbox-mobile-list"
            style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain" }}
          >
            <div style={{ padding: "16px 16px 0" }}>
              <div
                style={{
                  padding: "14px 14px 12px",
                  borderRadius: 14,
                  background: `linear-gradient(135deg, ${accent}12, rgba(137,220,235,0.04))`,
                  border: `1px solid ${accent}2c`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Sparkles size={13} color={accent} />
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 1.8,
                      textTransform: "uppercase",
                      color: accent,
                    }}
                  >
                    Inbox snapshot
                  </span>
                  <span style={{ flex: 1 }} />
                  {briefingAgoLabel && (
                    <span style={{ fontSize: 10, color: "rgba(205,214,244,0.5)" }}>
                      {briefingAgoLabel}
                    </span>
                  )}
                </div>
                {briefingSummary && (
                  <div
                    className="ea-display"
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      lineHeight: 1.55,
                      color: "rgba(255,255,255,0.92)",
                      fontStyle: "italic",
                    }}
                  >
                    {briefingSummary}
                  </div>
                )}
                <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 11, color: "rgba(205,214,244,0.62)" }}>
                    <span style={{ color: "#fff", fontWeight: 700 }}>{unreadInView}</span> unread
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(205,214,244,0.62)" }}>
                    <span style={{ color: "#fff", fontWeight: 700 }}>{mobileChipCounts.__live}</span> new
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(205,214,244,0.62)" }}>
                    <span style={{ color: "#fff", fontWeight: 700 }}>{mobileChipCounts.__all}</span> in scope
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 4,
                padding: "12px 16px 10px",
                marginTop: 14,
                background: "linear-gradient(180deg, rgba(11,11,19,0.98), rgba(11,11,19,0.94))",
                backdropFilter: "blur(14px)",
                borderTop: "1px solid rgba(255,255,255,0.04)",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 10px",
                    height: 36,
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <Search size={13} color="rgba(205,214,244,0.45)" />
                  <input
                    ref={searchRef}
                    aria-label="Search inbox"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search inbox"
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "#cdd6f4",
                      fontSize: 12,
                      fontFamily: "inherit",
                    }}
                  />
                </div>
                <MobileIconButton
                  icon={Filter}
                  label="Open filters"
                  onClick={() => setMobileFiltersOpen(true)}
                  accent={accent}
                  buttonRef={mobileFilterTriggerRef}
                  testId="inbox-mobile-filter-trigger"
                />
                <MobileIconButton
                  icon={CheckCheck}
                  label="Mark all read"
                  onClick={markAllVisibleRead}
                  accent={accent}
                  tinted={unreadInView > 0}
                />
              </div>

              <div
                data-testid="inbox-mobile-chip-grid"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: 6,
                  paddingTop: 10,
                }}
              >
                {MOBILE_FILTER_CHIPS.map((chip) => (
                  <MobileChip
                    key={chip.key}
                    active={lane === chip.key}
                    label={chip.label}
                    count={mobileChipCounts[chip.key]}
                    onClick={() => setLane(chip.key)}
                    accent={accent}
                  />
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  paddingTop: 10,
                  fontSize: 11,
                  color: "rgba(205,214,244,0.5)",
                }}
              >
                <span>
                  {scopedAccount ? scopedAccount.name || scopedAccount.email : "All accounts"}
                </span>
                <span style={{ opacity: 0.35 }}>·</span>
                <span>{visibleEmails.length} shown</span>
              </div>
            </div>

            <div style={{ padding: "6px 0 20px" }}>
              {visibleEmails.length > 0 ? (
                visibleEmails.map((email) => (
                  <EmailRow
                    key={email.id || email.uid}
                    email={email}
                    account={accountsById[email.accountId] || accountsById[email._accountKey]}
                    selected={false}
                    onOpen={(opened) => setSelectedId(opened.id || opened.uid)}
                    density={density}
                    showPreview={showPreview}
                    accent={accent}
                    pinned={!!(pinnedSet.has(email.uid) || pinnedSet.has(email.id))}
                  />
                ))
              ) : (
                <div
                  style={{
                    padding: "36px 18px",
                    textAlign: "center",
                    color: "rgba(205,214,244,0.45)",
                    fontSize: 12,
                  }}
                >
                  No emails match this view.
                </div>
              )}
            </div>
          </div>
        )}

        <MobileFilterSheet
          open={mobileFiltersOpen}
          accent={accent}
          triggerRef={mobileFilterTriggerRef}
          panelRef={mobileFilterPanelRef}
          accountId={accountId}
          setAccountId={setAccountId}
          accounts={emailAccounts}
          totalUnread={totalUnread}
          onClose={() => setMobileFiltersOpen(false)}
        />
      </div>
    );
  }

  return (
    <div
      data-testid="inbox-desktop-view"
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
              onMarkAllRead={markAllVisibleRead}
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
              isMobile={false}
            />
          )}
        </div>
      </div>
    </div>
  );
}
