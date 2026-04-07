import { cn } from "@/lib/utils";

export default function FilterChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-150 cursor-pointer",
        active
          ? "bg-primary/[0.12] text-[#cba6da] border border-primary/25"
          : "bg-transparent text-muted-foreground/60 border border-transparent hover:text-foreground/80 hover:bg-white/[0.04]",
      )}
    >
      <span>{label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "text-[10px] tabular-nums",
            active ? "text-[#cba6da]/80" : "text-muted-foreground/40",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
