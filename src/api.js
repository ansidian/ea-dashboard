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

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || `API error: ${res.status}`);
  }
  return res.json();
}

// Auth
export const checkAuth = () => apiFetch("/api/auth/check");
export const login = (password) => apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ password }) });
export const logout = () => apiFetch("/api/auth/logout", { method: "POST" });

// Briefings
export const getLatestBriefing = () => {
  const mock = new URLSearchParams(window.location.search).get("mock");
  return apiFetch(mock ? "/api/briefing/latest?mock=1" : "/api/briefing/latest");
};
export const triggerGeneration = () => apiFetch("/api/briefing/generate", { method: "POST" });
export const quickRefresh = () => apiFetch("/api/briefing/refresh", { method: "POST" });
export const pollStatus = (id) => apiFetch(`/api/briefing/status/${id}`);
export const checkInProgress = () => apiFetch("/api/briefing/in-progress");
export const getBriefingHistory = () => apiFetch("/api/briefing/history");
export const getBriefingById = (id) => apiFetch(`/api/briefing/${id}`);
export const getEmailBody = (uid) => apiFetch(`/api/briefing/email/${encodeURIComponent(uid)}`);
export const dismissEmail = (emailId) => apiFetch(`/api/briefing/dismiss/${encodeURIComponent(emailId)}`, { method: "POST" });
export const deleteBriefing = (id) => apiFetch(`/api/briefing/${id}`, { method: "DELETE" });

// Actual Budget
export const sendToActualBudget = (bill) => apiFetch("/api/briefing/actual/send", { method: "POST", body: JSON.stringify(bill) });
export const getActualAccounts = () => apiFetch("/api/briefing/actual/accounts");
export const getActualPayees = () => apiFetch("/api/briefing/actual/payees");
export const getActualCategories = () => apiFetch("/api/briefing/actual/categories");
export const getActualMetadata = () => apiFetch("/api/briefing/actual/metadata");
export const testActualBudget = () => apiFetch("/api/briefing/actual/test", { method: "POST" });

// Accounts & Settings
export const getAccounts = () => apiFetch("/api/ea/accounts");
export const getGmailAuthUrl = () => apiFetch("/api/ea/accounts/gmail/auth");
export const addICloudAccount = (email, password) => apiFetch("/api/ea/accounts/icloud", { method: "POST", body: JSON.stringify({ email, password }) });
export const updateAccount = (id, data) => apiFetch(`/api/ea/accounts/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const removeAccount = (id) => apiFetch(`/api/ea/accounts/${id}`, { method: "DELETE" });
export const getSettings = () => apiFetch("/api/ea/settings");
export const updateSettings = (data) => apiFetch("/api/ea/settings", { method: "PUT", body: JSON.stringify(data) });
export const geocodeLocation = (q) => apiFetch(`/api/ea/geocode?q=${encodeURIComponent(q)}`);
export const skipSchedule = (index, skip = true) => apiFetch("/api/ea/schedules/skip", { method: "POST", body: JSON.stringify({ index, skip }) });
export const getModels = () => apiFetch("/api/ea/models");
export const suspendService = () => apiFetch("/api/ea/suspend", { method: "POST" });

// Search
export const searchBriefings = (query, options = {}) => {
  const params = new URLSearchParams({ q: query });
  if (options.types) params.set("types", options.types);
  if (options.limit) params.set("limit", options.limit);
  return apiFetch(`/api/search?${params}`);
};
export const analyzeSearchResults = (query, results) => apiFetch("/api/search/analyze", { method: "POST", body: JSON.stringify({ query, results }) });
