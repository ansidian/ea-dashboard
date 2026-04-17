import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { X, ChevronLeft, ChevronDown, Mail, Cloud, Bot, Clock, Tag, BellRing, CalendarClock, MapPin, Database, Check, Loader2, AlertCircle, KeyRound, Copy, Trash2 } from "lucide-react";
import { SiActualbudget, SiTodoist } from "@icons-pack/react-simple-icons";
import {
  getAccounts, getSettings, updateSettings,
  getGmailAuthUrl, addICloudAccount, removeAccount,
  testActualBudget, geocodeLocation, getModels, skipSchedule,
  getImportantSenders, updateImportantSenders,
  listApiTokens, createApiToken, revokeApiToken,
} from "../api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AccountsList = lazy(() => import("../components/settings/AccountsList"));

// --- Auto-save hook ---
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
      statusTimerRef.current = setTimeout(() => setStatus(s => (s === "saved" ? "idle" : s)), 1500);
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

// --- Save status indicator ---
function SaveStatus({ status }) {
  if (status === "idle") return <span className="text-[11px] text-muted-foreground/0 select-none">Saved</span>;
  if (status === "saving") return <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/70"><Loader2 size={11} className="animate-spin" />Saving…</span>;
  if (status === "saved") return <span className="inline-flex items-center gap-1 text-[11px] text-success"><Check size={11} />Saved</span>;
  if (status === "error") return <span className="inline-flex items-center gap-1 text-[11px] text-danger"><AlertCircle size={11} />Save failed</span>;
  return null;
}

// --- Card wrapper ---
function SettingsCard({ title, icon, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 px-5 mb-5">
      <h3 className="inline-flex items-center gap-2 text-[11px] max-sm:text-xs tracking-[2.5px] uppercase text-muted-foreground font-semibold mb-3">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  );
}

