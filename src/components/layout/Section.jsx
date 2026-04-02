import { cn } from "@/lib/utils";

const tierStyles = {
  1: {
    wrapper: "rounded-xl",
    wrapperStyle: {
      background: "rgba(36,36,58,0.3)",
      border: "1px solid rgba(203,166,218,0.10)",
      padding: "16px 20px",
    },
    titleClass: "text-[11px] tracking-[2.5px] uppercase text-text-muted font-semibold mb-3",
  },
  2: {
    wrapper: "rounded-xl",
    wrapperStyle: {
      background: "rgba(36,36,58,0.3)",
      border: "1px solid rgba(255,255,255,0.04)",
      padding: "12px 16px",
    },
    titleClass: "text-[11px] tracking-[2.5px] uppercase font-semibold mb-2.5",
    titleStyle: { color: "rgba(255,255,255,0.20)" },
  },
};

export default function Section({ title, children, delay, loaded, style, className, tier = 1 }) {
  const t = tierStyles[tier] || tierStyles[1];
  return (
    <div
      className={cn(
        "min-w-0 transition-all duration-[600ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
        loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        t.wrapper,
        className
      )}
      style={{ transitionDelay: `${delay}ms`, ...t.wrapperStyle, ...style }}
    >
      <h2 className={t.titleClass} style={t.titleStyle}>
        {title}
      </h2>
      {children}
    </div>
  );
}
