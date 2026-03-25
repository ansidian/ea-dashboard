async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Not authenticated");
  }

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Auth
export const checkAuth = () => apiFetch("/api/auth/check");
export const login = (password) => apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
export const logout = () => apiFetch("/api/auth/logout", { method: "POST" });

// Briefings
export const getLatestBriefing = () => apiFetch("/api/briefing/latest");
export const triggerGeneration = () => apiFetch("/api/briefing/generate", { method: "POST" });
export const quickRefresh = () => apiFetch("/api/briefing/refresh", { method: "POST" });
export const pollStatus = (id) => apiFetch(`/api/briefing/status/${id}`);
export const getBriefingHistory = () => apiFetch("/api/briefing/history");
export const getBriefingById = (id) => apiFetch(`/api/briefing/${id}`);
export const getEmailBody = (uid) => apiFetch(`/api/briefing/email/${uid}`);

// Actual Budget
export const sendToActualBudget = (bill) => apiFetch("/api/briefing/actual/send", { method: "POST", body: JSON.stringify(bill) });
export const testActualBudget = () => apiFetch("/api/briefing/actual/test", { method: "POST" });

// Accounts & Settings
export const getAccounts = () => apiFetch("/api/ea/accounts");
export const getGmailAuthUrl = () => apiFetch("/api/ea/accounts/gmail/auth");
export const addICloudAccount = (email, password) => apiFetch("/api/ea/accounts/icloud", { method: "POST", body: JSON.stringify({ email, password }) });
export const removeAccount = (id) => apiFetch(`/api/ea/accounts/${id}`, { method: "DELETE" });
export const getSettings = () => apiFetch("/api/ea/settings");
export const updateSettings = (data) => apiFetch("/api/ea/settings", { method: "PUT", body: JSON.stringify(data) });
export const geocodeLocation = (q) => apiFetch(`/api/ea/geocode?q=${encodeURIComponent(q)}`);
