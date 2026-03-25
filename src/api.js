const API_BASE = import.meta.env.VITE_CTM_API_URL;
const API_KEY = import.meta.env.VITE_EA_API_KEY;

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      ...options.headers,
    },
  });

  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getLatestBriefing() {
  return apiFetch('/api/briefing/latest');
}

export async function triggerGeneration() {
  return apiFetch('/api/briefing/generate', { method: 'POST' });
}

export async function quickRefresh() {
  return apiFetch('/api/briefing/refresh', { method: 'POST' });
}

export async function pollStatus(briefingId) {
  return apiFetch(`/api/briefing/status/${briefingId}`);
}

export async function getBriefingHistory() {
  return apiFetch('/api/briefing/history');
}

export async function getBriefingById(id) {
  return apiFetch(`/api/briefing/${id}`);
}

export async function getEmailBody(uid) {
  return apiFetch(`/api/briefing/email/${uid}`);
}

export async function sendToActualBudget(billData) {
  return apiFetch('/api/briefing/actual/send', {
    method: 'POST',
    body: JSON.stringify(billData),
  });
}

export async function getAccounts() {
  return apiFetch('/api/ea/accounts');
}

export async function getSettings() {
  return apiFetch('/api/ea/settings');
}

export async function updateSettings(settings) {
  return apiFetch('/api/ea/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function getGmailAuthUrl() {
  return apiFetch('/api/ea/accounts/gmail/auth');
}

export async function addICloudAccount(email, appPassword) {
  return apiFetch('/api/ea/accounts/icloud', {
    method: 'POST',
    body: JSON.stringify({ email, app_password: appPassword }),
  });
}

export async function removeAccount(accountId) {
  return apiFetch(`/api/ea/accounts/${accountId}`, { method: 'DELETE' });
}
