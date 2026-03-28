import { cn } from "@/lib/utils";

export default function Section({ title, children, delay, loaded, style, className }) {
  return (
    <div
      className={cn(
        "min-w-0 transition-all duration-[600ms] [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]",
        loaded ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        className
      )}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      <h2 className="text-[11px] tracking-[2.5px] uppercase text-text-muted font-semibold mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}
