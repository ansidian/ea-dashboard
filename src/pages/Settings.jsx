import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  getAccounts, getSettings, updateSettings,
  getGmailAuthUrl, addICloudAccount, removeAccount, updateAccount,
  testActualBudget, geocodeLocation, getModels, skipSchedule,
} from "../api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function SettingsCard({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 px-5 mb-6">
      <h3 className="text-[11px] tracking-[2.5px] uppercase text-text-muted font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

const EMOJI_OPTIONS = ["📧", "🍎", "💼", "🏫", "🎓", "🏠", "💰", "🛒", "🔔", "🎮", "🎵", "📱", "🖥️", "🔧", "⭐", "🚀"];
const COLOR_OPTIONS = ["#818cf8", "#6366f1", "#a78bfa", "#f472b6", "#fb923c", "#fbbf24", "#34d399", "#22d3ee", "#ef4444", "#64748b"];

function AccountRow({ acc, accounts, setAccounts, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(acc.label || acc.email);
  const [color, setColor] = useState(acc.color || "#818cf8");
  const [icon, setIcon] = useState(acc.icon || (acc.type === "icloud" ? "🍎" : "📧"));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await updateAccount(acc.id, { label, color, icon });
    setAccounts(accounts.map(a => a.id === acc.id ? { ...a, label, color, icon } : a));
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="bg-surface rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <span className="text-base cursor-pointer" onClick={() => setEditing(!editing)} title="Edit">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
            <div className="text-[13px] font-medium text-text-body overflow-hidden text-ellipsis whitespace-nowrap">{label}</div>
          </div>
          <div className="text-[11px] text-text-muted">{acc.email} · {acc.type}</div>
        </div>
        <Button variant="ghost" size="xs" onClick={() => setEditing(!editing)}>
          {editing ? "Cancel" : "Edit"}
        </Button>
        {acc.type === "gmail" && (
          <button
            onClick={async () => {
              const newVal = !acc.calendar_enabled;
              await updateAccount(acc.id, { calendar_enabled: newVal });
              setAccounts(accounts.map(a => a.id === acc.id ? { ...a, calendar_enabled: newVal ? 1 : 0 } : a));
            }}
            title={acc.calendar_enabled ? "Calendar sync enabled" : "Calendar sync disabled"}
            aria-label={acc.calendar_enabled ? "Disable calendar sync" : "Enable calendar sync"}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium cursor-pointer transition-all",
              acc.calendar_enabled
                ? "bg-accent/10 border border-accent/30 text-accent-lighter"
                : "bg-input-bg border border-white/[0.08] text-text-muted"
            )}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {acc.calendar_enabled ? "Calendar on" : "Calendar off"}
          </button>
        )}
        <Button variant="destructive" size="xs" onClick={() => onRemove(acc.id)}>Remove</Button>
      </div>
      {editing && (
        <div className="px-3.5 py-3 border-t border-border bg-white/[0.01] flex flex-col gap-3 animate-[fadeIn_0.15s_ease]">
          <div>
            <label className="text-[11px] tracking-[1.5px] uppercase text-text-muted font-medium mb-1 block">Display Name</label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder={acc.email} />
          </div>
          <div>
            <label className="text-[11px] tracking-[1.5px] uppercase text-text-muted font-medium mb-1 block">Icon</label>
            <div className="flex gap-1 flex-wrap">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => setIcon(e)} className={cn(
                  "text-lg px-1.5 py-1 rounded-md cursor-pointer border transition-all",
                  icon === e
                    ? "bg-accent/15 border-accent/40"
                    : "bg-white/[0.03] border-border hover:bg-white/[0.06]"
                )} aria-label={`Select icon ${e}`}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] tracking-[1.5px] uppercase text-text-muted font-medium mb-1 block">Color</label>
            <div className="flex gap-1.5 items-center">
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => setColor(c)} className="w-[22px] h-[22px] rounded-full cursor-pointer transition-all" style={{
                  background: c,
                  border: color === c ? "2px solid #fff" : "2px solid transparent",
                  boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                }} aria-label={`Select color ${c}`} />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="w-[22px] h-[22px] rounded-full border-none cursor-pointer bg-transparent"
                title="Custom color"
                aria-label="Pick custom color"
              />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} size="sm" className="self-start">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingTimeIdx, setEditingTimeIdx] = useState(null);
  const frozenOrderRef = useRef(null);
  const schedContainerRef = useRef(null);
  const schedRectsRef = useRef({});
  const prevSortOrderRef = useRef(null);
  const shouldAnimateRef = useRef(false);
  const [icloudForm, setIcloudForm] = useState({ email: "", password: "", show: false });
  const [actualForm, setActualForm] = useState({ serverUrl: "", password: "", syncId: "" });
  const [weatherForm, setWeatherForm] = useState({ location: "", lat: "", lng: "", geocoding: false, results: null });
  const [lookbackHours, setLookbackHours] = useState(16);
  const [testStatus, setTestStatus] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef(null);

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

  useEffect(() => {
    Promise.all([getAccounts(), getSettings(), getModels().catch(() => [])])
      .then(([acc, sett, mdls]) => {
        setModels(mdls);
        setAccounts(acc.accounts || acc);
        setSettings(sett);
        if (sett.weather_location) {
          setWeatherForm({
            location: sett.weather_location || "",
            lat: sett.weather_lat?.toString() || "",
            lng: sett.weather_lng?.toString() || "",
          });
        }
        if (sett.email_lookback_hours) setLookbackHours(sett.email_lookback_hours);
        if (sett.actual_budget_url || sett.actual_budget_sync_id) {
          setActualForm({
            serverUrl: sett.actual_budget_url || "",
            password: "",
            syncId: sett.actual_budget_sync_id || "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
        await selectLocation(results[0]);
      } else {
        setWeatherForm(f => ({ ...f, geocoding: false, results }));
      }
    } catch {
      setWeatherForm(f => ({ ...f, geocoding: false }));
    }
  }

  async function selectLocation(loc) {
    setWeatherForm({
      location: loc.name, lat: loc.lat.toString(), lng: loc.lng.toString(),
      geocoding: false, results: null,
    });
    // Auto-save immediately
    try {
      await updateSettings({
        weather_location: loc.name,
        weather_lat: loc.lat,
        weather_lng: loc.lng,
      });
      sessionStorage.setItem("ea_settings_changed", "1");
      setSaveMsg("Location saved!");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveMsg("Failed to save location");
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    try {
      const payload = {
        email_lookback_hours: lookbackHours,
        actual_budget_url: actualForm.serverUrl,
        actual_budget_sync_id: actualForm.syncId,
      };
      if (actualForm.password) {
        payload.actual_budget_password = actualForm.password;
      }
      if (weatherForm.location) {
        payload.weather_location = weatherForm.location;
      }
      if (weatherForm.lat) {
        payload.weather_lat = parseFloat(weatherForm.lat);
      }
      if (weatherForm.lng) {
        payload.weather_lng = parseFloat(weatherForm.lng);
      }
      await updateSettings(payload);
      sessionStorage.setItem("ea_settings_changed", "1");
      setSaveMsg("Settings saved!");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err) {
      setSaveMsg("Failed to save: " + err.message);
      setTimeout(() => setSaveMsg(null), 5000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/10 border-t-accent-light rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-text-body font-['DM_Sans','Helvetica_Neue',sans-serif] p-6 max-w-[900px] mx-auto">

      <div className="flex items-center gap-3 mb-8">
        <Link to="/" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-body transition-colors no-underline">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Dashboard
        </Link>
        <h1 className="font-['DM_Serif_Display',Georgia,serif] text-[28px] font-normal m-0 text-text-primary">Settings</h1>
      </div>

      {/* Connected Accounts */}
      <SettingsCard title="Connected Accounts">
        {accounts.length > 0 ? (
          <div className="flex flex-col gap-2 mb-4">
            {accounts.map(acc => (
              <AccountRow key={acc.id} acc={acc} accounts={accounts} setAccounts={setAccounts} onRemove={handleRemoveAccount} />
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-text-muted mb-4">No accounts connected yet.</p>
        )}
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleAddGmail}>Add Gmail</Button>
          <Button variant="secondary" onClick={() => setIcloudForm(f => ({ ...f, show: !f.show }))}>
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

      {/* Email Lookback */}
      <SettingsCard title="Email Lookback">
        <div className="flex items-center gap-3">
          <label className="text-[11px] tracking-[1.5px] uppercase text-text-muted font-medium whitespace-nowrap">Fetch emails from the last</label>
          <Input
            type="number" min="1" max="72" value={lookbackHours}
            onChange={e => setLookbackHours(Math.max(1, Math.min(72, parseInt(e.target.value) || 16)))}
            className="w-[70px] text-center"
          />
          <span className="text-[13px] text-text-secondary">hours</span>
        </div>
        <p className="text-[11px] text-text-muted mt-2">
          Controls how far back to look for emails during briefing generation. Default: 16 hours.
        </p>
      </SettingsCard>

      {/* Claude Model */}
      <SettingsCard title="Claude Model">
        {(() => {
          const [open, setOpen] = [modelDropdownOpen, setModelDropdownOpen];
          const selected = settings?.claude_model || "claude-haiku-4-5-20251001";
          const selectedLabel = models.find(m => m.id === selected)?.name || selected;
          return (
            <div ref={modelDropdownRef} className="relative">
              <button
                onClick={() => {
                  setOpen(!open);
                  if (models.length === 0 && !modelsLoading) {
                    setModelsLoading(true);
                    getModels()
                      .then(m => setModels(m))
                      .catch(() => {})
                      .finally(() => setModelsLoading(false));
                  }
                }}
                className="w-full text-left text-[13px] text-text-body bg-input-bg border border-white/[0.08] rounded-lg px-3 py-2 cursor-pointer flex justify-between items-center hover:bg-surface-hover transition-colors"
                aria-label="Select Claude model"
              >
                <span>{modelsLoading ? "Loading models..." : selectedLabel}</span>
                <span className="text-text-muted text-[10px]">{open ? "▲" : "▼"}</span>
              </button>
              {open && models.length > 0 && (
                <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-elevated border border-white/10 rounded-lg max-h-60 overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
                  {models.map(m => (
                    <div
                      key={m.id}
                      onClick={async () => {
                        setSettings(s => ({ ...s, claude_model: m.id }));
                        setOpen(false);
                        await updateSettings({ claude_model: m.id });
                      }}
                      className={cn(
                        "px-3 py-2 text-[13px] cursor-pointer transition-colors",
                        m.id === selected
                          ? "text-accent-light bg-accent-light/10"
                          : "text-text-body hover:bg-surface-hover"
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
        <p className="text-[11px] text-text-muted mt-2">
          Model used for briefing generation. Haiku is cheapest, Sonnet is more capable. Models are fetched from your API key.
        </p>
      </SettingsCard>

      {/* RAG / Embeddings Status */}
      <SettingsCard title="Search & Historical Context">
        <div className="text-xs text-text-secondary leading-relaxed">
          <p className="mb-2">
            Briefings use vector embeddings to retrieve relevant historical context (bill trends, recurring senders, deadline patterns).
            Search lets you query past briefing data.
          </p>
          <div className="flex flex-col gap-1.5 mt-3">
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-2 h-2 rounded-full shrink-0",
                settings?.openai_available ? "bg-success" : "bg-warning"
              )} />
              <span>
                OpenAI Embeddings: {settings?.openai_available
                  ? <span className="text-success">Connected</span>
                  : <span className="text-warning">Not configured (set OPENAI_API_KEY)</span>
                }
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                "w-2 h-2 rounded-full shrink-0",
                settings?.embedding_count > 0 ? "bg-success" : "bg-text-muted"
              )} />
              <span>
                Indexed chunks: {settings?.embedding_count ?? 0}
              </span>
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* Email Interests */}
      <SettingsCard title="Email Interests">
        <p className="text-xs text-text-secondary mb-3">
          Senders, brands, or keywords that should never be classified as noise. Add as many as you like.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(settings?.email_interests || []).map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-accent/[0.12] text-accent-lighter text-xs font-medium px-2.5 py-1 rounded-full">
              {tag}
              <button onClick={async () => {
                const next = settings.email_interests.filter((_, j) => j !== i);
                setSettings(s => ({ ...s, email_interests: next }));
                await updateSettings({ email_interests_json: next });
              }} className="bg-transparent border-none text-accent-light cursor-pointer p-0 text-sm leading-none ml-0.5" aria-label={`Remove ${tag}`}>×</button>
            </span>
          ))}
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const input = e.target.elements.interest;
          const val = input.value.trim();
          if (!val) return;
          const next = [...(settings?.email_interests || []), val];
          setSettings(s => ({ ...s, email_interests: next }));
          input.value = "";
          await updateSettings({ email_interests_json: next });
        }} className="flex gap-2">
          <Input name="interest" placeholder="e.g. Da Vien, Anthropic, GitHub..." className="flex-1" />
          <Button type="submit" size="sm">Add</Button>
        </form>
      </SettingsCard>

      {/* Schedules */}
      <SettingsCard title="Briefing Schedules">
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
            // Detect if sort order changed
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
            }} className="flex items-center gap-3 px-3.5 py-2.5 bg-surface rounded-lg border border-border">
              <input
                type="text" value={sched.label || ""} placeholder="Label"
                onChange={e => {
                  const updated = [...settings.schedules];
                  updated[oi] = { ...updated[oi], label: e.target.value };
                  setSettings(s => ({ ...s, schedules: updated }));
                }}
                onBlur={() => updateSettings({ schedules_json: settings.schedules })}
                className="flex-1 text-[13px] font-medium text-text-body bg-transparent border-none outline-none p-0"
              />
              <input
                type="time" value={sched.time || "08:00"}
                onFocus={() => setEditingTimeIdx(oi)}
                onBlur={() => {
                  // Snapshot positions before re-sort
                  if (schedContainerRef.current) {
                    schedContainerRef.current.querySelectorAll("[data-sched-idx]").forEach(el => {
                      schedRectsRef.current[el.dataset.schedIdx] = el.getBoundingClientRect().top;
                    });
                  }
                  updateSettings({ schedules_json: settings.schedules });
                  setEditingTimeIdx(null);
                }}
                onChange={e => {
                  const updated = [...settings.schedules];
                  updated[oi] = { ...updated[oi], time: e.target.value };
                  setSettings(s => ({ ...s, schedules: updated }));
                }}
                className="text-xs text-text-secondary bg-transparent border border-white/[0.08] rounded-md px-2 py-1 [color-scheme:dark]"
              />
              <button onClick={async () => {
                const updated = [...settings.schedules];
                updated[oi] = { ...updated[oi], enabled: !updated[oi].enabled };
                setSettings(s => ({ ...s, schedules: updated }));
                await updateSettings({ schedules_json: updated });
              }} className={cn(
                "w-10 h-[22px] rounded-full border-none cursor-pointer relative transition-colors",
                sched.enabled ? "bg-accent" : "bg-white/10"
              )} aria-label={sched.enabled ? "Disable schedule" : "Enable schedule"}>
                <div className={cn(
                  "w-4 h-4 rounded-full bg-white absolute top-[3px] transition-[left]",
                  sched.enabled ? "left-[21px]" : "left-[3px]"
                )} />
              </button>
              {sched.enabled && (
                <button onClick={async () => {
                  const result = await skipSchedule(oi, !isSkipped);
                  if (result.schedules) setSettings(s => ({ ...s, schedules: result.schedules }));
                }} title={isSkipped ? "Unskip this schedule" : "Skip today's run"}
                aria-label={isSkipped ? "Unskip this schedule" : "Skip today's run"}
                className={cn(
                  "rounded-md px-2 py-[3px] text-[10px] font-medium cursor-pointer transition-all font-[inherit] whitespace-nowrap",
                  isSkipped
                    ? "bg-warning/[0.12] border border-warning/25 text-[#fbbf24]"
                    : "bg-input-bg border border-white/[0.08] text-text-muted hover:text-text-secondary"
                )}>
                  {isSkipped ? "Skipped" : "Skip Today"}
                </button>
              )}
              <button onClick={async () => {
                if (schedContainerRef.current) {
                  schedContainerRef.current.querySelectorAll("[data-sched-idx]").forEach(el => {
                    schedRectsRef.current[el.dataset.schedIdx] = el.getBoundingClientRect().top;
                  });
                }
                const updated = settings.schedules.filter((_, j) => j !== oi);
                setSettings(s => ({ ...s, schedules: updated }));
                await updateSettings({ schedules_json: updated });
              }} className="bg-transparent border-none cursor-pointer text-text-muted text-base px-1 opacity-60 hover:opacity-100 transition-opacity" aria-label="Remove schedule">×</button>
            </div>
            );
          })}
          <button onClick={async () => {
            const updated = [...(settings?.schedules || []), { label: "New Schedule", time: "08:00", enabled: false }];
            setSettings(s => ({ ...s, schedules: updated }));
            await updateSettings({ schedules_json: updated });
          }} className="bg-input-bg border border-dashed border-white/10 rounded-lg px-3.5 py-2 text-text-muted text-xs cursor-pointer transition-all hover:border-white/20 hover:text-text-secondary">
            + Add Schedule
          </button>
        </div>
      </SettingsCard>

      {/* Weather Location */}
      <SettingsCard title="Weather Location">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] tracking-[1.5px] uppercase text-text-muted font-medium mb-1 block">City Name</label>
            <div className="flex gap-2">
              <Input type="text" placeholder="El Monte, CA" value={weatherForm.location}
                onChange={e => setWeatherForm(f => ({ ...f, location: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleGeocode(); }}
                className="flex-1" />
              <Button variant="secondary" onClick={handleGeocode} disabled={weatherForm.geocoding || !weatherForm.location} className="whitespace-nowrap">
                {weatherForm.geocoding ? "Looking up..." : "Look up"}
              </Button>
            </div>
          </div>
          {weatherForm.results && (
            <div className="flex flex-col gap-1">
              {weatherForm.results.map((r, i) => (
                <button key={i} onClick={() => selectLocation(r)} className="bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-body cursor-pointer text-left transition-colors hover:bg-surface-hover">
                  {r.name} <span className="text-text-muted text-[11px]">({r.lat.toFixed(4)}, {r.lng.toFixed(4)})</span>
                </button>
              ))}
            </div>
          )}
          {weatherForm.lat && weatherForm.lng && (
            <p className="text-[11px] text-text-muted m-0">
              Coordinates: {weatherForm.lat}, {weatherForm.lng}
            </p>
          )}
        </div>
      </SettingsCard>

      {/* Actual Budget */}
      <SettingsCard title="Actual Budget">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] tracking-[1.5px] uppercase text-text-muted font-medium mb-1 block">Server URL</label>
            <Input type="url" placeholder="https://actual.yourdomain.com" value={actualForm.serverUrl} onChange={e => setActualForm(f => ({ ...f, serverUrl: e.target.value }))} />
          </div>
          <div>
            <label className="text-[11px] tracking-[1.5px] uppercase text-text-muted font-medium mb-1 block">Password</label>
            <Input type="password" placeholder="Actual Budget password" value={actualForm.password} onChange={e => setActualForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <label className="text-[11px] tracking-[1.5px] uppercase text-text-muted font-medium mb-1 block">Sync ID</label>
            <Input type="text" placeholder="Budget sync ID" value={actualForm.syncId} onChange={e => setActualForm(f => ({ ...f, syncId: e.target.value }))} />
          </div>
          <div className="flex gap-2 items-center mt-1">
            <Button variant="secondary" onClick={async () => {
              setTestStatus("testing");
              try {
                const result = await testActualBudget();
                setTestStatus(result.success ? "ok" : "fail");
              } catch {
                setTestStatus("fail");
              }
            }} disabled={testStatus === "testing"}>
              {testStatus === "testing" ? "Testing..." : "Test Connection"}
            </Button>
            {testStatus && testStatus !== "testing" && (
              <span className={cn(
                "text-xs",
                testStatus === "ok" ? "text-success" : "text-danger"
              )}>
                {testStatus === "ok" ? "Connected!" : "Failed"}
              </span>
            )}
          </div>
        </div>
      </SettingsCard>

      {/* Global Save */}
      <div className="flex items-center gap-3 py-4">
        <Button onClick={handleSaveSettings} disabled={saving}>
          {saving ? "Saving..." : "Save All Settings"}
        </Button>
        {saveMsg && (
          <span className={cn(
            "text-xs font-medium animate-[fadeIn_0.2s_ease]",
            saveMsg.includes("Failed") ? "text-danger" : "text-success"
          )}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
