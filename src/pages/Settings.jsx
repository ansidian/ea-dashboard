import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  getAccounts, getSettings, updateSettings,
  getGmailAuthUrl, addICloudAccount, removeAccount, updateAccount, reorderAccounts,
  testActualBudget, geocodeLocation, getModels, skipSchedule,
  getImportantSenders, updateImportantSenders,
} from "../api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

function SettingsCard({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-4 px-5 mb-6">
      <h3 className="text-[11px] max-sm:text-xs tracking-[2.5px] uppercase text-muted-foreground font-semibold mb-3">{title}</h3>
      {children}
    </div>
  );
}

const EMOJI_OPTIONS = ["📧", "🍎", "💼", "🏫", "🎓", "🏠", "💰", "🛒", "🔔", "🎮", "🎵", "📱", "🖥️", "🔧", "⭐", "🚀"];
const COLOR_OPTIONS = ["#cba6da", "#b4befe", "#f38ba8", "#f5c2e7", "#fab387", "#f9e2af", "#a6e3a1", "#89dceb", "#89b4fa", "#6c7086"];

function AccountRow({ acc, accounts, setAccounts, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(acc.label || acc.email);
  const [color, setColor] = useState(acc.color || "#cba6da");
  const [icon, setIcon] = useState(acc.icon || (acc.type === "icloud" ? "🍎" : "📧"));
  const [gmailIndex, setGmailIndex] = useState(acc.gmail_index ?? 0);
  const [saving, setSaving] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: acc.id, disabled: editing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : "auto",
    cursor: editing ? "default" : isDragging ? "grabbing" : "grab",
  };

  async function handleSave() {
    setSaving(true);
    const updates = { label, color, icon };
    if (acc.type === "gmail") updates.gmail_index = gmailIndex;
    await updateAccount(acc.id, updates);
    setAccounts(accounts.map(a => a.id === acc.id ? { ...a, ...updates } : a));
    setSaving(false);
    setEditing(false);
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="bg-surface rounded-lg border border-border overflow-hidden">
      <div className="flex flex-col gap-2.5 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base cursor-pointer shrink-0" onClick={() => setEditing(!editing)} title="Edit">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              <div className="text-[13px] font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap">{label}</div>
            </div>
            <div className="text-[11px] max-sm:text-xs text-muted-foreground truncate">{acc.email} · {acc.type}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 max-sm:border-t max-sm:border-white/[0.04] max-sm:pt-2 max-sm:-mx-3.5 max-sm:px-3.5">
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
                "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] max-sm:text-xs font-medium cursor-pointer transition-all whitespace-nowrap",
                acc.calendar_enabled
                  ? "bg-[#cba6da]/15 border border-[#cba6da]/30 text-[#cba6da]"
                  : "bg-input-bg border border-white/[0.08] text-muted-foreground"
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {acc.calendar_enabled ? "Calendar on" : "Calendar off"}
            </button>
          )}
          <Button variant="destructive" size="xs" onClick={() => onRemove(acc.id)}>Remove</Button>
        </div>
      </div>
      {editing && (
        <div className="px-3.5 py-3 border-t border-border bg-white/[0.01] flex flex-col gap-3 animate-[fadeIn_0.15s_ease]">
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Display Name</label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder={acc.email} />
          </div>
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Icon</label>
            <div className="flex gap-1 flex-wrap">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => setIcon(e)} className={cn(
                  "text-lg px-1.5 py-1 rounded-md cursor-pointer border transition-all",
                  icon === e
                    ? "bg-primary/[0.12] border-primary/30"
                    : "bg-white/[0.03] border-border hover:bg-white/[0.06]"
                )} aria-label={`Select icon ${e}`}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Color</label>
            <div className="flex gap-1.5 items-center">
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => setColor(c)} className="w-[22px] h-[22px] max-sm:w-8 max-sm:h-8 rounded-full cursor-pointer transition-all" style={{
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
          {acc.type === "gmail" && (
            <div>
              <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">
                Gmail Account Index
              </label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="9"
                  value={gmailIndex}
                  onChange={e => setGmailIndex(parseInt(e.target.value, 10) || 0)}
                  className="w-20"
                />
                <span className="text-[11px] max-sm:text-xs text-muted-foreground/50">
                  The /u/N index in Gmail URLs (check your browser address bar)
                </span>
              </div>
            </div>
          )}
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
  const [todoistToken, setTodoistToken] = useState("");
  const [todoistConfigured, setTodoistConfigured] = useState(false);
  const [todoistDirty, setTodoistDirty] = useState(false);
  const [weatherForm, setWeatherForm] = useState({ location: "", lat: "", lng: "", geocoding: false, results: null });
  const [lookbackHours, setLookbackHours] = useState(16);
  const [testStatus, setTestStatus] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);
  const [models, setModels] = useState([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef(null);
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [importantSenders, setImportantSenders] = useState([]);
  const [senderSaving, setSenderSaving] = useState(false);

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = accounts.findIndex(a => a.id === active.id);
    const newIndex = accounts.findIndex(a => a.id === over.id);
    const reordered = arrayMove(accounts, oldIndex, newIndex);
    setAccounts(reordered);
    await reorderAccounts(reordered.map(a => a.id));
  }

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
    Promise.all([getAccounts(), getSettings(), getModels().catch(() => []), getImportantSenders().catch(() => [])])
      .then(([acc, sett, mdls, senders]) => {
        setImportantSenders(senders || []);
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
        if (sett.todoist_configured) setTodoistConfigured(true);
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
      if (todoistDirty) {
        payload.todoist_api_token = todoistToken;
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
        <div className="w-5 h-5 border-[1.5px] border-white/[0.06] border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen text-foreground font-sans p-4 sm:p-6 max-w-[900px] mx-auto">

      <div className="flex items-center gap-3 mb-8">
        <Link to="/" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium text-muted-foreground/70 hover:bg-white/[0.04] hover:text-foreground transition-colors no-underline">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Dashboard
        </Link>
        <h1 className="font-serif text-[28px] font-normal m-0 text-foreground">Settings</h1>
      </div>

      {/* Connected Accounts */}
      <SettingsCard title="Connected Accounts">
        {accounts.length > 0 ? (
          <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={accounts.map(a => a.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2 mb-4">
                {accounts.map(acc => (
                  <AccountRow key={acc.id} acc={acc} accounts={accounts} setAccounts={setAccounts} onRemove={handleRemoveAccount} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="text-[13px] text-muted-foreground mb-4">No accounts connected yet.</p>
        )}
        <div className="flex gap-2 flex-wrap">
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

      {/* Email Lookback */}
      <SettingsCard title="Email Lookback">
        <div className="flex items-center gap-3 max-sm:flex-wrap">
          <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium whitespace-nowrap max-sm:whitespace-normal">Fetch emails from the last</label>
          <Input
            type="number" min="1" max="72" value={lookbackHours}
            onChange={e => setLookbackHours(Math.max(1, Math.min(72, parseInt(e.target.value) || 16)))}
            className="w-[70px] text-center"
            autoComplete="off" data-1p-ignore data-lpignore="true"
          />
          <span className="text-[13px] text-muted-foreground/70">hours</span>
        </div>
        <p className="text-[11px] max-sm:text-xs text-muted-foreground mt-2">
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
                className="w-full text-left text-[13px] text-foreground bg-input-bg border border-white/[0.08] rounded-lg px-3 py-2 cursor-pointer flex justify-between items-center hover:bg-white/[0.04] transition-colors"
                aria-label="Select Claude model"
              >
                <span>{modelsLoading ? "Loading models..." : selectedLabel}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}><path d="M3 4.5L6 7.5L9 4.5" /></svg>
              </button>
              {open && models.length > 0 && (
                <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-50 bg-elevated border border-white/10 rounded-lg max-h-60 max-sm:max-h-[calc(100vh-200px)] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.7)]">
                  {models.map(m => (
                    <div
                      key={m.id}
                      onClick={async () => {
                        setSettings(s => ({ ...s, claude_model: m.id }));
                        setOpen(false);
                        await updateSettings({ claude_model: m.id });
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
          Model used for briefing generation. Haiku is cheapest, Sonnet is more capable. Models are fetched from your API key.
        </p>
      </SettingsCard>

      {/* RAG / Embeddings Status */}
      <SettingsCard title="Search & Historical Context">
        <div className="text-xs text-muted-foreground/70 leading-relaxed">
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
        <p className="text-xs text-muted-foreground/70 mb-3">
          Senders, brands, or keywords that should never be classified as noise. Add as many as you like.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(settings?.email_interests || []).map((tag, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-primary/[0.08] text-primary text-xs font-medium px-2.5 py-1 rounded-full">
              {tag}
              <button onClick={async () => {
                const next = settings.email_interests.filter((_, j) => j !== i);
                setSettings(s => ({ ...s, email_interests: next }));
                await updateSettings({ email_interests_json: next });
              }} className="bg-transparent border-none text-primary/60 cursor-pointer p-0 text-sm leading-none ml-0.5 hover:text-primary" aria-label={`Remove ${tag}`}>×</button>
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

      {/* Important Senders */}
      <SettingsCard title="Important Senders">
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
                <span className="text-[13px] text-foreground/80 truncate">
                  {sender.name || sender.address}
                </span>
                <span className="text-[10px] max-sm:text-xs text-muted-foreground/40 truncate">
                  {sender.address}
                </span>
                {sender.source === "auto" && (
                  <span className="text-[9px] max-sm:text-xs text-muted-foreground/30 shrink-0">(auto)</span>
                )}
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
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
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
            }} className="flex flex-col gap-2 px-3.5 py-2.5 bg-surface rounded-lg border border-border sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <input
                  type="text" value={sched.label || ""} placeholder="Label"
                  onChange={e => {
                    const updated = [...settings.schedules];
                    updated[oi] = { ...updated[oi], label: e.target.value };
                    setSettings(s => ({ ...s, schedules: updated }));
                  }}
                  onBlur={() => updateSettings({ schedules_json: settings.schedules })}
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
                    updateSettings({ schedules_json: settings.schedules });
                    setEditingTimeIdx(null);
                  }}
                  onChange={e => {
                    const updated = [...settings.schedules];
                    updated[oi] = { ...updated[oi], time: e.target.value };
                    setSettings(s => ({ ...s, schedules: updated }));
                  }}
                  className="text-xs text-muted-foreground/70 bg-transparent border border-white/[0.08] rounded-md px-2 py-1 [color-scheme:dark] shrink-0"
                />
                <button onClick={async () => {
                  const updated = [...settings.schedules];
                  updated[oi] = { ...updated[oi], enabled: !updated[oi].enabled };
                  setSettings(s => ({ ...s, schedules: updated }));
                  await updateSettings({ schedules_json: updated });
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
              <div className="flex items-center gap-2 max-sm:border-t max-sm:border-white/[0.04] max-sm:pt-2 max-sm:-mx-3.5 max-sm:px-3.5">
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
                <button onClick={async () => {
                  if (schedContainerRef.current) {
                    schedContainerRef.current.querySelectorAll("[data-sched-idx]").forEach(el => {
                      schedRectsRef.current[el.dataset.schedIdx] = el.getBoundingClientRect().top;
                    });
                  }
                  const updated = settings.schedules.filter((_, j) => j !== oi);
                  setSettings(s => ({ ...s, schedules: updated }));
                  await updateSettings({ schedules_json: updated });
                }} className="bg-transparent border-none cursor-pointer text-muted-foreground text-base px-1 opacity-60 hover:opacity-100 transition-opacity" aria-label="Remove schedule">×</button>
              </div>
            </div>
            );
          })}
          <button onClick={async () => {
            const updated = [...(settings?.schedules || []), { label: "New Schedule", time: "08:00", enabled: false }];
            setSettings(s => ({ ...s, schedules: updated }));
            await updateSettings({ schedules_json: updated });
          }} className="bg-input-bg border border-dashed border-white/10 rounded-lg px-3.5 py-2 text-muted-foreground text-xs cursor-pointer transition-all hover:border-white/20 hover:text-muted-foreground/70">
            + Add Schedule
          </button>
        </div>
      </SettingsCard>

      {/* Weather Location */}
      <SettingsCard title="Weather Location">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">City Name</label>
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

      {/* Actual Budget */}
      <SettingsCard title="Actual Budget">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Server URL</label>
            <Input type="url" placeholder="https://actual.yourdomain.com" value={actualForm.serverUrl} onChange={e => setActualForm(f => ({ ...f, serverUrl: e.target.value }))} />
          </div>
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Password</label>
            <Input type="password" placeholder="Actual Budget password" value={actualForm.password} onChange={e => setActualForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">Sync ID</label>
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

      {/* Todoist */}
      <SettingsCard title="Todoist">
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[11px] max-sm:text-xs tracking-[1.5px] uppercase text-muted-foreground font-medium mb-1 block">API Token</label>
            <Input type="password" placeholder={todoistConfigured && !todoistDirty ? "••••••••  (saved)" : "Todoist API token"} value={todoistToken} onChange={e => { setTodoistToken(e.target.value); setTodoistDirty(true); }} />
            <p className="text-[10px] text-muted-foreground/50 mt-1">
              Find your token at Settings &gt; Integrations &gt; Developer in Todoist
            </p>
          </div>
          {todoistConfigured && !todoistDirty && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-success" />
                <span className="text-[11px] text-success">Connected</span>
              </div>
              <button
                type="button"
                onClick={() => { setTodoistToken(""); setTodoistDirty(true); setTodoistConfigured(false); }}
                className="text-[11px] text-muted-foreground/50 hover:text-danger transition-colors cursor-pointer bg-transparent border-0 p-0"
              >
                Disconnect
              </button>
            </div>
          )}
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
