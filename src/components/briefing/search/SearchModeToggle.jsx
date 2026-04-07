import { cn } from "@/lib/utils";

export default function SearchModeToggle({ mode, onChange }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-md p-0.5 shrink-0"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
      role="tablist"
      aria-label="Search scope"
    >
      <ModePill
        label="Emails"
        active={mode === "emails"}
        onClick={() => onChange("emails")}
      />
      <ModePill
        label="Briefings"
        active={mode === "briefings"}
        onClick={() => onChange("briefings")}
      />
    </div>
  );
}

function ModePill({ label, active, onClick }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "text-[10px] font-semibold tracking-wide rounded px-2 py-1 transition-all duration-150 cursor-pointer",
        active
          ? "bg-primary/[0.14] text-[#cba6da]"
          : "bg-transparent text-muted-foreground/55 hover:text-foreground/85",
      )}
    >
      {label}
    </button>
  );
}
