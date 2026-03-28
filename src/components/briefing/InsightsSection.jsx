import { cn } from "@/lib/utils";
import Section from "../layout/Section";

export default function InsightsSection({ insights, loaded, delay, style, className }) {
  if (!insights?.length) return null;

  return (
    <Section title="Claude's Take" delay={delay} loaded={loaded} style={style} className={className}>
      <div className="flex flex-col gap-3">
        {insights.map((insight, i) => (
          <div
            key={i}
            className={cn(
              "bg-[rgba(255,255,255,0.03)] border border-border rounded-lg px-4 py-3.5 text-sm leading-relaxed text-[#cbd5e1] flex gap-3 items-start transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
              loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            )}
            style={{ transitionDelay: `${delay + 100 + i * 80}ms` }}
          >
            <span className="text-base shrink-0 mt-px">
              {insight.icon}
            </span>
            <span>{insight.text}</span>
          </div>
        ))}
      </div>
    </Section>
  );
}
