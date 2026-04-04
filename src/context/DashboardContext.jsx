import { createContext, useContext, useState, useCallback, useRef, useMemo } from "react";
import { dismissEmail, completeTask } from "../api";

const DashboardContext = createContext(null);

export function DashboardProvider({ briefing, setBriefing, children }) {
  const [activeAccount, setActiveAccount] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loadingBillId, setLoadingBillId] = useState(null);
  const [confirmDismissId, setConfirmDismissId] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
  const emailSectionRef = useRef(null);

  const markAccountEmailsRead = useCallback(() => {
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const acct = updated.emails?.accounts?.[activeAccount];
      if (acct) {
        for (const e of acct.important) e.read = true;
      }
      return updated;
    });
  }, [activeAccount, setBriefing]);

  const handleDismiss = useCallback(async (emailId) => {
    dismissEmail(emailId).catch(() => {});
    if (selectedEmail?.id === emailId) setSelectedEmail(null);
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      for (const acct of updated.emails?.accounts || []) {
        acct.important = acct.important.filter(e => e.id !== emailId);
        acct.unread = acct.important.length;
      }
      return updated;
    });
  }, [selectedEmail, setBriefing]);

  const handleCompleteTask = useCallback(async (taskId) => {
    completeTask(taskId).catch(() => {});
    setBriefing(prev => {
      const updated = JSON.parse(JSON.stringify(prev));
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      const weekFromNow = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });

      // Remove from CTM (matched by todoist_id on synced items)
      if (updated.ctm?.upcoming) {
        updated.ctm.upcoming = updated.ctm.upcoming.filter(t => t.id !== taskId && t.todoist_id !== taskId);
        let totalPoints = 0, dueToday = 0, dueThisWeek = 0;
        for (const d of updated.ctm.upcoming) {
          if (d.due_date === today) dueToday++;
          if (d.due_date >= today && d.due_date <= weekFromNow) dueThisWeek++;
          if (d.points_possible) totalPoints += d.points_possible;
        }
        updated.ctm.stats = { incomplete: updated.ctm.upcoming.length, dueToday, dueThisWeek, totalPoints };
      }

      // Remove from Todoist
      if (updated.todoist?.upcoming) {
        updated.todoist.upcoming = updated.todoist.upcoming.filter(t => t.id !== taskId);
        let totalPoints = 0, dueToday = 0, dueThisWeek = 0;
        for (const d of updated.todoist.upcoming) {
          if (d.due_date === today) dueToday++;
          if (d.due_date >= today && d.due_date <= weekFromNow) dueThisWeek++;
          if (d.points_possible) totalPoints += d.points_possible;
        }
        updated.todoist.stats = { incomplete: updated.todoist.upcoming.length, dueToday, dueThisWeek, totalPoints };
      }

      return updated;
    });
    if (expandedTask === taskId) setExpandedTask(null);
  }, [expandedTask, setBriefing]);

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
      markAccountEmailsRead,
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
