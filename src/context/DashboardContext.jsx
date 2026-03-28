import { createContext, useContext, useState, useCallback, useRef, useMemo } from "react";
import { dismissEmail } from "../api";

const DashboardContext = createContext(null);

export function DashboardProvider({ briefing, setBriefing, children }) {
  const [activeAccount, setActiveAccount] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [loadingBillId, setLoadingBillId] = useState(null);
  const [confirmDismissId, setConfirmDismissId] = useState(null);
  const [expandedTask, setExpandedTask] = useState(null);
  const emailSectionRef = useRef(null);

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

  const emailAccounts = useMemo(
    () => briefing?.emails?.accounts || [],
    [briefing?.emails?.accounts],
  );
  const currentAccount = emailAccounts[activeAccount] || {
    important: [],
    name: "",
    icon: "",
    color: "#818cf8",
    unread: 0,
  };

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
      emailAccounts,
      currentAccount,
      emailSectionRef,
      billEmails,
      totalBills,
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
