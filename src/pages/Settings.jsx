import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getAccounts, getSettings, updateSettings,
  getGmailAuthUrl, addICloudAccount, removeAccount,
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

export default function Settings() {
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [icloudForm, setIcloudForm] = useState({ email: "", password: "", show: false });
  const [actualForm, setActualForm] = useState({ serverUrl: "", password: "", syncId: "" });
  const [weatherForm, setWeatherForm] = useState({ location: "", lat: "", lng: "", geocoding: false, results: null });
  const [testStatus, setTestStatus] = useState(null);

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
        // Single result — auto-select
        setWeatherForm(f => ({
          ...f, geocoding: false, results: null,
          location: results[0].name, lat: results[0].lat.toString(), lng: results[0].lng.toString(),
        }));
      } else {
        setWeatherForm(f => ({ ...f, geocoding: false, results }));
      }
    } catch {
      setWeatherForm(f => ({ ...f, geocoding: false }));
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    try {
      const payload = {
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
    } catch (err) {
      alert("Failed to save: " + err.message);
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
              <div key={acc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 16 }}>{acc.icon || "📧"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0" }}>{acc.name || acc.email}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{acc.type}</div>
                </div>
                <button onClick={() => handleRemoveAccount(acc.id)} className="btn-danger">Remove</button>
              </div>
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

      {/* Schedules */}
      <Card title="Briefing Schedules">
        {settings?.schedules ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {settings.schedules.map((sched, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#e2e8f0" }}>{sched.name}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{sched.time}</div>
                </div>
                <button onClick={() => {
                  const updated = { ...settings };
                  updated.schedules[i].enabled = !updated.schedules[i].enabled;
                  setSettings({ ...updated });
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
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "#64748b" }}>Schedule configuration will appear once your backend is connected.</p>
        )}
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
                <button key={i} onClick={() => setWeatherForm(f => ({
                  ...f, location: r.name, lat: r.lat.toString(), lng: r.lng.toString(), results: null,
                }))} style={{
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
            <button onClick={handleSaveSettings} disabled={saving} className="btn-primary">
              {saving ? "Saving..." : "Save"}
            </button>
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
    </div>
  );
}
