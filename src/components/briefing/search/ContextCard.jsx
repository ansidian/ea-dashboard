import { cn } from "@/lib/utils";
import { SECTION_META } from "./constants";
import PrimaryItem from "./PrimaryItem";
import RelatedItem from "./RelatedItem";

const PRIMARY_HEADINGS = {
  bills: "Matched Transactions",
  emails: "Matched Emails",
  deadlines: "Matched Deadlines",
  calendar: "Matched Events",
  insights: "Matched Insights",
};

export default function ContextCard({ ctx, loading, sectionType, onEmailClick }) {
  const meta = SECTION_META[sectionType] || { color: "#b4befe" };

  if (loading) {
    return (
      <div className="py-2.5 pl-[52px] pr-5 flex items-center gap-2">
        <div className="w-3 h-3 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin" />
        <span className="text-[11px] text-muted-foreground/50">
          Loading context...
        </span>
      </div>
    );
  }
  if (!ctx) return null;

  const hasPrimary = ctx.primary?.length > 0;
  const hasRelated = ctx.related?.length > 0;

  if (!hasPrimary && !hasRelated) {
    return (
      <div className="py-2 pl-[52px] pr-5 pb-3 text-muted-foreground/40 text-[11px] italic">
        No additional context found
      </div>
    );
  }

  return (
    <div
      className="mx-4 ml-[52px] mb-3 rounded-lg overflow-hidden"
      style={{
        background: "rgba(30,30,46,0.6)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {hasPrimary && (
        <div className="p-2.5 px-3">
          <div
            className="text-[9px] tracking-[1.2px] uppercase font-semibold mb-1.5"
            style={{ color: `${meta.color}99` }}
          >
            {PRIMARY_HEADINGS[sectionType] || "Matched Insights"}
          </div>
          {ctx.primary.map((item, i) => (
            <PrimaryItem
              key={i}
              item={item}
              sectionType={sectionType}
              onEmailClick={onEmailClick}
            />
          ))}
        </div>
      )}

      {hasRelated && (
        <div
          className={cn(
            "p-2.5 px-3",
            hasPrimary && "border-t border-white/[0.04]",
          )}
        >
          <div className="text-[9px] tracking-[1.2px] uppercase text-muted-foreground/50 font-semibold mb-1.5">
            Related
          </div>
          {ctx.related.map((item, i) => (
            <RelatedItem key={i} item={item} onEmailClick={onEmailClick} />
          ))}
        </div>
      )}
    </div>
  );
}
