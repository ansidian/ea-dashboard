export const SURFACE_ROW_CLASS =
  "rounded-lg border border-white/[0.06] bg-white/[0.02] transition-colors hover:border-white/[0.1] hover:bg-white/[0.03]";
export const SETTINGS_CARD_CLASS =
  "mb-5 border border-white/[0.06] bg-[rgba(36,36,58,0.28)] shadow-none backdrop-blur-[3px]";
export const SETTINGS_PRIMARY_BUTTON_CLASS =
  "border border-primary/20 bg-primary/[0.12] text-primary hover:bg-primary/[0.16] hover:border-primary/28 hover:-translate-y-px active:translate-y-0";
export const SETTINGS_SECONDARY_BUTTON_CLASS =
  "border border-white/[0.08] bg-white/[0.03] text-foreground hover:bg-white/[0.05] hover:border-white/[0.14] hover:-translate-y-px active:translate-y-0";
export const SETTINGS_GHOST_BUTTON_CLASS =
  "border border-transparent bg-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground hover:border-white/[0.08]";

export const TABS = [
  { id: "accounts", label: "Accounts & Integrations" },
  { id: "briefing", label: "Briefing" },
  { id: "system", label: "System" },
];

export function readTabFromURL() {
  try {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return TABS.some((entry) => entry.id === tab) ? tab : "accounts";
  } catch {
    return "accounts";
  }
}

export function writeTabToURL(tab) {
  const url = new URL(window.location.href);
  if (tab === "accounts") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url.toString());
}
