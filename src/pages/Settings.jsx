import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import {
  X,
  ChevronLeft,
  Mail,
  Bot,
  Clock,
  Tag,
  BellRing,
  CalendarClock,
  MapPin,
  Database,
  Check,
  Loader2,
  AlertCircle,
  KeyRound,
  Copy,
  Trash2,
} from "lucide-react";
import { SiActualbudget, SiTodoist } from "@icons-pack/react-simple-icons";
import {
  getAccounts,
  getSettings,
  updateSettings,
  getGmailAuthUrl,
  addICloudAccount,
  removeAccount,
  testActualBudget,
  geocodeLocation,
  getModels,
  skipSchedule,
  getImportantSenders,
  updateImportantSenders,
  listApiTokens,
  createApiToken,
  revokeApiToken,
} from "../api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const AccountsList = lazy(() => import("../components/settings/AccountsList"));

const FIELD_LABEL_CLASS =
  "mb-1.5 block text-[11px] tracking-[1.5px] uppercase text-muted-foreground font-medium";
const FIELD_HINT_CLASS = "text-[11px] leading-relaxed text-muted-foreground/60";
const SURFACE_ROW_CLASS =
  "rounded-lg border border-white/[0.06] bg-white/[0.02] transition-colors hover:border-white/[0.1] hover:bg-white/[0.03]";
const SETTINGS_CARD_CLASS =
  "mb-5 border border-white/[0.06] bg-[rgba(36,36,58,0.28)] shadow-none backdrop-blur-[3px]";
const SETTINGS_PRIMARY_BUTTON_CLASS =
  "border border-primary/20 bg-primary/[0.12] text-primary hover:bg-primary/[0.16] hover:border-primary/28 hover:-translate-y-px active:translate-y-0";
const SETTINGS_SECONDARY_BUTTON_CLASS =
  "border border-white/[0.08] bg-white/[0.03] text-foreground hover:bg-white/[0.05] hover:border-white/[0.14] hover:-translate-y-px active:translate-y-0";
const SETTINGS_GHOST_BUTTON_CLASS =
  "border border-transparent bg-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground hover:border-white/[0.08]";

const STATUS_TONE_CLASSES = {
  neutral: "border-white/[0.08] bg-white/[0.03] text-muted-foreground/80",
  accent: "border-primary/20 bg-primary/[0.1] text-primary",
  success: "border-[#a6e3a1]/20 bg-[#a6e3a1]/10 text-[#a6e3a1]",
  warning: "border-[#f9e2af]/20 bg-[#f9e2af]/10 text-[#f9e2af]",
  danger: "border-[#f38ba8]/20 bg-[#f38ba8]/10 text-[#f38ba8]",
};

// Replacement for window.confirm() — Chrome silently suppresses native dialogs
// after repeated triggers (especially under HMR + StrictMode in dev), making
// destructive actions appear to no-op. The in-app dialog isn't subject to that.
function useConfirm() {
  const [pending, setPending] = useState(null); // { message, resolve }
  const confirm = useCallback(
    (message) => new Promise((resolve) => setPending({ message, resolve })),
    []
  );
  const close = (value) => {
    pending?.resolve(value);
    setPending(null);
  };
  const dialog = (
    <Dialog open={!!pending} onOpenChange={(open) => { if (!open) close(false); }}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>Confirm</DialogTitle>
        <DialogDescription>{pending?.message}</DialogDescription>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => close(false)}>Cancel</Button>
          <Button variant="destructive" size="sm" onClick={() => close(true)}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
  return { confirm, dialog };
}

function useSettingsAutoSave() {
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const pendingRef = useRef({});
  const timerRef = useRef(null);
  const statusTimerRef = useRef(null);

  const flush = useCallback(async () => {
    const payload = pendingRef.current;
    pendingRef.current = {};
    if (!Object.keys(payload).length) return;
    setStatus("saving");
    try {
      await updateSettings(payload);
      sessionStorage.setItem("ea_settings_changed", "1");
      setStatus("saved");
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(
        () => setStatus((s) => (s === "saved" ? "idle" : s)),
        1500
      );
    } catch {
      setStatus("error");
    }
  }, []);

  const patch = useCallback((updates) => {
    Object.assign(pendingRef.current, updates);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 500);
  }, [flush]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    clearTimeout(statusTimerRef.current);
  }, []);

  return { patch, status };
}

function SaveStatus({ status }) {
  if (status === "saving") {
    return (
      <StatusPill tone="neutral">
        <Loader2 size={11} className="animate-spin" />
        Saving
      </StatusPill>
    );
  }
  if (status === "saved") {
    return (
      <StatusPill tone="success">
        <Check size={11} />
        Saved
      </StatusPill>
    );
  }
  if (status === "error") {
    return (
      <StatusPill tone="danger">
        <AlertCircle size={11} />
        Save failed
      </StatusPill>
    );
  }
  return <StatusPill tone="neutral">Auto-save on</StatusPill>;
}

