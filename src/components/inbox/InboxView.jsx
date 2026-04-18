import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useKeyHold from "../../hooks/useKeyHold";
import { deriveLane } from "../../lib/redesign-helpers";
import { useDashboard } from "../../context/DashboardContext";
import {
  markEmailAsRead, markEmailAsUnread, trashEmail,
  pinEmail, unpinEmail, snoozeEmail, markAllEmailsAsRead,
} from "../../api";
import { getGmailUrl } from "../../lib/email-links";
import { timeSince, defaultSnoozeTs } from "./helpers";

import Sidebar from "./Sidebar";
import DigestStrip from "./DigestStrip";
import InboxList from "./InboxList";
import Reader from "./reader/Reader";

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

  const flatEmails = useMemo(() => {
    const out = [];
    const seenUids = new Set();
    const pushEmail = (entry) => {
      const key = entry.uid || entry.id;
      // Skip if we've already pushed this id. Important is iterated before
      // noise, so important wins (it has full email data; noise is sparse).
      // This also defends against the briefing JSON containing the same email
      // in both important[] and noise[] arrays.
      if (key && seenUids.has(key)) return;
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
      // Merge the resurfaced provenance if this uid is also in resurfacedMap.
      // Gmail's live-poll (`newer_than:Nh`) often re-fetches recently-woken
      // emails on its own; without this, the live entry wins dedup and the
      // Snoozed badge / wake-time sort would be lost.
      const resurfacedHit = resurfacedMap.get(e.uid);
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
        ...(resurfacedHit ? { _resurfaced: true, _resurfacedAt: resurfacedHit.resurfaced_at } : null),
      });
    }
    // Merge resurfaced snapshots (snooze woke up). Gmail's live-poll filter
    // (`newer_than:Nh`) uses the original internalDate so these wouldn't reach
    // the inbox on their own — we inject them here with the live/untriaged
    // treatment and tag them _resurfaced so the row can show a badge.
    for (const entry of resurfacedMap.values()) {
      const snap = entry.snapshot;
      const key = snap?.uid || snap?.id;
      if (!key || seenUids.has(key)) continue;
      if (liveTrashedUids.has(key)) continue;
      const acc = synthAccount(snap);
      pushEmail({
        ...snap,
        id: snap.id || snap.uid,
        preview: snap.preview || snap.body_preview || "",
        fromEmail: snap.fromEmail || snap.from_email,
        // `entry.read` is Gmail's current UNREAD state as of this poll
        // (server-side probe). Union with `liveReadUids` so a read triggered
        // within the session wins immediately without waiting for the next poll.
        read: liveReadUids.has(key) || entry.read === true,
        _accountKey: acc.id || acc.name,
        _account: acc,
        _lane: null,
        _untriaged: true,
        _live: true,
        _resurfaced: true,
        _resurfacedAt: entry.resurfaced_at,
        // Preserve date for "resurfaced at" display via a separate field; the
        // email's original date stays on `date` so sorting-by-age still works
        // if the user prefers that.
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
  }, [emailAccounts, liveEmails, liveReadUids, liveTrashedUids, pinnedSnapshotMap, resurfacedMap]);

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
      const email = flatEmailsRef.current.find((e) => e.id === selectedId);
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
  const showPreview = customize.showPreview;
  const density = customize.inboxDensity;
  const sidebarCompact = customize.sidebarCompact;
  const layout = customize.inboxLayout;
  const grouping = customize.inboxGrouping;

  // briefingGeneratedAt is SQLite's `datetime('now')` output — a naive UTC
  // string with no zone marker. Chrome parses that as local time, which makes
  // `timeSince` return "just now" for hours-old briefings. Match the Z-suffix
  // normalization Dashboard.jsx uses so the label reflects real elapsed time.
  const briefingAgoLabel = briefingGeneratedAt
    ? `Triaged ${timeSince(briefingGeneratedAt.endsWith("Z") ? briefingGeneratedAt : `${briefingGeneratedAt}Z`)}`
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
            />
          )}
        </div>
      </div>
    </div>
  );
}
