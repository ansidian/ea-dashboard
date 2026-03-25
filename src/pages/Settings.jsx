import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  getAccounts, getSettings, updateSettings,
  getGmailAuthUrl, addICloudAccount, removeAccount,
} from "../api";

const inputStyle = {
  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#e2e8f0",
  width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "'DM Sans', sans-serif",
};

const btnPrimary = {
  background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff",
  border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13,
  fontWeight: 600, cursor: "pointer",
};

const btnSecondary = {
  background: "rgba(255,255,255,0.06)", color: "#94a3b8",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
  padding: "10px 20px", fontSize: 13, fontWeight: 500, cursor: "pointer",
};

function Card({ title, children }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 14, padding: "20px 24px", marginBottom: 20,
    }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", margin: "0 0 16px 0" }}>{title}</h3>
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
  const [testStatus, setTestStatus] = useState(null);

  useEffect(() => {
    Promise.all([getAccounts(), getSettings()])
      .then(([acc, sett]) => {
        setAccounts(acc.accounts || acc);
        setSettings(sett);
        if (sett.actual_budget) {
          setActualForm({
            serverUrl: sett.actual_budget.server_url || "",
            password: sett.actual_budget.password || "",
            syncId: sett.actual_budget.sync_id || "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [getToken]);

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

  async function handleSaveSettings() {
    setSaving(true);
    try {
      await updateSettings({
        ...settings,
        actual_budget: {
          server_url: actualForm.serverUrl,
          password: actualForm.password,
          sync_id: actualForm.syncId,
        },
      });
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
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(165deg, #0a0a0f 0%, #0f1118 40%, #111827 100%)", color: "#e2e8f0", fontFamily: "'DM Sans', 'Helvetica Neue', sans-serif", padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <Link to="/" style={{ color: "#94a3b8", textDecoration: "none", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 14px" }}>
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
                <button onClick={() => handleRemoveAccount(acc.id)} style={{ ...btnSecondary, padding: "6px 12px", fontSize: 11, color: "#ef4444" }}>Remove</button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>No accounts connected yet.</p>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handleAddGmail} style={btnPrimary}>Add Gmail</button>
          <button onClick={() => setIcloudForm(f => ({ ...f, show: !f.show }))} style={btnSecondary}>
            {icloudForm.show ? "Cancel" : "Add iCloud"}
          </button>
        </div>
        {icloudForm.show && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="email" placeholder="iCloud email" value={icloudForm.email} onChange={e => setIcloudForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} />
            <input type="password" placeholder="App-specific password" value={icloudForm.password} onChange={e => setIcloudForm(f => ({ ...f, password: e.target.value }))} style={inputStyle} />
            <button onClick={handleAddICloud} style={{ ...btnPrimary, alignSelf: "flex-start" }}>Connect iCloud</button>
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

      {/* Actual Budget */}
      <Card title="Actual Budget">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Server URL</label>
            <input type="url" placeholder="https://actual.yourdomain.com" value={actualForm.serverUrl} onChange={e => setActualForm(f => ({ ...f, serverUrl: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Password</label>
            <input type="password" placeholder="Actual Budget password" value={actualForm.password} onChange={e => setActualForm(f => ({ ...f, password: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: "#64748b", display: "block", marginBottom: 4 }}>Sync ID</label>
            <input type="text" placeholder="Budget sync ID" value={actualForm.syncId} onChange={e => setActualForm(f => ({ ...f, syncId: e.target.value }))} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button onClick={handleSaveSettings} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button onClick={() => setTestStatus("testing")} style={btnSecondary}>
              Test Connection
            </button>
            {testStatus && <span style={{ fontSize: 12, color: testStatus === "testing" ? "#94a3b8" : testStatus === "ok" ? "#34d399" : "#ef4444", alignSelf: "center" }}>
              {testStatus === "testing" ? "Testing..." : testStatus === "ok" ? "Connected!" : "Failed"}
            </span>}
          </div>
        </div>
      </Card>
    </div>
  );
}