function SectionLabel({ children, className }) {
  return (
    <label className={cn(FIELD_LABEL_CLASS, className)}>
      {children}
    </label>
  );
}

function FieldHint({ children, className }) {
  return (
    <p className={cn(FIELD_HINT_CLASS, className)}>
      {children}
    </p>
  );
}

function StatusPill({ tone = "neutral", className, children }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-[1.5px] uppercase",
        STATUS_TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

function SettingsCard({ title, icon, description, children, headerAction }) {
  return (
    <Card className={SETTINGS_CARD_CLASS}>
      <CardHeader className="gap-2 border-b border-white/[0.04] pb-4">
        <div className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-primary">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] tracking-[2.5px] uppercase text-muted-foreground font-semibold">
                  {title}
                </div>
                {description ? (
                  <CardDescription className="mt-1 text-[12px] leading-relaxed text-muted-foreground/65">
                    {description}
                  </CardDescription>
                ) : null}
              </div>
              {headerAction}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {children}
      </CardContent>
    </Card>
  );
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

function ApiTokensCard() {
  const [tokens, setTokens] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [createError, setCreateError] = useState(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    listApiTokens().then(setTokens).catch((e) => setLoadError(e.message));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!label.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createApiToken(label.trim(), ["actual:write"]);
      setNewToken({ token: res.token, label: res.label });
      setLabel("");
      const list = await listApiTokens();
      setTokens(list);
    } catch (err) {
      setCreateError(err.message || "Failed to create token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id) {
    if (!await confirm("Revoke this token? Any device using it will stop working immediately.")) return;
    setBusyId(id);
    try {
      await revokeApiToken(id);
      setTokens((ts) => ts.filter((t) => t.id !== id));
    } catch (err) {
      console.error("Revoke failed:", err);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(newToken.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked — user can long-press to copy from the input
    }
  }

  function fmtDate(ms) {
    if (!ms) return "never";
    const d = new Date(Number(ms));
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  return (
    <>
      <SettingsCard
        title="API Tokens"
        icon={<KeyRound size={14} />}
        description="Bearer tokens for mobile shortcuts and other personal automation. Tokens are shown once at creation."
      >
        <div className="flex flex-col gap-4">
          {newToken ? (
            <div className="rounded-xl border border-[#f9e2af]/20 bg-[#f9e2af]/10 p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <StatusPill tone="warning">Copy now</StatusPill>
                <span className="text-[11px] text-muted-foreground/70">Label: {newToken.label}</span>
              </div>
              <div className="mb-3 rounded-lg border border-black/10 bg-black/30 px-3 py-2 font-mono text-xs break-all select-all">
                {newToken.token}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleCopy}
                  variant="secondary"
                  className={SETTINGS_SECONDARY_BUTTON_CLASS}
                >
                  <Copy size={12} />
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className={SETTINGS_GHOST_BUTTON_CLASS}
                  onClick={() => setNewToken(null)}
                >
                  I&apos;ve saved it
                </Button>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <SectionLabel>New token label</SectionLabel>
              <Input
                type="text"
                placeholder="iPhone Shortcuts"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (createError) setCreateError(null);
                }}
                disabled={creating}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className={SETTINGS_PRIMARY_BUTTON_CLASS}
              disabled={!label.trim() || creating}
            >
              {creating ? "Creating…" : "Create"}
            </Button>
          </form>

          {createError ? (
            <FieldHint className="text-danger">{createError}</FieldHint>
          ) : null}

          {loadError ? (
            <FieldHint className="text-danger">Failed to load tokens: {loadError}</FieldHint>
          ) : tokens === null ? (
            <FieldHint>Loading…</FieldHint>
          ) : tokens.length === 0 ? (
            <div className="rounded-lg border border-dashed border-white/[0.1] px-3 py-3 text-[12px] text-muted-foreground/60">
              No tokens yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {tokens.map((t) => (
                <div key={t.id} className={cn(SURFACE_ROW_CLASS, "flex items-center gap-3 px-3 py-3")}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-foreground/90">{t.label}</span>
                      <StatusPill tone="neutral" className="shrink-0">
                        {t.scopes.join(", ") || "no scopes"}
                      </StatusPill>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted-foreground/65">
                      <span>Created {fmtDate(t.created_at)}</span>
                      <span>Last used {fmtDate(t.last_used_at)}</span>
                    </div>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="destructive"
                    className="border border-destructive/20 bg-destructive/10"
                    onClick={() => handleRevoke(t.id)}
                    disabled={busyId === t.id}
                    title="Revoke token"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </SettingsCard>
      {confirmDialog}
    </>
  );
}

const TABS = [
  { id: "accounts", label: "Accounts & Integrations" },
  { id: "briefing", label: "Briefing" },
  { id: "system", label: "System" },
];

function readTabFromURL() {
  try {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return TABS.some((t) => t.id === tab) ? tab : "accounts";
  } catch {
    return "accounts";
  }
}

function writeTabToURL(tab) {
  const url = new URL(window.location.href);
  if (tab === "accounts") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url.toString());
}

export default function Settings() {
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(readTabFromURL);

  const [icloudForm, setIcloudForm] = useState({ email: "", password: "", show: false });
  const [icloudError, setIcloudError] = useState(null);
  const [actualForm, setActualForm] = useState({ serverUrl: "", password: "", syncId: "" });
  const [actualConfigured, setActualConfigured] = useState(false);
  const [actualDirty, setActualDirty] = useState(false);
  const [actualSavingSecret, setActualSavingSecret] = useState(false);
  const [todoistToken, setTodoistToken] = useState("");
  const [todoistConfigured, setTodoistConfigured] = useState(false);
  const [todoistDirty, setTodoistDirty] = useState(false);
  const [todoistSavingSecret, setTodoistSavingSecret] = useState(false);
  const [weatherForm, setWeatherForm] = useState({
    location: "",
    lat: "",
    lng: "",
    geocoding: false,
    results: null,
  });
  const [testStatus, setTestStatus] = useState(null);
  const [testMsg, setTestMsg] = useState(null);

  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  const [importantSenders, setImportantSenders] = useState([]);
  const [senderSaving, setSenderSaving] = useState(false);

  const [editingTimeIdx, setEditingTimeIdx] = useState(null);
  const frozenOrderRef = useRef(null);
  const schedContainerRef = useRef(null);
  const schedRectsRef = useRef({});
  const prevSortOrderRef = useRef(null);
  const shouldAnimateRef = useRef(false);

  const { patch, status: saveStatus } = useSettingsAutoSave();

  useEffect(() => { writeTabToURL(tab); }, [tab]);

  useEffect(() => {
    Promise.all([getAccounts(), getSettings()])
      .then(([acc, sett]) => {
        setAccounts(acc.accounts || acc);
        setSettings(sett);
        if (sett.weather_location) {
          setWeatherForm({
            location: sett.weather_location || "",
            lat: sett.weather_lat?.toString() || "",
            lng: sett.weather_lng?.toString() || "",
            geocoding: false,
            results: null,
          });
        }
        if (sett.actual_budget_url || sett.actual_budget_sync_id || sett.actual_budget_configured) {
          setActualForm({
            serverUrl: sett.actual_budget_url || "",
            password: "",
            syncId: sett.actual_budget_sync_id || "",
          });
          setActualConfigured(!!(sett.actual_budget_url || sett.actual_budget_configured));
        }
        if (sett.todoist_configured) setTodoistConfigured(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    getImportantSenders().then((s) => setImportantSenders(s || [])).catch(() => {});
  }, []);

  const ensureModelsLoaded = useCallback(() => {
    if (models.length > 0 || modelsLoading) return;
    setModelsLoading(true);
    getModels().then(setModels).catch(() => {}).finally(() => setModelsLoading(false));
  }, [models.length, modelsLoading]);

  async function handleAddGmail() {
    const { url } = await getGmailAuthUrl();
    window.location.href = url;
  }

  async function handleAddICloud() {
    try {
      setIcloudError(null);
      await addICloudAccount(icloudForm.email, icloudForm.password);
      const acc = await getAccounts();
      setAccounts(acc.accounts || acc);
      setIcloudForm({ email: "", password: "", show: false });
    } catch (err) {
      setIcloudError(err.message || "Failed to add iCloud account");
    }
  }

  async function handleRemoveAccount(id) {
    try {
      await removeAccount(id);
      setAccounts((curr) => curr.filter((a) => a.id !== id));
    } catch (err) {
      console.error("Remove account failed:", err);
    }
  }

  async function handleGeocode() {
    if (!weatherForm.location) return;
    setWeatherForm((f) => ({ ...f, geocoding: true, results: null }));
    try {
      const results = await geocodeLocation(weatherForm.location);
      if (results.length === 1) {
        selectLocation(results[0]);
      } else {
        setWeatherForm((f) => ({ ...f, geocoding: false, results }));
      }
    } catch {
      setWeatherForm((f) => ({ ...f, geocoding: false }));
    }
  }

  function selectLocation(loc) {
    setWeatherForm({
      location: loc.name,
      lat: loc.lat.toString(),
      lng: loc.lng.toString(),
      geocoding: false,
      results: null,
    });
    patch({ weather_location: loc.name, weather_lat: loc.lat, weather_lng: loc.lng });
  }

  async function handleSaveActualSecret() {
    setActualSavingSecret(true);
    try {
      const payload = {
        actual_budget_url: actualForm.serverUrl,
        actual_budget_sync_id: actualForm.syncId,
      };
      if (actualForm.password) payload.actual_budget_password = actualForm.password;
      await updateSettings(payload);
      sessionStorage.setItem("ea_settings_changed", "1");
      setActualConfigured(true);
      setActualDirty(false);
      setActualForm((f) => ({ ...f, password: "" }));
    } finally {
      setActualSavingSecret(false);
    }
  }

  async function handleSaveTodoistSecret() {
    setTodoistSavingSecret(true);
    try {
      await updateSettings({ todoist_api_token: todoistToken });
      sessionStorage.setItem("ea_settings_changed", "1");
      setTodoistConfigured(true);
      setTodoistDirty(false);
      setTodoistToken("");
    } finally {
      setTodoistSavingSecret(false);
    }
  }

  async function handleTestActual() {
    setTestStatus("testing");
    setTestMsg(null);
    try {
      const overrides = actualDirty
        ? {
            serverURL: actualForm.serverUrl,
            password: actualForm.password || undefined,
            syncId: actualForm.syncId,
          }
        : undefined;
      const result = await testActualBudget(overrides);
      setTestStatus(result.success ? "ok" : "fail");
      if (!result.success && result.message) setTestMsg(result.message);
    } catch (err) {
      setTestStatus("fail");
      setTestMsg(err.message || "Connection failed");
    }
  }

  const selectedModel = settings?.claude_model || "claude-haiku-4-5-20251001";
  const fallbackModelOption = {
    id: selectedModel,
    name: models.find((m) => m.id === selectedModel)?.name || selectedModel,
  };
  const modelOptions = models.length > 0 ? models : [fallbackModelOption];

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
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground/65">
                Manage the accounts, automation, and AI behavior that power your daily dashboard.
              </p>
            </div>
            <div className="shrink-0">
              <SaveStatus status={saveStatus} />
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
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-[13px] font-medium whitespace-nowrap transition-all cursor-pointer",
                      tab === t.id
                        ? "border-primary/20 bg-primary/[0.12] text-primary shadow-[0_0_8px_rgba(203,166,218,0.18)]"
                        : "border-transparent text-muted-foreground hover:border-white/[0.06] hover:bg-white/[0.03] hover:text-foreground"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </nav>

          <div className="min-w-0">
            {loading ? (
              <>
                <SkeletonCard lines={3} />
                <SkeletonCard lines={2} />
                <SkeletonCard lines={2} />
              </>
            ) : (
              <>
                {tab === "accounts" && (
                  <>
                    <SettingsCard
                      title="Connected Accounts"
                      icon={<Mail size={14} />}
                      description="Inbox and calendar connections that feed the dashboard and briefing pipeline."
                    >
                      <div className="flex flex-col gap-4">
                        {accounts.length > 0 ? (
                          <Suspense fallback={<FieldHint>Loading connected accounts…</FieldHint>}>
                            <AccountsList
                              accounts={accounts}
                              setAccounts={setAccounts}
                              onRemove={handleRemoveAccount}
                            />
                          </Suspense>
                        ) : (
                          <div className="rounded-lg border border-dashed border-white/[0.1] px-3 py-3 text-[12px] text-muted-foreground/60">
                            No accounts connected yet.
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button onClick={handleAddGmail} className={SETTINGS_PRIMARY_BUTTON_CLASS}>
                            Add Gmail
                          </Button>
                          <Button
                            variant="outline"
                            className={cn(
                              SETTINGS_SECONDARY_BUTTON_CLASS,
                              icloudForm.show && "border-primary/18 bg-primary/[0.08] text-primary"
                            )}
                            onClick={() => {
                              setIcloudForm((f) => ({ ...f, show: !f.show }));
                              setIcloudError(null);
                            }}
                          >
                            {icloudForm.show ? "Cancel" : "Add iCloud"}
                          </Button>
                        </div>

                        {icloudForm.show ? (
                          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                            <div className="mb-3 flex items-center gap-2">
                              <StatusPill tone="neutral">iCloud IMAP</StatusPill>
                              <span className="text-[11px] text-muted-foreground/60">
                                Use an app-specific password from Apple ID settings.
                              </span>
                            </div>
                            <div className="flex flex-col gap-3">
                              <div>
                                <SectionLabel>iCloud email</SectionLabel>
                                <Input
                                  type="email"
                                  placeholder="name@icloud.com"
                                  value={icloudForm.email}
                                  onChange={(e) => {
                                    setIcloudError(null);
                                    setIcloudForm((f) => ({ ...f, email: e.target.value }));
                                  }}
                                />
                              </div>
                              <div>
                                <SectionLabel>App-specific password</SectionLabel>
                                <Input
                                  type="password"
                                  placeholder="App-specific password"
                                  value={icloudForm.password}
                                  onChange={(e) => {
                                    setIcloudError(null);
                                    setIcloudForm((f) => ({ ...f, password: e.target.value }));
                                  }}
                                />
                              </div>
                              {icloudError ? (
                                <FieldHint className="text-danger">{icloudError}</FieldHint>
                              ) : null}
                              <Button
                                onClick={handleAddICloud}
                                className={cn(SETTINGS_PRIMARY_BUTTON_CLASS, "self-start")}
                              >
                                Connect iCloud
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </SettingsCard>

                    <SettingsCard
                      title="Actual Budget"
                      icon={<SiActualbudget size={14} title="" aria-hidden="true" />}
                      description="Connect the Actual server used for finance sync and transaction actions."
                    >
                      <div className="flex flex-col gap-4">
                        <div>
                          <SectionLabel>Server URL</SectionLabel>
                          <Input
                            type="url"
                            placeholder="https://actual.yourdomain.com"
                            value={actualForm.serverUrl}
                            onChange={(e) => {
                              setActualForm((f) => ({ ...f, serverUrl: e.target.value }));
                              setActualDirty(true);
                            }}
                          />
                        </div>
                        <div>
                          <SectionLabel>Password</SectionLabel>
                          <Input
                            type="password"
                            placeholder={
                              actualConfigured && !actualDirty
                                ? "••••••••  (saved)"
                                : "Actual Budget password"
                            }
                            value={actualForm.password}
                            onChange={(e) => {
                              setActualForm((f) => ({ ...f, password: e.target.value }));
                              setActualDirty(true);
                            }}
                          />
                        </div>
                        <div>
                          <SectionLabel>Sync ID</SectionLabel>
                          <Input
                            type="text"
                            placeholder="Budget sync ID"
                            value={actualForm.syncId}
                            onChange={(e) => {
                              setActualForm((f) => ({ ...f, syncId: e.target.value }));
                              setActualDirty(true);
                            }}
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            onClick={handleSaveActualSecret}
                            className={SETTINGS_PRIMARY_BUTTON_CLASS}
                            disabled={!actualDirty || actualSavingSecret}
                            size="sm"
                          >
                            {actualSavingSecret ? "Saving…" : "Save"}
                          </Button>
                          <Button
                            variant="secondary"
                            className={SETTINGS_SECONDARY_BUTTON_CLASS}
                            size="sm"
                            onClick={handleTestActual}
                            disabled={testStatus === "testing"}
                          >
                            {testStatus === "testing" ? "Testing…" : "Test Connection"}
                          </Button>
                          {testStatus && testStatus !== "testing" ? (
                            <StatusPill tone={testStatus === "ok" ? "success" : "danger"}>
                              {testStatus === "ok" ? "Connected" : `Failed${testMsg ? `: ${testMsg}` : ""}`}
                            </StatusPill>
                          ) : actualConfigured && !actualDirty ? (
                            <StatusPill tone="success">Configured</StatusPill>
                          ) : null}
                        </div>
                      </div>
                    </SettingsCard>

                    <SettingsCard
                      title="Todoist"
                      icon={<SiTodoist size={14} title="" aria-hidden="true" />}
                      description="Optional task sync used when briefings create Todoist follow-ups."
                    >
                      <div className="flex flex-col gap-4">
                        <div>
                          <SectionLabel>API Token</SectionLabel>
                          <Input
                            type="password"
                            placeholder={
                              todoistConfigured && !todoistDirty
                                ? "••••••••  (saved)"
                                : "Todoist API token"
                            }
                            value={todoistToken}
                            onChange={(e) => {
                              setTodoistToken(e.target.value);
                              setTodoistDirty(true);
                            }}
                          />
                          <FieldHint className="mt-1">
                            Find your token at Settings &gt; Integrations &gt; Developer in Todoist.
                          </FieldHint>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            onClick={handleSaveTodoistSecret}
                            className={SETTINGS_PRIMARY_BUTTON_CLASS}
                            disabled={!todoistDirty || todoistSavingSecret}
                            size="sm"
                          >
                            {todoistSavingSecret ? "Saving…" : "Save"}
                          </Button>
                          {todoistConfigured && !todoistDirty ? (
                            <>
                              <StatusPill tone="success">Connected</StatusPill>
                              <button
                                type="button"
                                onClick={() => {
                                  setTodoistToken("");
                                  setTodoistDirty(true);
                                  setTodoistConfigured(false);
                                }}
                                className="text-[11px] font-medium text-muted-foreground/55 transition-colors hover:text-danger"
                              >
                                Disconnect
                              </button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </SettingsCard>

                    <SettingsCard
                      title="Weather Location"
                      icon={<MapPin size={14} />}
                      description="Set the location used for dashboard weather snapshots and daily briefing context."
                    >
                      <div className="flex flex-col gap-4">
                        <div>
                          <SectionLabel>City name</SectionLabel>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              type="text"
                              placeholder="El Monte, CA"
                              value={weatherForm.location}
                              onChange={(e) => setWeatherForm((f) => ({ ...f, location: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleGeocode();
                              }}
                              className="flex-1"
                            />
                            <Button
                              variant="secondary"
                              className={cn(SETTINGS_SECONDARY_BUTTON_CLASS, "whitespace-nowrap")}
                              onClick={handleGeocode}
                              disabled={weatherForm.geocoding || !weatherForm.location}
                            >
                              {weatherForm.geocoding ? "Looking up…" : "Look up"}
                            </Button>
                          </div>
                        </div>
                        {weatherForm.results ? (
                          <div className="flex flex-col gap-2">
                            {weatherForm.results.map((r, i) => (
                              <button
                                key={i}
                                onClick={() => selectLocation(r)}
                                className={cn(
                                  SURFACE_ROW_CLASS,
                                  "cursor-pointer px-3 py-3 text-left"
                                )}
                              >
                                <div className="text-[13px] font-medium text-foreground/90">{r.name}</div>
                                <div className="mt-1 text-[11px] text-muted-foreground/60">
                                  {r.lat.toFixed(4)}, {r.lng.toFixed(4)}
                                </div>
                              </button>
                            ))}
                          </div>
                        ) : null}
                        {weatherForm.lat && weatherForm.lng ? (
                          <StatusPill tone="accent" className="self-start">
                            {weatherForm.lat}, {weatherForm.lng}
                          </StatusPill>
                        ) : null}
                      </div>
                    </SettingsCard>
                  </>
                )}

                {tab === "briefing" && (
                  <>
                    <SettingsCard
                      title="Claude Model"
                      icon={<Bot size={14} />}
                      description="Model used for briefing generation. Haiku is cheapest; Sonnet is more capable."
                    >
                      <Select
                        value={selectedModel}
                        onValueChange={(value) => {
                          setSettings((s) => ({ ...s, claude_model: value }));
                          patch({ claude_model: value });
                        }}
                        onOpenChange={(open) => {
                          if (open) ensureModelsLoaded();
                        }}
                      >
                        <SelectTrigger
                          className="w-full bg-input/30 hover:bg-input/50"
                          onFocus={ensureModelsLoaded}
                          onPointerDown={ensureModelsLoaded}
                          aria-label="Select Claude model"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent
                          align="start"
                          className="bg-[#16161e] shadow-[0_20px_60px_rgba(0,0,0,0.7)] ring-1 ring-white/[0.08]"
                        >
                          {modelOptions.map((m) => (
                            <SelectItem key={m.id} value={m.id} className="text-[13px]">
                              {m.name || m.id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {modelsLoading ? (
                        <FieldHint className="mt-2">Loading available models…</FieldHint>
                      ) : null}
                    </SettingsCard>

                    <SettingsCard
                      title="Email Lookback"
                      icon={<Clock size={14} />}
                      description="Controls how far back briefing generation looks when gathering email context."
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <SectionLabel className="mb-0 whitespace-nowrap">Fetch emails from the last</SectionLabel>
                        <Input
                          type="number"
                          min="1"
                          max="72"
                          value={settings?.email_lookback_hours ?? 16}
                          onChange={(e) => {
                            const v = Math.max(1, Math.min(72, parseInt(e.target.value, 10) || 16));
                            setSettings((s) => ({ ...s, email_lookback_hours: v }));
                            patch({ email_lookback_hours: v });
                          }}
                          className="w-[80px] text-center"
                          autoComplete="off"
                          data-1p-ignore
                          data-lpignore="true"
                        />
                        <span className="text-[13px] text-muted-foreground/70">hours</span>
                      </div>
                    </SettingsCard>

                    <SettingsCard
                      title="Email Interests"
                      icon={<Tag size={14} />}
                      description="Senders, brands, or keywords that should never be classified as noise."
                    >
                      <div className="flex flex-col gap-3">
                        {(settings?.email_interests || []).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(settings?.email_interests || []).map((tagVal, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.1] px-2.5 py-1 text-[11px] font-medium text-primary"
                              >
                                {tagVal}
                                <button
                                  onClick={() => {
                                    const next = settings.email_interests.filter((_, j) => j !== i);
                                    setSettings((s) => ({ ...s, email_interests: next }));
                                    patch({ email_interests_json: next });
                                  }}
                                  className="inline-flex items-center bg-transparent text-primary/60 transition-colors hover:text-primary"
                                  aria-label={`Remove ${tagVal}`}
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-white/[0.1] px-3 py-3 text-[12px] text-muted-foreground/60">
                            No interests saved yet.
                          </div>
                        )}

                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const input = e.target.elements.interest;
                            const val = input.value.trim();
                            if (!val) return;
                            const next = [...(settings?.email_interests || []), val];
                            setSettings((s) => ({ ...s, email_interests: next }));
                            input.value = "";
                            patch({ email_interests_json: next });
                          }}
                          className="flex flex-col gap-2 sm:flex-row"
                        >
                          <Input name="interest" placeholder="e.g. Da Vien, Anthropic, GitHub…" className="flex-1" />
                          <Button type="submit" size="sm" className={SETTINGS_PRIMARY_BUTTON_CLASS}>
                            Add
                          </Button>
                        </form>
                      </div>
                    </SettingsCard>

                    <SettingsCard
                      title="Important Senders"
                      icon={<BellRing size={14} />}
                      description="Send browser notifications for these senders. Auto-detected entries are learned from briefing urgency."
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2">
                          {importantSenders.map((sender, i) => (
                            <div
                              key={sender.address}
                              className={cn(
                                SURFACE_ROW_CLASS,
                                "flex items-center justify-between gap-3 px-3 py-3"
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-[13px] font-medium text-foreground/90">
                                    {sender.name || sender.address}
                                  </span>
                                  {sender.source === "auto" ? (
                                    <StatusPill tone="neutral">(auto)</StatusPill>
                                  ) : null}
                                </div>
                                <div className="mt-1 truncate text-[11px] text-muted-foreground/55">
                                  {sender.address}
                                </div>
                              </div>
                              <button
                                className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-white/[0.04] hover:text-danger"
                                onClick={async () => {
                                  const next = importantSenders.filter((_, j) => j !== i);
                                  setImportantSenders(next);
                                  setSenderSaving(true);
                                  await updateImportantSenders(next).catch(() => {});
                                  setSenderSaving(false);
                                }}
                                title="Remove"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ))}

                          {importantSenders.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-white/[0.1] px-3 py-3 text-[12px] italic text-muted-foreground/55">
                              No important senders yet. Add one below or let future briefings learn them automatically.
                            </div>
                          ) : null}
                        </div>

                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const input = e.target.elements.senderEmail;
                            const address = input.value.trim().toLowerCase();
                            if (!address) return;
                            if (importantSenders.some((s) => s.address === address)) {
                              input.value = "";
                              return;
                            }
                            const next = [
                              ...importantSenders,
                              { address, name: address.split("@")[0], source: "manual" },
                            ];
                            setImportantSenders(next);
                            input.value = "";
                            setSenderSaving(true);
                            await updateImportantSenders(next).catch(() => {});
                            setSenderSaving(false);
                          }}
                          className="flex flex-col gap-2 sm:flex-row"
                        >
                          <Input name="senderEmail" placeholder="e.g. boss@company.com" className="flex-1" />
                          <Button
                            type="submit"
                            size="sm"
                            className={SETTINGS_PRIMARY_BUTTON_CLASS}
                            disabled={senderSaving}
                          >
                            {senderSaving ? "Saving…" : "Add"}
                          </Button>
                        </form>
                      </div>
                    </SettingsCard>

                    <SettingsCard
                      title="Briefing Schedules"
                      icon={<CalendarClock size={14} />}
                      description="Daily schedule entries that trigger automatic briefing generation."
                    >
                      <div ref={schedContainerRef} className="flex flex-col gap-3">
                        {(() => {
                          const items = [...(settings?.schedules || [])].map((s, i) => ({ ...s, _oi: i }));
                          const sorted = [...items].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
                          const sortOrder = sorted.map((s) => s._oi).join(",");
                          if (editingTimeIdx !== null) {
                            if (!frozenOrderRef.current) frozenOrderRef.current = sortOrder;
                            const frozen = frozenOrderRef.current.split(",").map(Number);
                            return frozen.map((oi) => items.find((s) => s._oi === oi)).filter(Boolean);
                          }
                          if (prevSortOrderRef.current && prevSortOrderRef.current !== sortOrder) {
                            shouldAnimateRef.current = true;
                          }
                          prevSortOrderRef.current = sortOrder;
                          frozenOrderRef.current = null;
                          return sorted;
                        })().map((sched) => {
                          const oi = sched._oi;
                          const isSkipped = sched.skipped_until && new Date(sched.skipped_until) > new Date();
                          return (
                            <div
                              key={oi}
                              data-sched-idx={oi}
                              ref={(el) => {
                                if (!el) return;
                                const prev = schedRectsRef.current[oi];
                                if (prev !== undefined && shouldAnimateRef.current) {
                                  const curr = el.getBoundingClientRect().top;
                                  const dy = prev - curr;
                                  if (Math.abs(dy) > 1) {
                                    el.style.transition = "none";
                                    el.style.transform = `translateY(${dy}px)`;
                                    requestAnimationFrame(() => {
                                      el.style.transition = "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)";
                                      el.style.transform = "";
                                      shouldAnimateRef.current = false;
                                    });
                                  }
                                }
                                schedRectsRef.current[oi] = el.getBoundingClientRect().top;
                              }}
                              className={cn(
                                SURFACE_ROW_CLASS,
                                "flex flex-col gap-3 p-3"
                              )}
                            >
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <input
                                  type="text"
                                  value={sched.label || ""}
                                  placeholder="Label"
                                  onChange={(e) => {
                                    const updated = [...settings.schedules];
                                    updated[oi] = { ...updated[oi], label: e.target.value };
                                    setSettings((s) => ({ ...s, schedules: updated }));
                                  }}
                                  onBlur={() => patch({ schedules_json: settings.schedules })}
                                  className="min-w-0 flex-1 bg-transparent p-0 text-[13px] font-medium text-foreground outline-none"
                                />
                                <button
                                  onClick={() => {
                                    if (schedContainerRef.current) {
                                      schedContainerRef.current
                                        .querySelectorAll("[data-sched-idx]")
                                        .forEach((el) => {
                                          schedRectsRef.current[el.dataset.schedIdx] = el.getBoundingClientRect().top;
                                        });
                                    }
                                    const updated = settings.schedules.filter((_, j) => j !== oi);
                                    setSettings((s) => ({ ...s, schedules: updated }));
                                    patch({ schedules_json: updated });
                                  }}
                                  className="inline-flex min-h-[32px] min-w-[32px] shrink-0 items-center justify-center rounded-md text-muted-foreground/45 transition-colors hover:bg-white/[0.04] hover:text-danger"
                                  aria-label="Remove schedule"
                                >
                                  <X size={14} />
                                </button>
                              </div>

                              <div className="flex flex-wrap items-center gap-3">
                                <input
                                  type="time"
                                  value={sched.time || "08:00"}
                                  onFocus={() => setEditingTimeIdx(oi)}
                                  onBlur={() => {
                                    if (schedContainerRef.current) {
                                      schedContainerRef.current
                                        .querySelectorAll("[data-sched-idx]")
                                        .forEach((el) => {
                                          schedRectsRef.current[el.dataset.schedIdx] = el.getBoundingClientRect().top;
                                        });
                                    }
                                    patch({ schedules_json: settings.schedules });
                                    setEditingTimeIdx(null);
                                  }}
                                  onChange={(e) => {
                                    const updated = [...settings.schedules];
                                    updated[oi] = { ...updated[oi], time: e.target.value };
                                    setSettings((s) => ({ ...s, schedules: updated }));
                                  }}
                                  className="h-8 rounded-md border border-white/[0.08] bg-transparent px-2.5 text-xs text-muted-foreground/75 [color-scheme:dark]"
                                />
                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={!!sched.enabled}
                                    onCheckedChange={() => {
                                      const updated = [...settings.schedules];
                                      updated[oi] = { ...updated[oi], enabled: !updated[oi].enabled };
                                      setSettings((s) => ({ ...s, schedules: updated }));
                                      patch({ schedules_json: updated });
                                    }}
                                    aria-label={sched.enabled ? "Disable schedule" : "Enable schedule"}
                                  />
                                  <span className="min-w-[52px] text-[11px] text-muted-foreground/60">
                                    {sched.enabled ? "Enabled" : "Disabled"}
                                  </span>
                                </div>
                                {sched.enabled ? (
                                  <Button
                                    variant="secondary"
                                    className={SETTINGS_SECONDARY_BUTTON_CLASS}
                                    size="xs"
                                    onClick={async () => {
                                      const result = await skipSchedule(oi, !isSkipped);
                                      if (result.schedules) setSettings((s) => ({ ...s, schedules: result.schedules }));
                                    }}
                                  >
                                    {isSkipped ? "Skipped" : "Skip Today"}
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}

                        <button
                          onClick={() => {
                            const updated = [
                              ...(settings?.schedules || []),
                              { label: "New Schedule", time: "08:00", enabled: false },
                            ];
                            setSettings((s) => ({ ...s, schedules: updated }));
                            patch({ schedules_json: updated });
                          }}
                          className="rounded-lg border border-dashed border-white/[0.1] bg-transparent px-3.5 py-2 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:border-white/[0.2] hover:text-foreground"
                        >
                          + Add Schedule
                        </button>
                      </div>
                    </SettingsCard>
                  </>
                )}

                {tab === "system" && (
                  <>
                    <SettingsCard
                      title="Search & Historical Context"
                      icon={<Database size={14} />}
                      description="Embeddings power historical retrieval for trends, repeated senders, and recurring briefing context."
                    >
                      <div className="flex flex-col gap-2">
                        <div className={cn(SURFACE_ROW_CLASS, "flex items-center justify-between gap-3 px-3 py-3")}>
                          <div className="text-[13px] text-foreground/85">OpenAI embeddings</div>
                          {settings?.openai_available ? (
                            <StatusPill tone="success">Connected</StatusPill>
                          ) : (
                            <StatusPill tone="warning">Set OPENAI_API_KEY</StatusPill>
                          )}
                        </div>
                        <div className={cn(SURFACE_ROW_CLASS, "flex items-center justify-between gap-3 px-3 py-3")}>
                          <div className="text-[13px] text-foreground/85">Indexed chunks</div>
                          <StatusPill tone={(settings?.embedding_count ?? 0) > 0 ? "success" : "neutral"}>
                            {settings?.embedding_count ?? 0}
                          </StatusPill>
                        </div>
                      </div>
                    </SettingsCard>

                    <ApiTokensCard />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
