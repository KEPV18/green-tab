const API_URL = import.meta.env.VITE_API_URL || "";

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("gt_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = { "Content-Type": "application/json", ...getAuthHeader(), ...(options.headers as Record<string, string> || {}) };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API Error: ${res.status}`);
  }
  return res.json();
}

// ---- Auth ----
export async function signUp(email: string, username: string, password: string) {
  const data = await apiFetch<{ user: { id: string; email: string; username: string; createdAt: string }; token: string }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
  localStorage.setItem("gt_token", data.token);
  localStorage.setItem("gt_user", JSON.stringify(data.user));
  return data;
}

export async function signIn(email: string, password: string) {
  const data = await apiFetch<{ user: { id: string; email: string; username: string; createdAt: string }; token: string }>("/auth/signin", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  localStorage.setItem("gt_token", data.token);
  localStorage.setItem("gt_user", JSON.stringify(data.user));
  return data;
}

export function signOut() {
  localStorage.removeItem("gt_token");
  localStorage.removeItem("gt_user");
}

export function getCurrentUser() {
  const raw = localStorage.getItem("gt_user");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function getToken() {
  return localStorage.getItem("gt_token");
}

// ---- Month Data ----
export async function getMonthData(year: number, month: number) {
  return apiFetch<any>(`/performance/${year}/${month}`);
}

export async function updateMonthData(year: number, month: number, data: Record<string, unknown>) {
  return apiFetch<any>(`/performance/${year}/${month}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

// ---- Tickets ----
export async function addTicket(monthDataId: string, ticket: { ticketId: string; type: string; channel: string; note: string }) {
  return apiFetch<any>(`/tickets/${monthDataId}`, {
    method: "POST",
    body: JSON.stringify(ticket),
  });
}

export async function deleteTicket(ticketId: string) {
  return apiFetch<{ success: boolean }>(`/tickets/${ticketId}`, { method: "DELETE" });
}

// ---- Genesys Tickets ----
export async function addGenesysTicket(monthDataId: string, ticket: Record<string, unknown>) {
  return apiFetch<any>(`/genesys-tickets/${monthDataId}`, {
    method: "POST",
    body: JSON.stringify(ticket),
  });
}

export async function deleteGenesysTicket(ticketId: string) {
  return apiFetch<{ success: boolean }>(`/genesys-tickets/${ticketId}`, { method: "DELETE" });
}

// ---- Daily Changes ----
export async function addDailyChange(monthDataId: string, change: Record<string, unknown>) {
  return apiFetch<any>(`/daily-changes/${monthDataId}`, {
    method: "POST",
    body: JSON.stringify(change),
  });
}

// ---- Daily Shifts ----
export async function getShifts(yearMonth?: string) {
  const query = yearMonth ? `?yearMonth=${yearMonth}` : "";
  return apiFetch<any[]>(`/shifts${query}`);
}

export async function upsertShift(shift: Record<string, unknown>) {
  return apiFetch<any>("/shifts", {
    method: "POST",
    body: JSON.stringify(shift),
  });
}

// ---- User Settings ----
export async function getSettings() {
  return apiFetch<any>("/settings");
}

export async function updateSettings(settings: Record<string, unknown>) {
  return apiFetch<any>("/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// ---- Health ----
export async function checkHealth() {
  return apiFetch<{ status: string; timestamp: string }>("/health");
}