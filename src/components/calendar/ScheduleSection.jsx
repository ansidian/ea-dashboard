import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import Section from "../layout/Section";

function useNowTime() {
  const fmt = () => new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const [time, setTime] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setTime(fmt()), 60_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function NowMarker({ time }) {
  return (
    <div className="relative flex items-center gap-2 py-2 my-1">
      <div
        className="absolute left-[-19px] w-[9px] h-[9px] rounded-full"
        style={{
          background: "#cba6da",
          boxShadow: "0 0 8px rgba(203,166,218,0.5)",
        }}
      />
      <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, #cba6da 0%, transparent 100%)" }} />
      <span className="text-[10px] font-semibold tabular-nums text-[#cba6da] shrink-0">
        {time}
      </span>
    </div>
  );
}

export default function ScheduleSection({ calendar, loaded, delay, style, className }) {
  const nowTime = useNowTime();

  // Where to insert the now marker:
  // - Before the first non-passed event (between passed and upcoming)
  // - At the top if no events have passed yet
  // - At the bottom if all events have passed
  const firstUpcoming = calendar?.findIndex(e => !e.passed) ?? -1;
  const nowPosition = calendar?.length > 0
    ? (firstUpcoming >= 0 ? firstUpcoming : calendar.length)
    : -1;

  // Only show source chips when events come from multiple calendars
  const sources = new Set(calendar?.map(e => e.source).filter(Boolean));
  const showSource = sources.size > 1;

  return (
    <Section title="Today's Schedule" delay={delay} loaded={loaded} style={style} className={className}>
      {calendar?.length > 0 ? (
        <div className="relative pl-5">
          {/* Timeline spine */}
          <div
            className="absolute left-[5px] top-2 bottom-2 w-px"
            style={{ background: "rgba(255,255,255,0.06)" }}
          />

          <div className="flex flex-col gap-1">
            {/* Now marker at the top (no events passed yet) */}
            {nowPosition === 0 && <NowMarker time={nowTime} />}

            {calendar.map((event, i) => (
              <div key={i}>
                {/* Event card */}
                <div
                  className={cn(
                    "group relative flex items-center gap-3 py-3 px-4 rounded-lg transition-all duration-200",
                    event.flag === "Conflict"
                      ? "bg-destructive/[0.05]"
                      : "bg-card/60",
                    event.passed ? "opacity-40" : "hover:bg-card/80",
                  )}
                  style={{
                    border: event.flag === "Conflict"
                      ? "1px solid rgba(243,139,168,0.2)"
                      : "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  {/* Timeline dot — on the spine */}
                  <div
                    className="absolute -left-5 top-1/2 -translate-y-1/2 w-[7px] h-[7px] rounded-full shrink-0 transition-all duration-200"
                    style={{
                      background: event.passed ? "rgba(255,255,255,0.1)" : event.color,
                      boxShadow: event.passed ? "none" : `0 0 6px ${event.color}50`,
                    }}
                  />

                  {/* Color accent bar */}
                  <div
                    className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
                    style={{
                      background: event.color,
                      opacity: event.passed ? 0.3 : 0.8,
                      boxShadow: event.passed ? "none" : `0 0 8px ${event.color}30`,
                    }}
                  />

                  {/* Time + duration */}
                  <div className="min-w-[72px] ml-1">
                    <div className={cn(
                      "text-[13px] font-semibold tabular-nums",
                      event.passed ? "text-muted-foreground" : "text-foreground",
                    )}>
                      {event.time}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50">
                      {event.duration}
                    </div>
                  </div>

                  {/* Title + source */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        "text-[13px] font-medium truncate",
                        event.passed
                          ? "text-muted-foreground line-through decoration-muted-foreground/30"
                          : "text-foreground/90",
                      )}
                    >
                      {event.title}
                    </div>
                    {showSource && event.source && (
                      <span
                        className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-medium rounded px-1.5 py-px"
                        style={{
                          color: `${event.color}cc`,
                          background: `${event.color}10`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: event.color, opacity: 0.7 }}
                        />
                        {event.source}
                      </span>
                    )}
                  </div>

                  {/* Flags */}
                  {!event.passed && event.flag && (
                    <div
                      className={cn(
                        "text-[9px] font-semibold tracking-wider uppercase py-1 px-2 rounded-md shrink-0",
                        event.flag === "Conflict"
                          ? "text-[#f38ba8] bg-[#f38ba8]/[0.08]"
                          : "text-[#f9e2af] bg-[#f9e2af]/[0.08]",
                      )}
                    >
                      {event.flag}
                    </div>
                  )}
                </div>

                {/* Now marker — between passed and upcoming */}
                {nowPosition > 0 && nowPosition < calendar.length && i === nowPosition - 1 && <NowMarker time={nowTime} />}
              </div>
            ))}

            {/* Now marker at the bottom (all events passed) */}
            {nowPosition === calendar.length && <NowMarker time={nowTime} />}
          </div>
        </div>
      ) : (
        <div className="py-8 text-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2.5 text-muted-foreground/20">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <div className="text-[11px] text-muted-foreground/50">No events scheduled today</div>
        </div>
      )}
    </Section>
  );
}
