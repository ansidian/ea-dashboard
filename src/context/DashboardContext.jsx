import { createContext, useContext, useState, useCallback, useRef, useMemo } from "react";
import { dismissEmail, completeTask, updateTaskStatus } from "../api";

const DashboardContext = createContext(null);

export function DashboardProvider({ briefing, setBriefing, setCalendarDeadlines, children }) {
  const [activeAccount, setActiveAccount] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loadingBillId, setLoadingBillId] = useState(null);
  const [confirmDismissId, setConfirmDismissId] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
  const emailSectionRef = useRef(null);

  const recountUnread = (acct) => {
    acct.unread = (acct.important || []).length;
  };

  const markAccountEmailsRead = useCallback(() => {
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const acct = updated.emails?.accounts?.[activeAccount];
      if (acct) {
        for (const e of acct.important) e.read = true;
        recountUnread(acct);
      }
      return updated;
    });
  }, [activeAccount, setBriefing]);

  const setEmailReadState = useCallback((emailKey, read) => {
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      for (const acct of updated.emails?.accounts || []) {
        for (const e of acct.important || []) {
          if (e.id === emailKey || e.uid === emailKey) {
            e.read = read;
          }
        }
        recountUnread(acct);
      }
      return updated;
    });
  }, [setBriefing]);

  const markEmailRead = useCallback((emailKey) => setEmailReadState(emailKey, true), [setEmailReadState]);
  const markEmailUnread = useCallback((emailKey) => setEmailReadState(emailKey, false), [setEmailReadState]);

  const handleDismiss = useCallback(async (emailId) => {
    dismissEmail(emailId).catch(() => {});
    if (selectedEmail?.id === emailId) setSelectedEmail(null);
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      for (const acct of updated.emails?.accounts || []) {
        acct.important = acct.important.filter(e => e.id !== emailId);
        recountUnread(acct);
      }
      return updated;
    });
  }, [selectedEmail, setBriefing]);

  const removeCompletedTask = useCallback((taskId) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const weekFromNow = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    // Dashboard list: drop completed tasks entirely (out of sight).
    setBriefing(prev => {
      if (!prev) return prev;
      const updated = JSON.parse(JSON.stringify(prev));
      for (const section of ["ctm", "todoist"]) {
        if (!updated[section]?.upcoming) continue;
        updated[section].upcoming = updated[section].upcoming.filter(
          t => String(t.id) !== String(taskId) && t.todoist_id !== String(taskId)
        );
        let totalPoints = 0, dueToday = 0, dueThisWeek = 0;
        for (const d of updated[section].upcoming) {
          if (d.due_date === today) dueToday++;
          if (d.due_date >= today && d.due_date <= weekFromNow) dueThisWeek++;
          if (d.points_possible) totalPoints += d.points_possible;
        }
        updated[section].stats = { incomplete: updated[section].upcoming.length, dueToday, dueThisWeek, totalPoints };
      }
      return updated;
    });
    // Calendar modal: keep completed tasks visible; flip status and clear the
    // dashboard-only flash flag so they render with the completed treatment.
    setCalendarDeadlines?.(prev => {
      if (!prev) return prev;
      const updated = JSON.parse(JSON.stringify(prev));
      for (const section of ["ctm", "todoist"]) {
        const task = updated[section]?.upcoming?.find(
          t => String(t.id) === String(taskId) || t.todoist_id === String(taskId)
        );
        if (task) {
          task.status = "complete";
          delete task._completing;
        }
      }
      return updated;
    });
  }, [setBriefing, setCalendarDeadlines]);

  const handleCompleteTask = useCallback(async (taskId) => {
    completeTask(taskId).catch(() => {});

    const flagCompleting = (root) => {
      if (!root) return root;
      const updated = JSON.parse(JSON.stringify(root));
      for (const section of ["ctm", "todoist"]) {
        const task = updated[section]?.upcoming?.find(
          t => String(t.id) === String(taskId) || t.todoist_id === String(taskId)
        );
        if (task) task._completing = true;
      }
      return updated;
    };
    setBriefing(prev => flagCompleting(prev));
    setCalendarDeadlines?.(prev => (prev ? flagCompleting(prev) : prev));

    // Remove after animation
    setTimeout(() => removeCompletedTask(taskId), 600);
    if (expandedTask === taskId) setExpandedTask(null);
  }, [expandedTask, setBriefing, setCalendarDeadlines, removeCompletedTask]);

  const handleUpdateTask = useCallback((updatedTask) => {
    const applyUpdate = (root) => {
      if (!root) return root;
      const updated = JSON.parse(JSON.stringify(root));
      if (!updated.todoist?.upcoming) return updated;
      const idx = updated.todoist.upcoming.findIndex(
        t => String(t.id) === String(updatedTask.id),
      );
      if (idx >= 0) updated.todoist.upcoming[idx] = updatedTask;

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      const weekFromNow = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      let dueToday = 0, dueThisWeek = 0;
      for (const d of updated.todoist.upcoming) {
        if (d.due_date === today) dueToday++;
        if (d.due_date >= today && d.due_date <= weekFromNow) dueThisWeek++;
      }
      updated.todoist.stats = { incomplete: updated.todoist.upcoming.length, dueToday, dueThisWeek, totalPoints: 0 };
      return updated;
    };
    setBriefing(prev => applyUpdate(prev));
    setCalendarDeadlines?.(prev => (prev ? applyUpdate(prev) : prev));
  }, [setBriefing, setCalendarDeadlines]);

  const handleAddTask = useCallback((task) => {
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated.todoist) updated.todoist = { upcoming: [], stats: { incomplete: 0, dueToday: 0, dueThisWeek: 0, totalPoints: 0 } };
      updated.todoist.upcoming.push(task);

      // Recalculate stats
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      const weekFromNow = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      let dueToday = 0, dueThisWeek = 0;
      for (const d of updated.todoist.upcoming) {
        if (d.due_date === today) dueToday++;
        if (d.due_date >= today && d.due_date <= weekFromNow) dueThisWeek++;
      }
      updated.todoist.stats = { incomplete: updated.todoist.upcoming.length, dueToday, dueThisWeek, totalPoints: 0 };

      return updated;
    });
  }, [setBriefing]);

  const handleUpdateTaskStatus = useCallback(async (taskId, status) => {
    updateTaskStatus(taskId, status).catch(() => {});

    if (status === "complete") {
      const flagCompleting = (root) => {
        if (!root) return root;
        const updated = JSON.parse(JSON.stringify(root));
        const task = updated.ctm?.upcoming?.find(t => String(t.id) === String(taskId));
        if (task) task._completing = true;
        return updated;
      };
      setBriefing(prev => flagCompleting(prev));
      setCalendarDeadlines?.(prev => (prev ? flagCompleting(prev) : prev));
      setTimeout(() => removeCompletedTask(taskId), 600);
      if (String(expandedTask) === String(taskId)) setExpandedTask(null);
      return;
    }

    const applyStatus = (root) => {
      if (!root) return root;
      const updated = JSON.parse(JSON.stringify(root));
      const task = updated.ctm?.upcoming?.find(t => String(t.id) === String(taskId));
      if (task) task.status = status;
      return updated;
    };
    setBriefing(prev => applyStatus(prev));
    setCalendarDeadlines?.(prev => (prev ? applyStatus(prev) : prev));
  }, [expandedTask, setBriefing, setCalendarDeadlines, removeCompletedTask]);

  const emailAccounts = useMemo(
    () => briefing?.emails?.accounts || [],
    [briefing?.emails?.accounts],
  );
  const currentAccount = emailAccounts[activeAccount] || {
    important: [],
    noise: [],
    noise_count: 0,
    name: "",
    icon: "",
    color: "#cba6da",
    unread: 0,
  };

  const totalNoiseCount = useMemo(
    () => emailAccounts.reduce((sum, acc) => sum + (acc.noise?.length || 0), 0),
    [emailAccounts],
  );

  const billEmails = useMemo(() =>
    emailAccounts.flatMap((acc, accIdx) =>
      (acc.important || [])
        .filter((e) => e.hasBill)
        .map((e) => ({ ...e, accountColor: acc.color, _accIdx: accIdx })),
    ), [emailAccounts]);

  const totalBills = useMemo(() =>
    billEmails.reduce((sum, e) => sum + (e.extractedBill?.amount || 0), 0),
    [billEmails]);

  return (
    <DashboardContext.Provider value={{
      activeAccount,
      setActiveAccount,
      selectedEmail,
      setSelectedEmail,
      loadingBillId,
      setLoadingBillId,
      confirmDismissId,
      setConfirmDismissId,
      expandedTask,
      setExpandedTask,
      handleDismiss,
      handleCompleteTask,
      handleAddTask,
      handleUpdateTask,
      handleUpdateTaskStatus,
      markAccountEmailsRead,
      markEmailRead,
      markEmailUnread,
      emailAccounts,
      currentAccount,
      emailSectionRef,
      billEmails,
      totalBills,
      totalNoiseCount,
    }}>
      {children}
    </DashboardContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
