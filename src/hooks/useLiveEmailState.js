import { useState, useMemo, useCallback } from "react";
import { markAllEmailsAsRead } from "../api";

// Owns session-local state for the Live email tab:
// - markedRead: UIDs the user has opened/marked since mount (server may not yet reflect this)
// - trashedUids: UIDs the user has dismissed from the live list this session
//
// Derives the visible list, unread count, and hasUnread flag from the latest `emails`
// input plus local state. Exposes handlers for the row actions.
export default function useLiveEmailState(emails) {
  const [markedRead, setMarkedRead] = useState(() => new Set());
  const [trashedUids, setTrashedUids] = useState(() => new Set());
  const [markingAllRead, setMarkingAllRead] = useState(false);

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

  const dismiss = useCallback((uid) => {
    setTrashedUids((prev) => {
      if (prev.has(uid)) return prev;
      const next = new Set(prev);
      next.add(uid);
      return next;
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
    isRead,
    markRead,
    dismiss,
    markAllRead,
    markingAllRead,
  };
}
