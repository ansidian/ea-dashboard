import { cn } from "@/lib/utils";
import Section from "../layout/Section";

export default function ScheduleSection({ calendar, loaded, delay, style, className }) {
  return (
    <Section title="Today's Schedule" delay={delay} loaded={loaded} style={style} className={className}>
      {calendar?.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {calendar.map((event, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-3 py-3 px-4 rounded transition-opacity duration-200",
                event.flag === "Conflict"
                  ? "bg-danger/[0.06] border border-danger/20"
                  : "bg-surface border border-border",
                event.passed && "opacity-40",
              )}
            >
              <div
                className="w-[3px] h-9 rounded-sm shrink-0"
                style={{ background: event.color }}
              />
              <div className="min-w-[72px]">
                <div className="text-[13px] font-semibold text-text-primary">
                  {event.time}
                </div>
                <div className="text-[11px] text-text-muted">
                  {event.duration}
                </div>
              </div>
              <div className="flex-1">
                <div
                  className={cn(
                    "text-[14px] font-medium text-text-body",
                    event.passed && "line-through",
                  )}
                >
                  {event.title}
                </div>
                <div className="text-[11px] text-text-muted">
                  {event.source}
                </div>
              </div>
              {event.passed && (
                <div className="text-[10px] font-semibold tracking-wide uppercase text-text-muted bg-surface-hover py-1 px-2 rounded-md">
                  Done
                </div>
              )}
              {!event.passed && event.flag && (
                <div
                  className={cn(
                    "text-[10px] font-semibold tracking-wide uppercase py-1 px-2 rounded-md",
                    event.flag === "Conflict"
                      ? "text-red-300 bg-danger/[0.12]"
                      : "text-yellow-300 bg-warning/10",
                  )}
                >
                  {event.flag}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-text-muted text-center py-5 px-4 text-[13px]">
          No events today
        </div>
      )}
    </Section>
  );
}
