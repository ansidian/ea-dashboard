import Section from "../layout/Section";
import { MotionList, MotionItem } from "../ui/motion-wrappers";

export default function InsightsSection({
  insights,
  loaded,
  delay,
  style,
  className,
}) {
  if (!insights?.length) return null;

  return (
    <Section
      title="Claude's Insights"
      delay={delay}
      loaded={loaded}
      style={style}
      className={className}
    >
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
              background: "rgba(36,36,58,0.4)",
              border: "1px solid rgba(255,255,255,0.04)",
            }}
          >
            {/* Quote accent bar */}
            <div
              className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
              style={{ background: "#cba6da", opacity: 0.7 }}
            />

            {/* Emoji well */}
            <span
              className="text-sm shrink-0 w-7 h-7 flex items-center justify-center rounded-md"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              {insight.icon}
            </span>

            <span className="text-[13px] leading-relaxed text-foreground/75">
              {insight.text}
            </span>
          </MotionItem>
        ))}
      </MotionList>
    </Section>
  );
}
