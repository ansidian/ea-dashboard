import { createContext, useContext, useState, useCallback, useRef, useMemo } from "react";
import { dismissEmail, completeTask, updateTaskStatus } from "../api";

const DashboardContext = createContext(null);

export function DashboardProvider({ briefing, setBriefing, children }) {
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
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      const weekFromNow = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

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
  }, [setBriefing]);

  const handleCompleteTask = useCallback(async (taskId) => {
    completeTask(taskId).catch(() => {});

    // Mark as completing (triggers green flash animation)
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      for (const section of ["ctm", "todoist"]) {
        const task = updated[section]?.upcoming?.find(
          t => String(t.id) === String(taskId) || t.todoist_id === String(taskId)
        );
        if (task) task._completing = true;
      }
      return updated;
    });

    // Remove after animation
    setTimeout(() => removeCompletedTask(taskId), 600);
    if (expandedTask === taskId) setExpandedTask(null);
  }, [expandedTask, setBriefing, removeCompletedTask]);

  const handleUpdateTask = useCallback((updatedTask) => {
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      if (!updated.todoist?.upcoming) return updated;
      const idx = updated.todoist.upcoming.findIndex(
        t => String(t.id) === String(updatedTask.id),
      );
      if (idx >= 0) updated.todoist.upcoming[idx] = updatedTask;

      // Recalculate stats — due_date may have changed
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
      // Green flash then remove
      setBriefing(prev => {
        const updated = JSON.parse(JSON.stringify(prev));
        const task = updated.ctm?.upcoming?.find(t => String(t.id) === String(taskId));
        if (task) task._completing = true;
        return updated;
      });
      setTimeout(() => removeCompletedTask(taskId), 600);
      if (String(expandedTask) === String(taskId)) setExpandedTask(null);
      return;
    }

    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const task = updated.ctm?.upcoming?.find(t => String(t.id) === String(taskId));
      if (task) task.status = status;

      return updated;
    });
    if (status === "complete" && String(expandedTask) === String(taskId)) setExpandedTask(null);
  }, [expandedTask, setBriefing, removeCompletedTask]);

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
