import { useState, useCallback } from "react";

export default function useEmailNavigation({ setEmailResults }) {
  const [openEmail, setOpenEmail] = useState(null);

  const handleOpenEmail = useCallback((email, acct) => {
    setOpenEmail({
      ...email,
      account_id: acct.account_id,
      account_label: acct.account_label,
      account_email: acct.account_email,
      account_color: acct.account_color,
      account_icon: acct.account_icon,
    });
  }, []);

  const setEmailReadState = useCallback((uid, read) => {
    setEmailResults((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        accounts: prev.accounts.map((a) => ({
          ...a,
          results: a.results.map((r) => (r.uid === uid ? { ...r, read } : r)),
        })),
      };
    });
  }, [setEmailResults]);

  return {
    openEmail,
    setOpenEmail,
    handleOpenEmail,
    handleMarkedRead: (uid) => setEmailReadState(uid, true),
    handleMarkedUnread: (uid) => setEmailReadState(uid, false),
  };
}
