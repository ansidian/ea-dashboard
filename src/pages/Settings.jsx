import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  getAccounts, getSettings, updateSettings,
  getGmailAuthUrl, addICloudAccount, removeAccount, updateAccount,
  testActualBudget, geocodeLocation,
} from "../api";

function Card({ title, children }) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
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
    <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px" }}>
        <span style={{ fontSize: 16, cursor: "pointer" }} onClick={() => setEditing(!editing)} title="Edit">{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
          </div>
          <div style={{ fontSize: 11, color: "#64748b" }}>{acc.email} · {acc.type}</div>
        </div>
        <button onClick={() => setEditing(!editing)} className="btn-header" style={{ fontSize: 11 }}>
          {editing ? "Cancel" : "Edit"}
        </button>
        {acc.type === "gmail" && (
          <button
            onClick={async () => {
              const newVal = !acc.calendar_enabled;
              await updateAccount(acc.id, { calendar_enabled: newVal });
              setAccounts(accounts.map(a => a.id === acc.id ? { ...a, calendar_enabled: newVal ? 1 : 0 } : a));
            }}
            title={acc.calendar_enabled ? "Calendar sync enabled" : "Calendar sync disabled"}
            style={{
              background: acc.calendar_enabled ? "rgba(99,102,241,0.1)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${acc.calendar_enabled ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.08)"}`,
              borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 500, cursor: "pointer",
              color: acc.calendar_enabled ? "#a5b4fc" : "#64748b",
              display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s ease",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {acc.calendar_enabled ? "Calendar on" : "Calendar off"}
          </button>
        )}
        <button onClick={() => onRemove(acc.id)} className="btn-danger">Remove</button>
      </div>
      {editing && (
        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column", gap: 12, animation: "fadeIn 0.15s ease" }}>
          <div>
            <label className="label">Display Name</label>
            <input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder={acc.email} />
          </div>
          <div>
            <label className="label">Icon</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {EMOJI_OPTIONS.map(e => (
                <button key={e} onClick={() => setIcon(e)} style={{
                  fontSize: 18, padding: "4px 6px", borderRadius: 6, cursor: "pointer", border: "1px solid",
                  background: icon === e ? "rgba(99,102,241,0.15)" : "rgba(255,255,255,0.03)",
                  borderColor: icon === e ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.06)",
                  transition: "all 0.15s ease",
                }}>{e}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">Color</label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {COLOR_OPTIONS.map(c => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer",
                  border: color === c ? "2px solid #fff" : "2px solid transparent",
                  boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                  transition: "all 0.15s ease",
                }} />
              ))}
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                style={{ width: 22, height: 22, borderRadius: "50%", border: "none", cursor: "pointer", background: "transparent" }}
                title="Custom color"
              />
            </div>
          </div>
          <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ alignSelf: "flex-start", padding: "6px 16px", fontSize: 12 }}>
            {saving ? "Saving..." : "Save"}
          </button>
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
  const [icloudForm, setIcloudForm] = useState({ email: "", password: "", show: false });
  const [actualForm, setActualForm] = useState({ serverUrl: "", password: "", syncId: "" });
  const [weatherForm, setWeatherForm] = useState({ location: "", lat: "", lng: "", geocoding: false, results: null });
  const [lookbackHours, setLookbackHours] = useState(16);
  const [testStatus, setTestStatus] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null);

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
      <div style={{ minHeight: "100vh", background: "linear-gradient(165deg, #0a0a0f 0%, #0f1118 40%, #111827 100%)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 20, height: 20, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#818cf8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(165deg, #0a0a0f 0%, #0f1118 40%, #111827 100%)", color: "#e2e8f0", fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", padding: 24, maxWidth: 900, margin: "0 auto" }}>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <Link to="/" className="btn-header" style={{ textDecoration: "none" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          Dashboard
        </Link>
        <h1 style={{ fontFamily: "'DM Serif Display', Georgia, serif", fontSize: 28, fontWeight: 400, margin: 0, color: "#f8fafc" }}>Settings</h1>
      </div>

      {/* Connected Accounts */}
      <Card title="Connected Accounts">
        {accounts.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            {accounts.map(acc => (
              <AccountRow key={acc.id} acc={acc} accounts={accounts} setAccounts={setAccounts} onRemove={handleRemoveAccount} />
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>No accounts connected yet.</p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handleAddGmail} className="btn-primary">Add Gmail</button>
          <button onClick={() => setIcloudForm(f => ({ ...f, show: !f.show }))} className="btn-secondary">
            {icloudForm.show ? "Cancel" : "Add iCloud"}
          </button>
        </div>
        {icloudForm.show && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="email" placeholder="iCloud email" value={icloudForm.email} onChange={e => setIcloudForm(f => ({ ...f, email: e.target.value }))} className="input" />
            <input type="password" placeholder="App-specific password" value={icloudForm.password} onChange={e => setIcloudForm(f => ({ ...f, password: e.target.value }))} className="input" />
            <button onClick={handleAddICloud} className="btn-primary" style={{ alignSelf: "flex-start" }}>Connect iCloud</button>
          </div>
        )}
      </Card>

      {/* Email Lookback */}
      <Card title="Email Lookback">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label className="label" style={{ margin: 0, whiteSpace: "nowrap" }}>Fetch emails from the last</label>
          <input
            type="number" min="1" max="72" value={lookbackHours}
            onChange={e => setLookbackHours(Math.max(1, Math.min(72, parseInt(e.target.value) || 16)))}
            className="input" style={{ width: 70, textAlign: "center" }}
          />
          <span style={{ fontSize: 13, color: "#94a3b8" }}>hours</span>
        </div>
        <p style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>
          Controls how far back to look for emails during briefing generation. Default: 16 hours.
        </p>
      </Card>

      {/* Schedules */}
      <Card title="Briefing Schedules">
        <div ref={schedContainerRef} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {(() => {
            const items = [...(settings?.schedules || [])].map((s, i) => ({ ...s, _oi: i }));
            const sorted = items.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
            if (editingTimeIdx !== null) {
              // Freeze: render in the order captured when editing started
              if (!frozenOrderRef.current) frozenOrderRef.current = sorted.map(s => s._oi);
              return frozenOrderRef.current.map(oi => items.find(s => s._oi === oi)).filter(Boolean);
            }
            frozenOrderRef.current = null;
            return sorted;
          })().map((sched) => {
            const oi = sched._oi;
            return (
            <div key={oi} data-sched-idx={oi} ref={el => {
              if (!el) return;
              const prev = schedRectsRef.current[oi];
              // Only animate when not entering edit mode (i.e. on blur/re-sort)
              if (prev !== undefined && editingTimeIdx === null) {
                const curr = el.getBoundingClientRect().top;
                const dy = prev - curr;
                if (Math.abs(dy) > 1) {
                  el.style.transition = "none";
                  el.style.transform = `translateY(${dy}px)`;
                  requestAnimationFrame(() => {
                    el.style.transition = "transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)";
                    el.style.transform = "";
                  });
                }
              }
              schedRectsRef.current[oi] = el.getBoundingClientRect().top;
            }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
              <input
                type="text" value={sched.label || ""} placeholder="Label"
                onChange={e => {
                  const updated = [...settings.schedules];
                  updated[oi] = { ...updated[oi], label: e.target.value };
                  setSettings(s => ({ ...s, schedules: updated }));
                }}
                onBlur={() => updateSettings({ schedules_json: settings.schedules })}
                style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#e2e8f0", background: "transparent", border: "none", outline: "none", padding: 0 }}
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
                style={{ fontSize: 12, color: "#94a3b8", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "4px 8px", colorScheme: "dark" }}
              />
              <button onClick={async () => {
                const updated = [...settings.schedules];
                updated[oi] = { ...updated[oi], enabled: !updated[oi].enabled };
                setSettings(s => ({ ...s, schedules: updated }));
                await updateSettings({ schedules_json: updated });
              }} style={{
                width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                background: sched.enabled ? "#6366f1" : "rgba(255,255,255,0.1)",
                position: "relative", transition: "background 0.2s",
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: "50%", background: "#fff",
                  position: "absolute", top: 3, transition: "left 0.2s",
                  left: sched.enabled ? 21 : 3,
                }} />
              </button>
              <button onClick={async () => {
                if (schedContainerRef.current) {
                  schedContainerRef.current.querySelectorAll("[data-sched-idx]").forEach(el => {
                    schedRectsRef.current[el.dataset.schedIdx] = el.getBoundingClientRect().top;
                  });
                }
                const updated = settings.schedules.filter((_, j) => j !== oi);
                setSettings(s => ({ ...s, schedules: updated }));
                await updateSettings({ schedules_json: updated });
              }} style={{
                background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 16, padding: "0 4px",
                opacity: 0.6, transition: "opacity 0.2s",
              }} onMouseEnter={e => e.target.style.opacity = 1} onMouseLeave={e => e.target.style.opacity = 0.6}>×</button>
            </div>
            );
          })}
          <button onClick={async () => {
            const updated = [...(settings?.schedules || []), { label: "New Schedule", time: "08:00", enabled: false }];
            setSettings(s => ({ ...s, schedules: updated }));
            await updateSettings({ schedules_json: updated });
          }} style={{
            background: "rgba(255,255,255,0.04)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8,
            padding: "8px 14px", color: "#64748b", fontSize: 12, cursor: "pointer", transition: "all 0.2s",
          }} onMouseEnter={e => { e.target.style.borderColor = "rgba(255,255,255,0.2)"; e.target.style.color = "#94a3b8"; }}
             onMouseLeave={e => { e.target.style.borderColor = "rgba(255,255,255,0.1)"; e.target.style.color = "#64748b"; }}>
            + Add Schedule
          </button>
        </div>
      </Card>

      {/* Weather Location */}
      <Card title="Weather Location">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="label">City Name</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" placeholder="El Monte, CA" value={weatherForm.location}
                onChange={e => setWeatherForm(f => ({ ...f, location: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleGeocode(); }}
                className="input" style={{ flex: 1 }} />
              <button onClick={handleGeocode} disabled={weatherForm.geocoding || !weatherForm.location} className="btn-secondary" style={{ whiteSpace: "nowrap" }}>
                {weatherForm.geocoding ? "Looking up..." : "Look up"}
              </button>
            </div>
          </div>
          {weatherForm.results && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {weatherForm.results.map((r, i) => (
                <button key={i} onClick={() => selectLocation(r)} style={{
                  background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#e2e8f0",
                  cursor: "pointer", textAlign: "left", transition: "background 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
                >
                  {r.name} <span style={{ color: "#64748b", fontSize: 11 }}>({r.lat.toFixed(4)}, {r.lng.toFixed(4)})</span>
                </button>
              ))}
            </div>
          )}
          {weatherForm.lat && weatherForm.lng && (
            <p style={{ fontSize: 11, color: "#64748b", margin: 0 }}>
              Coordinates: {weatherForm.lat}, {weatherForm.lng}
            </p>
          )}
        </div>
      </Card>

      {/* Actual Budget */}
      <Card title="Actual Budget">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label className="label">Server URL</label>
            <input type="url" placeholder="https://actual.yourdomain.com" value={actualForm.serverUrl} onChange={e => setActualForm(f => ({ ...f, serverUrl: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" placeholder="Actual Budget password" value={actualForm.password} onChange={e => setActualForm(f => ({ ...f, password: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Sync ID</label>
            <input type="text" placeholder="Budget sync ID" value={actualForm.syncId} onChange={e => setActualForm(f => ({ ...f, syncId: e.target.value }))} className="input" />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <button onClick={async () => {
              setTestStatus("testing");
              try {
                const result = await testActualBudget();
                setTestStatus(result.success ? "ok" : "fail");
              } catch {
                setTestStatus("fail");
              }
            }} disabled={testStatus === "testing"} className="btn-secondary">
              {testStatus === "testing" ? "Testing..." : "Test Connection"}
            </button>
            {testStatus && testStatus !== "testing" && (
              <span style={{ fontSize: 12, color: testStatus === "ok" ? "#34d399" : "#ef4444" }}>
                {testStatus === "ok" ? "Connected!" : "Failed"}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Global Save */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 0" }}>
        <button onClick={handleSaveSettings} disabled={saving} className="btn-primary">
          {saving ? "Saving..." : "Save All Settings"}
        </button>
        {saveMsg && (
          <span style={{
            fontSize: 12, fontWeight: 500,
            color: saveMsg.includes("Failed") ? "#ef4444" : "#34d399",
            animation: "fadeIn 0.2s ease",
          }}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
