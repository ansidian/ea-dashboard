import { cn } from "@/lib/utils";

function clickableProps(enabled, onActivate) {
  if (!enabled) return {};
  return {
    role: "button",
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") onActivate();
    },
  };
}

export default function PrimaryItem({ item, sectionType, onEmailClick }) {
  const isClickableEmail =
    (sectionType === "emails" || sectionType === "bills") &&
    item.id &&
    item.accountName;
  const clickableClass = isClickableEmail
    ? "cursor-pointer px-1 rounded hover:bg-white/[0.04]"
    : "";
  const activate = () => onEmailClick(item);
  const clickProps = clickableProps(isClickableEmail, activate);

  if (sectionType === "bills" && item.extractedBill) {
    const bill = item.extractedBill;
    return (
      <div
        {...clickProps}
        className={cn(
          "flex items-center gap-2 py-1 text-[11px] transition-colors",
          clickableClass,
        )}
      >
        <span className="text-success font-semibold min-w-[60px] tabular-nums">
          ${bill.amount.toFixed(2)}
        </span>
        <span className="text-foreground/80">{bill.payee}</span>
        {bill.due_date && (
          <span className="text-muted-foreground/50">due {bill.due_date}</span>
        )}
        {bill.type && (
          <span
            className="text-[9px] font-medium px-1 py-px rounded"
            style={{ color: "#a6e3a199", background: "#a6e3a10d" }}
          >
            {bill.type}
          </span>
        )}
        {bill.category_name && (
          <span className="text-muted-foreground/40">
            [{bill.category_name}]
          </span>
        )}
        {isClickableEmail && (
          <span className="text-primary/50 text-[10px] ml-auto shrink-0">
            view →
          </span>
        )}
      </div>
    );
  }

  if (sectionType === "emails") {
    const urgColors = { high: "#f38ba8", medium: "#f9e2af", low: "#6c7086" };
    return (
      <div
        {...clickProps}
        className={cn("py-1 text-[11px] transition-colors", clickableClass)}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-foreground/90 font-medium">{item.from}</span>
          {item.urgency && (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: urgColors[item.urgency] || "#6c7086" }}
            />
          )}
          {item.action && item.action !== "FYI" && (
            <span className="text-warning text-[10px]">{item.action}</span>
          )}
          {isClickableEmail && (
            <span className="text-primary/50 text-[10px] ml-auto shrink-0">
              view →
            </span>
          )}
        </div>
        <div className="text-muted-foreground mt-px">{item.subject}</div>
      </div>
    );
  }

  if (sectionType === "deadlines") {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px]">
        <span className="text-foreground/90 font-medium">{item.title}</span>
        {item.due_date && (
          <span className="text-muted-foreground/50">due {item.due_date}</span>
        )}
        {item.class_name && (
          <span style={{ color: "#fab387" }}>{item.class_name}</span>
        )}
        {item.points_possible > 0 && (
          <span className="text-muted-foreground/40 tabular-nums">
            {item.points_possible}pts
          </span>
        )}
      </div>
    );
  }

  if (sectionType === "calendar") {
    return (
      <div className="flex items-center gap-2 py-1 text-[11px]">
        <span className="text-foreground/70 tabular-nums">{item.time}</span>
        <span className="text-foreground/80 font-medium">{item.title}</span>
        {item.duration && (
          <span className="text-muted-foreground/40">{item.duration}</span>
        )}
        {item.flag && (
          <span className="text-warning text-[10px]">[{item.flag}]</span>
        )}
      </div>
    );
  }

  // Insights
  if (item.text) {
    return (
      <div className="flex gap-1.5 items-start py-1 text-[11px] text-foreground/75">
        <span className="shrink-0">{item.icon}</span>
        <span className="leading-relaxed">{item.text}</span>
      </div>
    );
  }

  return null;
}
