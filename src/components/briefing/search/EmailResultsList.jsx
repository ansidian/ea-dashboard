import EmailResultCard from "./EmailResultCard";
import { Icon } from "@/lib/icons.jsx";

function AccountHeader({ acct, unreadCount }) {
  return (
    <div
      className="sticky top-0 z-[5] flex items-center gap-2 px-5 py-1.5"
      style={{
        background: "rgba(28,28,42, 0.92)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <span className="shrink-0 flex items-center"><Icon name={acct.account_icon} size={12} /></span>
      <span className="text-[10px] font-semibold tracking-[1.5px] uppercase text-foreground/75 truncate">
        {acct.account_label}
      </span>
      <div className="ml-auto flex items-center gap-2.5 shrink-0">
        {unreadCount > 0 && (
          <span className="text-[10px] font-semibold tabular-nums" style={{ color: "#cba6da" }}>
            {unreadCount} unread
          </span>
        )}
        <span className="text-[10px] tabular-nums text-muted-foreground/45">
          {acct.results.length}
        </span>
      </div>
    </div>
  );
}

export default function EmailResultsList({
  accounts,
  flatEmails,
  focusedIdx,
  openEmailUid,
  onFocusChange,
  onOpenEmail,
}) {
  // O(1) uid -> flatIdx lookup (replaces the O(n^2) findIndex pattern in original)
  const flatIdxByUid = new Map();
  flatEmails.forEach((f, i) => flatIdxByUid.set(f.uid, i));

  return (
    <>
      {accounts.map((acct) => {
        const acctUnread = acct.results.filter((r) => !r.read).length;
        return (
          <div key={acct.account_id}>
            <AccountHeader acct={acct} unreadCount={acctUnread} />
            {acct.results.map((r) => {
              const flatIdx = flatIdxByUid.get(r.uid) ?? -1;
              return (
                <EmailResultCard
                  key={r.uid}
                  r={r}
                  acctColor={acct.account_color}
                  isActive={openEmailUid === r.uid}
                  isFocused={flatIdx === focusedIdx}
                  onMouseEnter={() => onFocusChange(flatIdx)}
                  onOpen={() => onOpenEmail(r, acct)}
                />
              );
            })}
          </div>
        );
      })}
    </>
  );
}
