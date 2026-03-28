export default function RefreshBanner({ progress }) {
  return (
    <div className="bg-gradient-to-br from-accent/12 to-accent-secondary/8 border border-accent/20 rounded-lg px-5 py-3 mb-5 flex items-center gap-3 animate-[fadeIn_0.3s_ease]">
      <div className="w-[18px] h-[18px] border-2 border-accent/30 border-t-accent-light rounded-full animate-spin shrink-0" />
      <div>
        <div className="text-[13px] font-semibold text-accent-lightest">
          Generating fresh briefing...
        </div>
        <div className="text-xs text-text-secondary mt-0.5 transition-opacity duration-200">
          {progress || "Starting up..."}
        </div>
      </div>
    </div>
  );
}
