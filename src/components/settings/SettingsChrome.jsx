import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const SETTINGS_CARD_CLASS =
  "mb-5 border border-white/[0.06] bg-[rgba(36,36,58,0.28)] shadow-none backdrop-blur-[3px]";

const TABS = [
  { id: "accounts", label: "Accounts & Integrations" },
  { id: "briefing", label: "Briefing" },
  { id: "system", label: "System" },
];

function readTab() {
  try {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return TABS.some((t) => t.id === tab) ? tab : "accounts";
  } catch {
    return "accounts";
  }
}

function SkeletonCard({ lines = 2 }) {
  return (
    <Card className={cn(SETTINGS_CARD_CLASS, "animate-pulse")}>
      <CardHeader className="border-b border-white/[0.04] pb-4">
        <div className="h-3 w-36 rounded bg-white/[0.06]" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-4">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-8 rounded-md bg-white/[0.04]"
            style={{ width: `${70 + (i % 3) * 10}%` }}
          />
        ))}
      </CardContent>
    </Card>
  );
}

export default function SettingsChrome() {
  const active = readTab();

  return (
    <div className="relative isolate min-h-screen px-4 py-4 text-foreground sm:px-6 sm:py-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(ellipse at top, #1a1a2a, #0b0b13 60%)" }}
      />

      <div className="mx-auto max-w-[1140px]">
        <header className="mb-8 flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Link
                to="/"
                className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground/75 transition-colors no-underline hover:border-white/[0.1] hover:bg-white/[0.04] hover:text-foreground"
              >
                <ChevronLeft size={14} />
                Dashboard
              </Link>
              <div className="text-[11px] tracking-[2.5px] uppercase text-muted-foreground font-semibold">
                Workspace Preferences
              </div>
              <h1 className="ea-display mt-1 text-[32px] leading-none font-normal text-foreground">
                Settings
              </h1>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold tracking-[1.5px] uppercase text-muted-foreground/80">
              Auto-save on
            </div>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="md:sticky md:top-6 md:self-start">
            <div className="rounded-xl border border-white/[0.06] bg-[rgba(36,36,58,0.24)] p-2 ring-1 ring-white/[0.03] backdrop-blur-[3px]">
              <div className="px-2 pb-2 text-[11px] tracking-[2.5px] uppercase text-muted-foreground font-semibold">
                Sections
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
                {TABS.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-[13px] font-medium whitespace-nowrap",
                      active === t.id
                        ? "border-primary/20 bg-primary/[0.12] text-primary shadow-[0_0_8px_rgba(203,166,218,0.18)]"
                        : "border-transparent text-muted-foreground"
                    )}
                  >
                    {t.label}
                  </div>
                ))}
              </div>
            </div>
          </nav>

          <div className="min-w-0">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={2} />
          </div>
        </div>
      </div>
    </div>
  );
}
