import { cn } from "@/lib/utils";
import { SparkleIcon } from "./Icons";

export function AnalysisResult({ analysis }) {
  if (!analysis) return null;
  return (
    <div
      className="mx-3 mb-3 rounded-lg overflow-hidden"
      style={{
        background: "rgba(203,166,218,0.04)",
        border: "1px solid rgba(203,166,218,0.1)",
      }}
    >
      <div className="px-4 pt-3 pb-0.5 flex items-center gap-2" style={{ color: "#cba6da" }}>
        <SparkleIcon size={12} />
        <span className="text-[10px] tracking-wider uppercase text-[#cba6da] font-semibold">
          Analysis
        </span>
      </div>
      <div className="px-4 pt-1.5 pb-3 text-[12px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
        {analysis}
      </div>
    </div>
  );
}

export function AnalyzeButton({ analyzing, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={analyzing}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium font-[inherit] transition-all duration-200",
        analyzing
          ? "bg-primary/[0.06] text-muted-foreground cursor-not-allowed border border-white/[0.04]"
          : "bg-primary/[0.08] text-[#cba6da] cursor-pointer border border-primary/15 hover:bg-primary/[0.14] hover:border-primary/25",
      )}
    >
      {analyzing ? (
        <div className="w-3 h-3 border-[1.5px] border-primary/20 border-t-primary rounded-full animate-spin" />
      ) : (
        <SparkleIcon size={11} />
      )}
      {analyzing ? "Analyzing..." : "Analyze"}
      {!analyzing && (
        <span className="text-[9px] text-muted-foreground/40 font-normal ml-0.5">
          Haiku
        </span>
      )}
    </button>
  );
}
