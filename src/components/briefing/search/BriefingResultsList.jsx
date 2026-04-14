import { cn } from "@/lib/utils";
import { SECTION_META } from "./constants";
import { formatBriefingDate } from "./formatDate";
import { ChevronRightIcon } from "./Icons";
import { Icon } from "@/lib/icons.jsx";
import ContextCard from "./ContextCard";

function BriefingResultRow({
  r,
  relevantIdx,
  focusedIdx,
  expandedId,
  expandedCtx,
  loadingCtx,
  onExpand,
  onFocusChange,
  onEmailClick,
}) {
  const key = `${r.briefing_id}-${r.id}`;
  const isExpanded = expandedId === key;
  const isFocused = relevantIdx === focusedIdx;
  const meta = SECTION_META[r.section_type] || {
    icon: "ClipboardList",
    color: "#b4befe",
    label: r.section_type,
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onExpand(r)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") onExpand(r);
        }}
        onMouseEnter={() => onFocusChange(relevantIdx)}
        className={cn(
          "group relative flex gap-3 items-start mx-2 rounded-lg cursor-pointer transition-all duration-150",
          isExpanded && "bg-white/[0.04]",
        )}
        style={{ padding: "12px 16px" }}
      >
        {/* Hover/focus bg */}
        {!isExpanded && (
          <div
            className={cn(
              "absolute inset-0 rounded-lg transition-colors duration-150",
              isFocused
                ? "bg-white/[0.04]"
                : "bg-transparent group-hover:bg-white/[0.03]",
            )}
          />
        )}

        {/* Section icon */}
        <span className="relative shrink-0 mt-px flex items-center" style={{ color: meta.color }}>
          <Icon name={meta.icon} size={14} />
        </span>

        <div className="relative flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {/* Section badge — color-coded */}
            <span
              className="text-[9px] tracking-wider uppercase font-semibold px-1.5 py-px rounded"
              style={{
                color: meta.color,
                background: `${meta.color}12`,
              }}
            >
              {meta.label}
            </span>
            {/* Relevance indicator */}
            {r.score != null && (
              <div className="flex items-center gap-1">
                <div className="w-[32px] h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(r.score * 100, 100)}%`,
                      background:
                        r.score > 0.6
                          ? meta.color
                          : "rgba(255,255,255,0.2)",
                      opacity: r.score > 0.6 ? 0.7 : 0.4,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <div
            className="text-[12px] text-foreground/80 leading-relaxed overflow-hidden whitespace-pre-wrap"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: isExpanded ? 999 : 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {r.chunk_text}
          </div>
        </div>

        {/* Expand chevron */}
        <ChevronRightIcon
          size={12}
          className={cn(
            "relative shrink-0 mt-1 transition-all duration-200",
            isExpanded
              ? "text-primary rotate-90"
              : "text-muted-foreground/30 group-hover:text-muted-foreground/50",
          )}
        />
      </div>

      {/* Expanded context */}
      {isExpanded && (
        <ContextCard
          ctx={expandedCtx}
          loading={loadingCtx === key}
          sectionType={r.section_type}
          onEmailClick={(emailData) => onEmailClick(emailData, r.briefing_id)}
        />
      )}
    </div>
  );
}

export default function BriefingResultsList({
  relevant,
  grouped,
  sortedDates,
  focusedIdx,
  expandedId,
  expandedCtx,
  loadingCtx,
  onExpand,
  onFocusChange,
  onEmailClick,
}) {
  return (
    <>
      {sortedDates.map((date, di) => (
        <div key={date}>
          {/* Date group header */}
          <div className="flex items-center gap-3 px-5 pt-3.5 pb-1.5">
            <span className="text-[10px] tracking-[1.5px] uppercase text-muted-foreground/60 font-semibold whitespace-nowrap">
              {formatBriefingDate(date)}
            </span>
            {di > 0 && <div className="flex-1 h-px bg-white/[0.04]" />}
          </div>

          {grouped[date].map((r, i) => (
            <BriefingResultRow
              key={r.id || `${date}-${i}`}
              r={r}
              relevantIdx={relevant.indexOf(r)}
              focusedIdx={focusedIdx}
              expandedId={expandedId}
              expandedCtx={expandedCtx}
              loadingCtx={loadingCtx}
              onExpand={onExpand}
              onFocusChange={onFocusChange}
              onEmailClick={onEmailClick}
            />
          ))}
        </div>
      ))}
    </>
  );
}
