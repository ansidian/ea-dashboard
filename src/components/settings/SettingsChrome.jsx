import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "accounts", label: "Accounts & Integrations" },
  { id: "briefing", label: "Briefing" },
  { id: "system", label: "System" },
];

function readTab() {
  try {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return TABS.some(t => t.id === tab) ? tab : "accounts";
  } catch {
    return "accounts";
  }
}

function SkeletonCard({ lines = 2 }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 px-5 mb-5 animate-pulse">
      <div className="h-3 w-32 bg-white/[0.06] rounded mb-4" />
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="h-8 bg-white/[0.04] rounded-md mb-2" style={{ width: `${70 + (i % 3) * 10}%` }} />
      ))}
    </div>
  );
}

// Eagerly-loaded Settings shell used as the Suspense fallback. Renders the
// header, sidebar, and skeleton cards so route transitions never flash.
export default function SettingsChrome() {
  const active = readTab();
  return (
    <div className="min-h-screen text-foreground font-sans p-4 sm:p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] font-medium text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground transition-colors no-underline">
          <ChevronLeft size={14} />
          Dashboard
        </Link>
        <h1 className="font-serif text-[28px] font-normal m-0 text-foreground">Settings</h1>
      </div>

      <div className="flex gap-6 max-md:flex-col">
        <nav className="md:w-[200px] md:shrink-0 md:sticky md:top-6 md:self-start">
          <div className="flex md:flex-col gap-1 max-md:overflow-x-auto max-md:pb-2 max-md:-mx-4 max-md:px-4">
            {TABS.map(t => (
              <div key={t.id} className={cn(
                "text-left text-[13px] px-3 py-2 rounded-lg whitespace-nowrap",
                active === t.id ? "bg-primary/[0.1] text-primary" : "text-muted-foreground"
              )}>
                {t.label}
              </div>
            ))}
          </div>
        </nav>

        <div className="flex-1 min-w-0">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      </div>
    </div>
  );
}
