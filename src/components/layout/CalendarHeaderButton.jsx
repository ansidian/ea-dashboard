import { Calendar } from "lucide-react";
import useIsMobile from "../../hooks/useIsMobile";

const VIEW_LABELS = { bills: "Bills", deadlines: "Deadlines" };

export default function CalendarHeaderButton({
  lastView = "bills",
  onOpen,
  showBills = true,
}) {
  const isMobile = useIsMobile();
  const resolvedView = showBills ? lastView : "deadlines";

  return (
    <button
      type="button"
      onClick={() => onOpen?.(resolvedView)}
      className="flex items-center gap-2.5 shrink-0 rounded-lg px-3.5 cursor-pointer transition-colors duration-150 font-[inherit] leading-none"
      style={{
        background: "rgba(203,166,218,0.06)",
        border: "1px solid rgba(203,166,218,0.14)",
        color: "rgba(203,166,218,0.85)",
        height: 51,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "#cba6da";
        e.currentTarget.style.borderColor = "rgba(203,166,218,0.35)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "rgba(203,166,218,0.85)";
        e.currentTarget.style.borderColor = "rgba(203,166,218,0.14)";
      }}
      title={`Open calendar — ${VIEW_LABELS[resolvedView]}`}
    >
      <Calendar size={14} strokeWidth={1.8} />
      {!isMobile && (
        <span className="text-[13px] font-medium leading-none">Calendar</span>
      )}
    </button>
  );
}
