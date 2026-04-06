import Section from "../layout/Section";
import { MotionList, MotionItem } from "../ui/motion-wrappers";

function formatStaleLabel(aiGeneratedAt) {
  if (!aiGeneratedAt) return null;
  const dt = new Date(aiGeneratedAt.endsWith("Z") ? aiGeneratedAt : aiGeneratedAt + "Z");
  const now = new Date();
  const diffH = Math.floor((now - dt) / 3_600_000);
  if (diffH < 1) return "less than an hour ago";
  if (diffH < 24) return `${diffH}h ago`;
  const day = dt.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "long" });
  const time = dt.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
  return `${day} ${time}`;
}

export default function InsightsSection({
  insights,
  loaded,
  delay,
  style,
  className,
  staleCount = 0,
  aiGeneratedAt,
}) {
  if (!insights?.length) return null;
  const isStale = staleCount >= 1;

  return (
    <Section
      title="Claude's Insights"
      delay={delay}
      loaded={loaded}
      style={style}
      className={className}
      summaryBadge={`${insights.length} item${insights.length !== 1 ? "s" : ""}`}
      defaultExpanded
    >
      {isStale && aiGeneratedAt && (
        <p
          className="text-[10px] leading-none mb-2"
          style={{ color: "rgba(255,255,255,0.25)" }}
        >
          From AI briefing {formatStaleLabel(aiGeneratedAt)}
        </p>
      )}
      <MotionList
        className="flex flex-col gap-1.5"
        loaded={loaded}
        delay={delay + 100}
        stagger={0.06}
      >
        {insights.map((insight, i) => (
          <MotionItem
            key={i}
            className="group relative rounded-lg pl-5 pr-4 py-3.5 flex gap-3 items-start"
            style={{
              background: isStale ? "rgba(36,36,58,0.25)" : "rgba(36,36,58,0.4)",
              border: `1px solid rgba(255,255,255,${isStale ? "0.03" : "0.04"})`,
            }}
          >
            {/* Quote accent bar */}
            <div
              className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
              style={isStale
                ? { background: "rgba(205,214,244,0.18)" }
                : { background: "#cba6da", opacity: 0.7 }
              }
            />

            {/* Emoji well */}
            <span
              className="text-sm shrink-0 w-7 h-7 flex items-center justify-center rounded-md"
              style={{ background: `rgba(255,255,255,${isStale ? "0.02" : "0.03"})` }}
            >
              {insight.icon}
            </span>

            <span
              className={`text-[13px] leading-relaxed ${isStale ? "" : "text-foreground/75"}`}
              style={isStale ? { color: "rgba(205,214,244,0.45)" } : undefined}
            >
              {insight.text}
            </span>
          </MotionItem>
        ))}
      </MotionList>
    </Section>
  );
}