// --- API Tokens card (for iOS Shortcuts etc.) ---
function ApiTokensCard() {
  const [tokens, setTokens] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState(null); // { token, label } — shown once
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    listApiTokens().then(setTokens).catch(e => setLoadError(e.message));
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!label.trim() || creating) return;
    setCreating(true);
    try {
      const res = await createApiToken(label.trim(), ["actual:write"]);
      setNewToken({ token: res.token, label: res.label });
      setLabel("");
      const list = await listApiTokens();
      setTokens(list);
    } catch (err) {
      alert(err.message || "Failed to create token");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id) {
    if (!confirm("Revoke this token? Any device using it will stop working immediately.")) return;
    setBusyId(id);
    try {
      await revokeApiToken(id);
      setTokens(ts => ts.filter(t => t.id !== id));
    } catch (err) {
      alert(err.message || "Failed to revoke token");
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
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <SettingsCard title="API Tokens" icon={<KeyRound size={12} />}>
      <div className="text-xs text-muted-foreground/70 leading-relaxed mb-3">
        Bearer tokens for mobile shortcuts (e.g. Apple Shortcuts posting Tap-to-Pay transactions to Actual Budget).
        Tokens are shown once at creation — copy them immediately.
      </div>

      {newToken ? (
        <div className="bg-warning/10 border border-warning/40 rounded-lg p-3 px-4 mb-3">
          <div className="text-[11px] tracking-[1.5px] uppercase text-warning font-semibold mb-2">
            Copy now — you won't see this again
          </div>
          <div className="font-mono text-xs break-all bg-black/30 rounded-md p-2 px-3 mb-2 select-all">
            {newToken.token}
          </div>
          <div className="flex gap-2 items-center">
            <Button size="sm" onClick={handleCopy} variant="secondary">
              <Copy size={12} className="mr-1" />
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNewToken(null)}>
              I've saved it
            </Button>
            <span className="text-[11px] text-muted-foreground/70 ml-auto">Label: {newToken.label}</span>
          </div>
        </div>
      ) : null}

      <form onSubmit={handleCreate} className="flex gap-2 items-end mb-4">
        <div className="flex-1">
          <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">
            New token label
          </label>
          <Input
            type="text"
            placeholder="iPhone Shortcuts"
            value={label}
            onChange={e => setLabel(e.target.value)}
            disabled={creating}
          />
        </div>
        <Button type="submit" size="sm" disabled={!label.trim() || creating}>
          {creating ? "Creating…" : "Create"}
        </Button>
      </form>

      {loadError ? (
        <div className="text-xs text-danger">Failed to load tokens: {loadError}</div>
      ) : tokens === null ? (
        <div className="text-xs text-muted-foreground/70">Loading…</div>
      ) : tokens.length === 0 ? (
        <div className="text-xs text-muted-foreground/70">No tokens yet.</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {tokens.map(t => (
            <div key={t.id} className="flex items-center gap-3 bg-white/[0.02] border border-border rounded-lg p-2.5 px-3">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] truncate">{t.label}</div>
                <div className="text-[11px] text-muted-foreground/70 flex gap-2 flex-wrap">
                  <span>{t.scopes.join(", ") || "no scopes"}</span>
                  <span>·</span>
                  <span>created {fmtDate(t.created_at)}</span>
                  <span>·</span>
                  <span>last used {fmtDate(t.last_used_at)}</span>
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleRevoke(t.id)}
                disabled={busyId === t.id}
                title="Revoke"
              >
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

// --- Skeleton card ---
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

// --- Tabs ---
const TABS = [
  { id: "accounts", label: "Accounts & Integrations" },
  { id: "briefing", label: "Briefing" },
  { id: "system", label: "System" },
];

function readTabFromURL() {
  try {
    const tab = new URLSearchParams(window.location.search).get("tab");
    return TABS.some(t => t.id === tab) ? tab : "accounts";
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

// --- Main ---
export default function Settings() {
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(readTabFromURL);

  const [icloudForm, setIcloudForm] = useState({ email: "", password: "", show: false });
  const [actualForm, setActualForm] = useState({ serverUrl: "", password: "", syncId: "" });
  const [actualConfigured, setActualConfigured] = useState(false);
  const [actualDirty, setActualDirty] = useState(false);
  const [actualSavingSecret, setActualSavingSecret] = useState(false);
  const [todoistToken, setTodoistToken] = useState("");
  const [todoistConfigured, setTodoistConfigured] = useState(false);
  const [todoistDirty, setTodoistDirty] = useState(false);
  const [todoistSavingSecret, setTodoistSavingSecret] = useState(false);
  const [weatherForm, setWeatherForm] = useState({ location: "", lat: "", lng: "", geocoding: false, results: null });
  const [testStatus, setTestStatus] = useState(null);
  const [testMsg, setTestMsg] = useState(null);

  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef(null);

  const [importantSenders, setImportantSenders] = useState([]);
  const [senderSaving, setSenderSaving] = useState(false);

  // Schedules FLIP animation refs
  const [editingTimeIdx, setEditingTimeIdx] = useState(null);
  const frozenOrderRef = useRef(null);
  const schedContainerRef = useRef(null);
  const schedRectsRef = useRef({});
  const prevSortOrderRef = useRef(null);
  const shouldAnimateRef = useRef(false);

  const { patch, status: saveStatus } = useSettingsAutoSave();

  useEffect(() => { writeTabToURL(tab); }, [tab]);

  // Critical path: only accounts + settings. Senders deferred; models defer to dropdown open.
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

    // Defer important senders — not critical path
    getImportantSenders().then(s => setImportantSenders(s || [])).catch(() => {});
  }, []);

  // Model dropdown outside click
  useEffect(() => {
    if (!modelDropdownOpen) return;
    const handler = (e) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modelDropdownOpen]);

  // --- Handlers ---
  async function handleAddGmail() {
    const { url } = await getGmailAuthUrl();
    window.location.href = url;
  }

  async function handleAddICloud() {
    try {
      await addICloudAccount(icloudForm.email, icloudForm.password);
      const acc = await getAccounts();
      setAccounts(acc.accounts || acc);
      setIcloudForm({ email: "", password: "", show: false });
    } catch (err) {
      alert("Failed to add iCloud account: " + err.message);
    }
  }

  async function handleRemoveAccount(id) {
    if (!confirm("Remove this account?")) return;
    await removeAccount(id);
    setAccounts(accounts.filter(a => a.id !== id));
  }

  async function handleGeocode() {
    if (!weatherForm.location) return;
    setWeatherForm(f => ({ ...f, geocoding: true, results: null }));
    try {
      const results = await geocodeLocation(weatherForm.location);
      if (results.length === 1) {
        selectLocation(results[0]);
      } else {
        setWeatherForm(f => ({ ...f, geocoding: false, results }));
      }
    } catch {
      setWeatherForm(f => ({ ...f, geocoding: false }));
    }
  }

  function selectLocation(loc) {
    setWeatherForm({
      location: loc.name, lat: loc.lat.toString(), lng: loc.lng.toString(),
      geocoding: false, results: null,
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
      setActualForm(f => ({ ...f, password: "" }));
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
        ? { serverURL: actualForm.serverUrl, password: actualForm.password || undefined, syncId: actualForm.syncId }
        : undefined;
      const result = await testActualBudget(overrides);
      setTestStatus(result.success ? "ok" : "fail");
      if (!result.success && result.message) setTestMsg(result.message);
    } catch (err) {
      setTestStatus("fail");
      setTestMsg(err.message || "Connection failed");
    }
  }

  function openModelDropdown() {
    const next = !modelDropdownOpen;
    setModelDropdownOpen(next);
    if (next && models.length === 0 && !modelsLoading) {
      setModelsLoading(true);
      getModels().then(setModels).catch(() => {}).finally(() => setModelsLoading(false));
    }
  }

  // --- Shell ---
  return (
    <div className="min-h-screen text-foreground font-sans p-4 sm:p-6 max-w-[1100px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[13px] font-medium text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground transition-colors no-underline">
          <ChevronLeft size={14} />
          Dashboard
        </Link>
        <h1 className="font-serif text-[28px] font-normal m-0 text-foreground">Settings</h1>
        <div className="ml-auto"><SaveStatus status={saveStatus} /></div>
      </div>

      <div className="flex gap-6 max-md:flex-col">
        {/* Sidebar */}
        <nav className="md:w-[200px] md:shrink-0 md:sticky md:top-6 md:self-start">
          <div className="flex md:flex-col gap-1 max-md:overflow-x-auto max-md:pb-2 max-md:-mx-4 max-md:px-4">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} className={cn(
                "text-left text-[13px] px-3 py-2 rounded-lg transition-colors cursor-pointer whitespace-nowrap",
                tab === t.id
                  ? "bg-primary/[0.1] text-primary"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              )}>
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
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
                  <SettingsCard title="Connected Accounts" icon={<Mail size={12} />}>
                    {accounts.length > 0 ? (
                      <Suspense fallback={<div className="text-[11px] text-muted-foreground/50">Loading…</div>}>
                        <AccountsList accounts={accounts} setAccounts={setAccounts} onRemove={handleRemoveAccount} />
                      </Suspense>
                    ) : (
                      <p className="text-[13px] text-muted-foreground mb-4">No accounts connected yet.</p>
                    )}
                    <div className="flex gap-2 flex-wrap mt-4">
                      <Button onClick={handleAddGmail}>Add Gmail</Button>
                      <Button className="bg-[#a6d4c8] text-[#1e1e2e] hover:bg-[#b3ddd2]" onClick={() => setIcloudForm(f => ({ ...f, show: !f.show }))}>
                        {icloudForm.show ? "Cancel" : "Add iCloud"}
                      </Button>
                    </div>
                    {icloudForm.show && (
                      <div className="mt-4 flex flex-col gap-3">
                        <Input type="email" placeholder="iCloud email" value={icloudForm.email} onChange={e => setIcloudForm(f => ({ ...f, email: e.target.value }))} />
                        <Input type="password" placeholder="App-specific password" value={icloudForm.password} onChange={e => setIcloudForm(f => ({ ...f, password: e.target.value }))} />
                        <Button onClick={handleAddICloud} className="self-start">Connect iCloud</Button>
                      </div>
                    )}
                  </SettingsCard>

                  <SettingsCard title="Actual Budget" icon={<SiActualbudget size={12} title="" aria-hidden="true" />}>
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Server URL</label>
                        <Input type="url" placeholder="https://actual.yourdomain.com" value={actualForm.serverUrl} onChange={e => { setActualForm(f => ({ ...f, serverUrl: e.target.value })); setActualDirty(true); }} />
                      </div>
                      <div>
                        <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Password</label>
                        <Input
                          type="password"
                          placeholder={actualConfigured && !actualDirty ? "••••••••  (saved)" : "Actual Budget password"}
                          value={actualForm.password}
                          onChange={e => { setActualForm(f => ({ ...f, password: e.target.value })); setActualDirty(true); }}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Sync ID</label>
                        <Input type="text" placeholder="Budget sync ID" value={actualForm.syncId} onChange={e => { setActualForm(f => ({ ...f, syncId: e.target.value })); setActualDirty(true); }} />
                      </div>
                      <div className="flex flex-wrap gap-2 items-center mt-1">
                        <Button onClick={handleSaveActualSecret} disabled={!actualDirty || actualSavingSecret} size="sm">
                          {actualSavingSecret ? "Saving…" : "Save"}
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleTestActual} disabled={testStatus === "testing"}>
                          {testStatus === "testing" ? "Testing…" : "Test Connection"}
                        </Button>
                        {testStatus && testStatus !== "testing" ? (
                          <span className={cn("inline-flex items-center gap-1.5 text-[11px]", testStatus === "ok" ? "text-success" : "text-danger")}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", testStatus === "ok" ? "bg-success" : "bg-danger")} />
                            {testStatus === "ok" ? "Connected" : `Failed${testMsg ? `: ${testMsg}` : ""}`}
                          </span>
                        ) : actualConfigured && !actualDirty ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
                            <span className="w-1.5 h-1.5 rounded-full bg-success" />
                            Configured
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </SettingsCard>

                  <SettingsCard title="Todoist" icon={<SiTodoist size={12} title="" aria-hidden="true" />}>
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">API Token</label>
                        <Input
                          type="password"
                          placeholder={todoistConfigured && !todoistDirty ? "••••••••  (saved)" : "Todoist API token"}
                          value={todoistToken}
                          onChange={e => { setTodoistToken(e.target.value); setTodoistDirty(true); }}
                        />
                        <p className="text-[10px] text-muted-foreground/50 mt-1">
                          Find your token at Settings &gt; Integrations &gt; Developer in Todoist
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        <Button onClick={handleSaveTodoistSecret} disabled={!todoistDirty || todoistSavingSecret} size="sm">
                          {todoistSavingSecret ? "Saving…" : "Save"}
                        </Button>
                        {todoistConfigured && !todoistDirty && (
                          <>
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-success">
                              <span className="w-1.5 h-1.5 rounded-full bg-success" />
                              Connected
                            </span>
                            <button
                              type="button"
                              onClick={() => { setTodoistToken(""); setTodoistDirty(true); setTodoistConfigured(false); }}
                              className="text-[11px] text-muted-foreground/50 hover:text-danger transition-colors cursor-pointer bg-transparent border-0 p-0"
                            >
                              Disconnect
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </SettingsCard>

                  <SettingsCard title="Weather Location" icon={<MapPin size={12} />}>
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">City Name</label>
                        <div className="flex gap-2">
                          <Input type="text" placeholder="El Monte, CA" value={weatherForm.location}
                            onChange={e => setWeatherForm(f => ({ ...f, location: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") handleGeocode(); }}
                            className="flex-1" />
                          <Button variant="secondary" onClick={handleGeocode} disabled={weatherForm.geocoding || !weatherForm.location} className="whitespace-nowrap">
                            {weatherForm.geocoding ? "Looking up…" : "Look up"}
                          </Button>
                        </div>
                      </div>
                      {weatherForm.results && (
                        <div className="flex flex-col gap-1">
                          {weatherForm.results.map((r, i) => (
                            <button key={i} onClick={() => selectLocation(r)} className="bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground cursor-pointer text-left transition-colors hover:bg-white/[0.04]">
                              {r.name} <span className="text-muted-foreground text-[11px] max-sm:text-xs">({r.lat.toFixed(4)}, {r.lng.toFixed(4)})</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {weatherForm.lat && weatherForm.lng && (
                        <p className="text-[11px] max-sm:text-xs text-muted-foreground m-0">
                          Coordinates: {weatherForm.lat}, {weatherForm.lng}
                        </p>
                      )}
                    </div>
                  </SettingsCard>
                </>
              )}

              {tab === "briefing" && (
                <>
                  <SettingsCard title="Claude Model" icon={<Bot size={12} />}>
                    {(() => {
                      const selected = settings?.claude_model || "claude-haiku-4-5-20251001";
                      const selectedLabel = models.find(m => m.id === selected)?.name || selected;
                      return (
                        <div ref={modelDropdownRef} className="relative">
                          <button
                            onClick={openModelDropdown}
                            className="w-full text-left text-[13px] text-foreground bg-input-bg border border-white/[0.08] rounded-lg px-3 py-2 cursor-pointer flex justify-between items-center hover:bg-white/[0.04] transition-colors"
                            aria-label="Select Claude model"
                          >
                            <span>{modelsLoading ? "Loading models…" : selectedLabel}</span>
                            <ChevronDown size={12} className="text-muted-foreground transition-transform" style={{ transform: modelDropdownOpen ? "rotate(180deg)" : "none" }} />
                          </button>
                          {modelDropdownOpen && models.length > 0 && (
                            <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-elevated border border-white/10 rounded-lg max-h-60 max-sm:max-h-[calc(100vh-200px)] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
                              {models.map(m => (
                                <div
                                  key={m.id}
                                  onClick={() => {
                                    setSettings(s => ({ ...s, claude_model: m.id }));
                                    setModelDropdownOpen(false);
                                    patch({ claude_model: m.id });
                                  }}
                                  className={cn(
                                    "px-3 py-2 text-[13px] cursor-pointer transition-all duration-150",
                                    m.id === selected
                                      ? "text-primary bg-primary/10"
                                      : "text-foreground hover:bg-white/[0.04] hover:text-foreground hover:pl-4"
                                  )}
                                >
                                  {m.name || m.id}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <p className="text-[11px] max-sm:text-xs text-muted-foreground mt-2">
                      Model used for briefing generation. Haiku is cheapest, Sonnet is more capable.
                    </p>
                  </SettingsCard>

                  <SettingsCard title="Email Lookback" icon={<Clock size={12} />}>
                    <div className="flex items-center gap-3 max-sm:flex-wrap">
                      <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium whitespace-nowrap max-sm:whitespace-normal">Fetch emails from the last</label>
                      <Input
                        type="number" min="1" max="72"
                        value={settings?.email_lookback_hours ?? 16}
                        onChange={e => {
                          const v = Math.max(1, Math.min(72, parseInt(e.target.value) || 16));
                          setSettings(s => ({ ...s, email_lookback_hours: v }));
                          patch({ email_lookback_hours: v });
                        }}
                        className="w-[70px] text-center"
                        autoComplete="off" data-1p-ignore data-lpignore="true"
                      />
                      <span className="text-[13px] text-muted-foreground/70">hours</span>
                    </div>
                    <p className="text-[11px] max-sm:text-xs text-muted-foreground mt-2">
                      Controls how far back to look for emails during briefing generation. Default: 16 hours.
                    </p>
                  </SettingsCard>

                  <SettingsCard title="Email Interests" icon={<Tag size={12} />}>
                    <p className="text-xs text-muted-foreground/70 mb-3">
                      Senders, brands, or keywords that should never be classified as noise.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(settings?.email_interests || []).map((tagVal, i) => (
                        <span key={i} className="inline-flex items-center gap-1 bg-primary/[0.08] text-primary text-xs font-medium px-2.5 py-1 rounded-full">
                          {tagVal}
                          <button onClick={() => {
                            const next = settings.email_interests.filter((_, j) => j !== i);
                            setSettings(s => ({ ...s, email_interests: next }));
                            patch({ email_interests_json: next });
                          }} className="bg-transparent border-none text-primary/60 cursor-pointer p-0 leading-none ml-0.5 hover:text-primary inline-flex items-center" aria-label={`Remove ${tagVal}`}><X size={12} /></button>
                        </span>
                      ))}
                    </div>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const input = e.target.elements.interest;
                      const val = input.value.trim();
                      if (!val) return;
                      const next = [...(settings?.email_interests || []), val];
                      setSettings(s => ({ ...s, email_interests: next }));
                      input.value = "";
                      patch({ email_interests_json: next });
                    }} className="flex gap-2">
                      <Input name="interest" placeholder="e.g. Da Vien, Anthropic, GitHub…" className="flex-1" />
                      <Button type="submit" size="sm">Add</Button>
                    </form>
                  </SettingsCard>

                  <SettingsCard title="Important Senders" icon={<BellRing size={12} />}>
                    <p className="text-[12px] text-muted-foreground/60 mb-3 leading-relaxed">
                      Get browser notifications when emails arrive from these senders. Auto-detected senders are learned from past briefings where Claude flagged them as high urgency.
                    </p>
                    <div className="flex flex-col gap-1.5 mb-3">
                      {importantSenders.map((sender, i) => (
                        <div
                          key={sender.address}
                          className="flex items-center justify-between gap-2 rounded-lg py-2 px-3"
                          style={{ background: "rgba(36,36,58,0.4)", border: "1px solid rgba(255,255,255,0.04)" }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[13px] text-foreground/80 truncate">{sender.name || sender.address}</span>
                            <span className="text-[10px] max-sm:text-xs text-muted-foreground/40 truncate">{sender.address}</span>
                            {sender.source === "auto" && <span className="text-[9px] max-sm:text-xs text-muted-foreground/30 shrink-0">(auto)</span>}
                          </div>
                          <button
                            className="text-muted-foreground/30 hover:text-red-400/80 transition-colors bg-transparent border-none cursor-pointer p-1 rounded hover:bg-white/[0.04] max-sm:min-w-[44px] max-sm:min-h-[44px] max-sm:flex max-sm:items-center max-sm:justify-center"
                            onClick={async () => {
                              const next = importantSenders.filter((_, j) => j !== i);
                              setImportantSenders(next);
                              setSenderSaving(true);
                              await updateImportantSenders(next).catch(() => {});
                              setSenderSaving(false);
                            }}
                            title="Remove"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      {importantSenders.length === 0 && (
                        <p className="text-[11px] max-sm:text-xs text-muted-foreground/30 italic">
                          No important senders yet. Add one below, or they will be auto-detected from future briefings.
                        </p>
                      )}
                    </div>
                    <form onSubmit={async (e) => {
                      e.preventDefault();
                      const input = e.target.elements.senderEmail;
                      const address = input.value.trim().toLowerCase();
                      if (!address) return;
                      if (importantSenders.some(s => s.address === address)) {
                        input.value = "";
                        return;
                      }
                      const next = [...importantSenders, { address, name: address.split("@")[0], source: "manual" }];
                      setImportantSenders(next);
                      input.value = "";
                      setSenderSaving(true);
                      await updateImportantSenders(next).catch(() => {});
                      setSenderSaving(false);
                    }} className="flex gap-2">
                      <Input name="senderEmail" placeholder="e.g. boss@company.com" className="flex-1" />
                      <Button type="submit" size="sm" disabled={senderSaving}>
                        {senderSaving ? "Saving…" : "Add"}
                      </Button>
                    </form>
                  </SettingsCard>

                  <SettingsCard title="Briefing Schedules" icon={<CalendarClock size={12} />}>
                    <div ref={schedContainerRef} className="flex flex-col gap-3">
                      {(() => {
                        const items = [...(settings?.schedules || [])].map((s, i) => ({ ...s, _oi: i }));
                        const sorted = [...items].sort((a, b) => (a.time || "").localeCompare(b.time || ""));
                        const sortOrder = sorted.map(s => s._oi).join(",");
                        if (editingTimeIdx !== null) {
                          if (!frozenOrderRef.current) frozenOrderRef.current = sortOrder;
                          const frozen = frozenOrderRef.current.split(",").map(Number);
                          return frozen.map(oi => items.find(s => s._oi === oi)).filter(Boolean);
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
                          <div key={oi} data-sched-idx={oi} ref={el => {
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
                          }} className="flex flex-col gap-2 px-4 py-2 bg-surface rounded-lg border border-border sm:flex-row sm:items-center sm:gap-3">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <input
                                type="text" value={sched.label || ""} placeholder="Label"
                                onChange={e => {
                                  const updated = [...settings.schedules];
                                  updated[oi] = { ...updated[oi], label: e.target.value };
                                  setSettings(s => ({ ...s, schedules: updated }));
                                }}
                                onBlur={() => patch({ schedules_json: settings.schedules })}
                                className="flex-1 text-[13px] font-medium text-foreground bg-transparent border-none outline-none p-0 min-w-0"
                              />
                              <input
                                type="time" value={sched.time || "08:00"}
                                onFocus={() => setEditingTimeIdx(oi)}
                                onBlur={() => {
                                  if (schedContainerRef.current) {
                                    schedContainerRef.current.querySelectorAll("[data-sched-idx]").forEach(el => {
                                      schedRectsRef.current[el.dataset.schedIdx] = el.getBoundingClientRect().top;
                                    });
                                  }
                                  patch({ schedules_json: settings.schedules });
                                  setEditingTimeIdx(null);
                                }}
                                onChange={e => {
                                  const updated = [...settings.schedules];
                                  updated[oi] = { ...updated[oi], time: e.target.value };
                                  setSettings(s => ({ ...s, schedules: updated }));
                                }}
                                className="text-xs text-muted-foreground/70 bg-transparent border border-white/[0.08] rounded-md px-2 py-1 [color-scheme:dark] shrink-0"
                              />
                              <button onClick={() => {
                                const updated = [...settings.schedules];
                                updated[oi] = { ...updated[oi], enabled: !updated[oi].enabled };
                                setSettings(s => ({ ...s, schedules: updated }));
                                patch({ schedules_json: updated });
                              }} className={cn(
                                "w-10 h-[22px] rounded-full border-none cursor-pointer relative transition-colors shrink-0",
                                sched.enabled ? "bg-[#cba6da]" : "bg-white/10"
                              )} aria-label={sched.enabled ? "Disable schedule" : "Enable schedule"}>
                                <div className={cn(
                                  "w-4 h-4 rounded-full bg-white absolute top-[3px] transition-[left]",
                                  sched.enabled ? "left-[21px]" : "left-[3px]"
                                )} />
                              </button>
                            </div>
                            <div className="flex items-center gap-2 max-sm:border-t max-sm:border-white/[0.04] max-sm:pt-2 max-sm:-mx-4 max-sm:px-4">
                              {sched.enabled && (
                                <button onClick={async () => {
                                  const result = await skipSchedule(oi, !isSkipped);
                                  if (result.schedules) setSettings(s => ({ ...s, schedules: result.schedules }));
                                }} title={isSkipped ? "Unskip this schedule" : "Skip today's run"}
                                aria-label={isSkipped ? "Unskip this schedule" : "Skip today's run"}
                                className={cn(
                                  "rounded-md px-2 py-[3px] text-[10px] max-sm:text-xs font-medium cursor-pointer transition-all font-[inherit] whitespace-nowrap",
                                  isSkipped
                                    ? "bg-[#f9e2af]/[0.08] border border-[#f9e2af]/20 text-[#f9e2af]"
                                    : "bg-input-bg border border-white/[0.08] text-muted-foreground hover:bg-white/[0.04] hover:text-muted-foreground/70 hover:border-white/15"
                                )}>
                                  {isSkipped ? "Skipped" : "Skip Today"}
                                </button>
                              )}
                              <button onClick={() => {
                                if (schedContainerRef.current) {
                                  schedContainerRef.current.querySelectorAll("[data-sched-idx]").forEach(el => {
                                    schedRectsRef.current[el.dataset.schedIdx] = el.getBoundingClientRect().top;
                                  });
                                }
                                const updated = settings.schedules.filter((_, j) => j !== oi);
                                setSettings(s => ({ ...s, schedules: updated }));
                                patch({ schedules_json: updated });
                              }} className="bg-transparent border-none cursor-pointer text-muted-foreground px-1 opacity-60 hover:opacity-100 transition-opacity inline-flex items-center" aria-label="Remove schedule"><X size={14} /></button>
                            </div>
                          </div>
                        );
                      })}
                      <button onClick={() => {
                        const updated = [...(settings?.schedules || []), { label: "New Schedule", time: "08:00", enabled: false }];
                        setSettings(s => ({ ...s, schedules: updated }));
                        patch({ schedules_json: updated });
                      }} className="bg-input-bg border border-dashed border-white/10 rounded-lg px-3.5 py-2 text-muted-foreground text-xs cursor-pointer transition-all hover:border-white/20 hover:text-muted-foreground/70">
                        + Add Schedule
                      </button>
                    </div>
                  </SettingsCard>
                </>
              )}

              {tab === "system" && (
                <>
                  <SettingsCard title="Search & Historical Context" icon={<Database size={12} />}>
                    <div className="text-xs text-muted-foreground/70 leading-relaxed">
                      <p className="mb-2">
                        Briefings use vector embeddings to retrieve relevant historical context (bill trends, recurring senders, deadline patterns).
                        Search lets you query past briefing data.
                      </p>
                      <div className="flex flex-col gap-1.5 mt-3">
                        <div className="flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", settings?.openai_available ? "bg-success" : "bg-warning")} />
                          <span>
                            OpenAI Embeddings: {settings?.openai_available
                              ? <span className="text-success">Connected</span>
                              : <span className="text-warning">Not configured (set OPENAI_API_KEY)</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("w-2 h-2 rounded-full shrink-0", settings?.embedding_count > 0 ? "bg-success" : "bg-text-muted")} />
                          <span>Indexed chunks: {settings?.embedding_count ?? 0}</span>
                        </div>
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
  );
}
