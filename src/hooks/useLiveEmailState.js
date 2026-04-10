import { useState, useMemo, useCallback, useEffect } from "react";
import { markAllEmailsAsRead, pinEmail as pinEmailApi, unpinEmail as unpinEmailApi } from "../api";

// Owns session-local state for the Live email tab:
// - markedRead: UIDs the user has opened/marked since mount (server may not yet reflect this)
// - trashedUids: UIDs the user has dismissed from the live list this session
// - pinnedUids: UIDs pinned for next briefing (seeded from server, updated optimistically)
//
// Derives the visible list, unread count, and hasUnread flag from the latest `emails`
// input plus local state. Exposes handlers for the row actions.
export default function useLiveEmailState(emails, serverPinnedIds) {
  const [markedRead, setMarkedRead] = useState(() => new Set());
  const [trashedUids, setTrashedUids] = useState(() => new Set());
  const [pinnedUids, setPinnedUids] = useState(() => new Set());
  const [markingAllRead, setMarkingAllRead] = useState(false);

  // Sync server-side pinned IDs into local state on each live data fetch.
  // Server is authoritative — clears local pins after briefing consumes them.
  useEffect(() => {
    if (!serverPinnedIds) return;
    setPinnedUids(new Set(serverPinnedIds));
  }, [serverPinnedIds]);

  const visibleEmails = useMemo(
    () => (emails || []).filter((e) => !trashedUids.has(e.uid)),
    [emails, trashedUids],
  );

  const unreadCount = useMemo(
    () => visibleEmails.filter((e) => !e.read && !markedRead.has(e.uid)).length,
    [visibleEmails, markedRead],
  );

  const hasUnread = unreadCount > 0;

  const isRead = useCallback(
    (email) => email.read || markedRead.has(email.uid),
    [markedRead],
  );

  const markRead = useCallback((uid) => {
    setMarkedRead((prev) => {
      if (prev.has(uid)) return prev;
      const next = new Set(prev);
      next.add(uid);
      return next;
    });
  }, []);

  const markUnread = useCallback((uid) => {
    setMarkedRead((prev) => {
      if (!prev.has(uid)) return prev;
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  }, []);

  const dismiss = useCallback((uid) => {
    setTrashedUids((prev) => {
      if (prev.has(uid)) return prev;
      const next = new Set(prev);
      next.add(uid);
      return next;
    });
  }, []);

  const isPinned = useCallback(
    (email) => pinnedUids.has(email.uid),
    [pinnedUids],
  );

  const pin = useCallback((uid) => {
    setPinnedUids((prev) => {
      if (prev.has(uid)) return prev;
      const next = new Set(prev);
      next.add(uid);
      return next;
    });
    pinEmailApi(uid).catch(() => {
      setPinnedUids((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    });
  }, []);

  const unpin = useCallback((uid) => {
    setPinnedUids((prev) => {
      if (!prev.has(uid)) return prev;
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
    unpinEmailApi(uid).catch(() => {
      setPinnedUids((prev) => {
        const next = new Set(prev);
        next.add(uid);
        return next;
      });
    });
  }, []);

  const markAllRead = useCallback(async () => {
    const uids = (emails || []).map((e) => e.uid).filter(Boolean);
    if (!uids.length) return;
    setMarkingAllRead(true);
    try {
      await markAllEmailsAsRead(uids);
      setMarkedRead((prev) => {
        const next = new Set(prev);
        uids.forEach((id) => next.add(id));
        return next;
      });
    } catch {
      // silently fail — user can retry
    } finally {
      setMarkingAllRead(false);
    }
  }, [emails]);

  return {
    visibleEmails,
    unreadCount,
    hasUnread,
    markedRead,
    trashedUids,
    pinnedUids,
    isRead,
    isPinned,
    markRead,
    markUnread,
    dismiss,
    pin,
    unpin,
    markAllRead,
    markingAllRead,
  };
}
