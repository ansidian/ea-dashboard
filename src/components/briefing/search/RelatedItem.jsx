import { cn } from "@/lib/utils";

export default function RelatedItem({ item, onEmailClick }) {
  const isEmail = item.type === "email" && item.emailData;

  return (
    <div
      role={isEmail ? "button" : undefined}
      tabIndex={isEmail ? 0 : undefined}
      onClick={isEmail ? () => onEmailClick(item.emailData) : undefined}
      onKeyDown={
        isEmail
          ? (e) => {
              if (e.key === "Enter" || e.key === " ")
                onEmailClick(item.emailData);
            }
          : undefined
      }
      className={cn(
        "flex gap-1.5 items-start py-1 px-1 text-[11px] text-muted-foreground rounded transition-colors",
        isEmail && "cursor-pointer hover:bg-white/[0.04]",
      )}
    >
      <span className="shrink-0">{item.icon}</span>
      <span className="leading-relaxed flex-1">{item.text}</span>
      {isEmail && (
        <span className="text-primary text-[10px] shrink-0 mt-px opacity-60">
          view →
        </span>
      )}
    </div>
  );
}
