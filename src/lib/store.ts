/**
 * Green Tab — Local Data Store
 *
 * Replaces Supabase with localStorage-based persistence.
 * All keys use the "gt_" prefix to avoid collisions.
 * Uses crypto.randomUUID() for ID generation.
 */

// ─── Prefix ────────────────────────────────────────────────────────────────────
const PREFIX = "gt_";

// ─── Storage helpers ───────────────────────────────────────────────────────────
function getKey(key: string): string {
  return `${PREFIX}${key}`;
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(getKey(key));
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T): void {
  localStorage.setItem(getKey(key), JSON.stringify(value));
}

function removeItem(key: string): void {
  localStorage.removeItem(getKey(key));
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface MonthData {
  id: string;
  userId: string;
  year: number;
  month: number; // 0-indexed (January = 0)
  good: number;
  bad: number;
  karmaBad: number;
  genesysGood: number;
  genesysBad: number;
  fcr: number;
  aht: number; // seconds
  channels: number;
  tickets: number;
  offDays: number[]; // day-of-month numbers
}

export interface Ticket {
  id: string;
  performanceId: string;
  userId: string;
  ticketId: string;
  channel: string;
  type: string;
  note: string | null;
  createdAt: string;
}

export interface GenesysTicket {
  id: string;
  performanceId: string;
  userId: string;
  ticketId: string | null;
  ticketLink: string;
  channel: string | null;
  ratingScore: number | null;
  customerPhone: string | null;
  note: string | null;
  ticketDate: string;
  createdAt: string;
}

export interface DailyChange {
  id: string;
  performanceId: string;
  userId: string;
  fieldName: string;
  oldValue: number;
  newValue: number;
  changeAmount: number;
  changeDate: string;
  changeTime: string | null;
  createdAt: string;
}

export interface UserSettings {
  id: string;
  userId: string;
  shiftStartTime: string | null; // HH:mm
  shiftEndTime: string | null; // HH:mm
  breakMinutes: number;
  isSiteDay: boolean;
  theme: "light" | "dark" | "system";
  // Salary & KPI settings (stored loosely)
  baseSalary?: number | null;
  taxRate?: number | null;
  kpiPercentage?: number;
  transportAllowance?: number;
  transportApplied?: boolean;
  internetAllowance?: number;
  seniorBonus?: number;
  languageAllowance?: number;
  salaryPaymentDay?: number;
  salaryDelayMonths?: number;
  kpiDelayMonths?: number;
  employeeType?: string;
  startMonth?: string;
  // Legacy aliases (supabase column names)
  base_salary?: number | null;
  tax_rate?: number | null;
  kpi_percentage?: number;
  transportation_allowance?: number;
  transport_applied?: boolean;
  internet_allowance?: number;
  senior_bonus?: number;
  language_allowance?: number;
  salary_payment_day?: number;
  salary_delay_months?: number;
  kpi_delay_months?: number;
  employee_type?: string;
  start_month?: string;
  shift_start_time?: string;
  shift_end_time?: string;
  break_minutes?: number;
  is_site_day?: boolean;
}

export interface LocalUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

interface LocalUserWithHash extends LocalUser {
  passwordHash: string;
}

export interface FloorAverageMetric {
  yourValue: number;
  floorAvg: number;
  diff: number;
  status: "above" | "below" | "at";
}

export interface FloorAverageData {
  csat: FloorAverageMetric;
  productivity: FloorAverageMetric;
  fcr: FloorAverageMetric;
  aht: FloorAverageMetric;
}

export interface LeaderboardEntry {
  id: string;
  userId: string;
  displayName: string | null;
  year: number;
  month: number;
  csat: number;
  productivity: number;
  fcr: number;
  aht: number;
  overallScore: number;
}

// ─── Storage keys ──────────────────────────────────────────────────────────────
const KEYS = {
  MONTH_DATA: (userId: string, year: number, month: number) =>
    `month_${userId}_${year}_${month}`,
  ALL_MONTH_IDS: "month_ids",
  TICKETS: (performanceId: string) => `tickets_${performanceId}`,
  GENESYS_TICKETS: (performanceId: string) => `genesys_${performanceId}`,
  DAILY_CHANGES: (performanceId: string) => `changes_${performanceId}`,
  USER_SETTINGS: (userId: string) => `settings_${userId}`,
  USERS: "users",
  SESSION: "session",
  LEADERBOARD: "leaderboard",
} as const;

// ─── ID Generation ──────────────────────────────────────────────────────────────
function genId(): string {
  return crypto.randomUUID();
}

// ─── Month Data ─────────────────────────────────────────────────────────────────

function defaultMonthData(userId: string, year: number, month: number): MonthData {
  return {
    id: genId(),
    userId,
    year,
    month,
    good: 0,
    bad: 0,
    karmaBad: 0,
    genesysGood: 0,
    genesysBad: 0,
    fcr: 0,
    aht: 0,
    channels: 0,
    tickets: 0,
    offDays: [],
  };
}

/**
 * Get or create MonthData for a given user/year/month.
 */
export function getMonthData(userId: string, year: number, month: number): MonthData {
  const key = KEYS.MONTH_DATA(userId, year, month);
  const existing = readJSON<MonthData | null>(key, null);
  if (existing) return existing;

  // Create default and track it
  const data = defaultMonthData(userId, year, month);
  writeJSON(key, data);

  // Track the key in the index so we can list all months
  const index = readJSON<string[]>(KEYS.ALL_MONTH_IDS, []);
  const indexEntry = `${userId}_${year}_${month}`;
  if (!index.includes(indexEntry)) {
    index.push(indexEntry);
    writeJSON(KEYS.ALL_MONTH_IDS, index);
  }

  return data;
}

/**
 * Update MonthData. Merges partial fields.
 */
export function updateMonthData(
  userId: string,
  year: number,
  month: number,
  updates: Partial<Omit<MonthData, "id" | "userId" | "year" | "month">>
): MonthData {
  const key = KEYS.MONTH_DATA(userId, year, month);
  const current = getMonthData(userId, year, month);
  const updated: MonthData = { ...current, ...updates };
  writeJSON(key, updated);
  return updated;
}

/**
 * List all MonthData entries for a user.
 */
export function listMonthData(userId: string): MonthData[] {
  const index = readJSON<string[]>(KEYS.ALL_MONTH_IDS, []);
  const results: MonthData[] = [];

  for (const entry of index) {
    const [uid, yStr, mStr] = entry.split("_");
    if (uid !== userId) continue;
    const data = readJSON<MonthData | null>(
      KEYS.MONTH_DATA(userId, Number(yStr), Number(mStr)),
      null
    );
    if (data) results.push(data);
  }

  return results;
}

/**
 * Delete a month's data and all associated tickets/changes.
 */
export function deleteMonthData(userId: string, year: number, month: number): void {
  const data = getMonthData(userId, year, month);
  const perfId = data.id;

  removeItem(KEYS.MONTH_DATA(userId, year, month));
  removeItem(KEYS.TICKETS(perfId));
  removeItem(KEYS.GENESYS_TICKETS(perfId));
  removeItem(KEYS.DAILY_CHANGES(perfId));

  // Remove from index
  const index = readJSON<string[]>(KEYS.ALL_MONTH_IDS, []);
  const indexEntry = `${userId}_${year}_${month}`;
  const newIndex = index.filter((e) => e !== indexEntry);
  writeJSON(KEYS.ALL_MONTH_IDS, newIndex);
}

// ─── Tickets (per performance/month) ────────────────────────────────────────────

export function getTickets(performanceId: string): Ticket[] {
  return readJSON<Ticket[]>(KEYS.TICKETS(performanceId), []);
}

export function addTicket(
  performanceId: string,
  userId: string,
  ticket: Omit<Ticket, "id" | "createdAt" | "performanceId" | "userId">
): Ticket {
  const tickets = getTickets(performanceId);
  const newTicket: Ticket = {
    ...ticket,
    id: genId(),
    performanceId,
    userId,
    createdAt: new Date().toISOString(),
  };
  tickets.push(newTicket);
  writeJSON(KEYS.TICKETS(performanceId), tickets);
  return newTicket;
}

export function removeTicket(performanceId: string, ticketId: string): void {
  const tickets = getTickets(performanceId).filter((t) => t.id !== ticketId);
  writeJSON(KEYS.TICKETS(performanceId), tickets);
}

// ─── Genesys Tickets (per performance/month) ────────────────────────────────────

export function getGenesysTickets(performanceId: string): GenesysTicket[] {
  return readJSON<GenesysTicket[]>(KEYS.GENESYS_TICKETS(performanceId), []);
}

export function addGenesysTicket(
  performanceId: string,
  userId: string,
  ticket: Omit<GenesysTicket, "id" | "createdAt" | "performanceId" | "userId">
): GenesysTicket {
  const tickets = getGenesysTickets(performanceId);
  const newTicket: GenesysTicket = {
    ...ticket,
    id: genId(),
    performanceId,
    userId,
    createdAt: new Date().toISOString(),
  };
  tickets.push(newTicket);
  writeJSON(KEYS.GENESYS_TICKETS(performanceId), tickets);
  return newTicket;
}

export function removeGenesysTicket(performanceId: string, ticketId: string): void {
  const tickets = getGenesysTickets(performanceId).filter((t) => t.id !== ticketId);
  writeJSON(KEYS.GENESYS_TICKETS(performanceId), tickets);
}

// ─── Daily Changes Log (per performance/month) ──────────────────────────────────

export function getDailyChanges(performanceId: string): DailyChange[] {
  return readJSON<DailyChange[]>(KEYS.DAILY_CHANGES(performanceId), []);
}

export function addDailyChange(
  performanceId: string,
  userId: string,
  change: Omit<DailyChange, "id" | "createdAt" | "performanceId" | "userId">
): DailyChange {
  const changes = getDailyChanges(performanceId);
  const newChange: DailyChange = {
    ...change,
    id: genId(),
    performanceId,
    userId,
    createdAt: new Date().toISOString(),
  };
  changes.push(newChange);
  writeJSON(KEYS.DAILY_CHANGES(performanceId), changes);
  return newChange;
}

// ─── Remove a Daily Change ──────────────────────────────────────────────────────

export function removeDailyChange(performanceId: string, changeId: string): void {
  const changes = getDailyChanges(performanceId).filter((c) => c.id !== changeId);
  writeJSON(KEYS.DAILY_CHANGES(performanceId), changes);
}

// ─── User Settings ──────────────────────────────────────────────────────────────

function defaultSettings(userId: string): UserSettings {
  return {
    id: genId(),
    userId,
    shiftStartTime: null,
    shiftEndTime: null,
    breakMinutes: 60,
    isSiteDay: true,
    theme: "system",
    baseSalary: null,
    taxRate: null,
    kpiPercentage: 70,
    transportAllowance: 0,
    transportApplied: true,
    internetAllowance: 0,
    seniorBonus: 0,
    languageAllowance: 0,
    salaryPaymentDay: 27,
    salaryDelayMonths: 1,
    kpiDelayMonths: 2,
    employeeType: "new",
    startMonth: null,
  };
}

export function getUserSettings(userId: string): UserSettings {
  const key = KEYS.USER_SETTINGS(userId);
  const existing = readJSON<UserSettings | null>(key, null);
  if (existing) return existing;

  const settings = defaultSettings(userId);
  writeJSON(key, settings);
  return settings;
}

export function updateUserSettings(
  userId: string,
  updates: Partial<Omit<UserSettings, "id" | "userId">>
): UserSettings {
  const key = KEYS.USER_SETTINGS(userId);
  const current = getUserSettings(userId);
  const updated: UserSettings = { ...current, ...updates };
  writeJSON(key, updated);
  return updated;
}

// ─── Local Auth ─────────────────────────────────────────────────────────────────

/** Simple hash for localStorage auth — NOT cryptographically secure, but adequate for local-only use. */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // Convert to 32-bit integer
  }
  return hash.toString(36);
}

export interface AuthResult {
  user: LocalUser;
  error: string | null;
}

/**
 * Sign up a new user. Stores email + hashed password in localStorage.
 */
export function signUp(email: string, password: string, displayName?: string): AuthResult {
  const users = readJSON<LocalUserWithHash[]>(KEYS.USERS, []);
  const existing = users.find((u) => u.email === email);

  if (existing) {
    return { user: { id: existing.id, email: existing.email, displayName: existing.displayName, createdAt: existing.createdAt }, error: "User already exists" };
  }

  const user: LocalUserWithHash = {
    id: genId(),
    email,
    displayName: displayName ?? null,
    passwordHash: simpleHash(password),
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeJSON(KEYS.USERS, users);

  // Auto sign in after signup
  const session = { userId: user.id, email: user.email, displayName: user.displayName, loggedInAt: new Date().toISOString() };
  writeJSON(KEYS.SESSION, session);

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
    error: null,
  };
}

/**
 * Sign in an existing user. Validates password hash.
 */
export function signIn(email: string, password: string): AuthResult {
  const users = readJSON<LocalUserWithHash[]>(KEYS.USERS, []);
  const user = users.find((u) => u.email === email);

  if (!user) {
    return { user: { id: "", email, displayName: null, createdAt: "" }, error: "User not found" };
  }

  if (user.passwordHash !== simpleHash(password)) {
    return { user: { id: "", email, displayName: null, createdAt: "" }, error: "Invalid password" };
  }

  const session = { userId: user.id, email: user.email, displayName: user.displayName, loggedInAt: new Date().toISOString() };
  writeJSON(KEYS.SESSION, session);

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
    error: null,
  };
}

/**
 * Sign out the current user.
 */
export function signOut(): void {
  removeItem(KEYS.SESSION);
}

/**
 * Get the current session, or null if not signed in.
 */
export function getSession(): { userId: string; email: string; displayName: string | null; loggedInAt: string } | null {
  return readJSON<{ userId: string; email: string; displayName: string | null; loggedInAt: string } | null>(KEYS.SESSION, null);
}

/**
 * Get a user by ID.
 */
export function getUserById(userId: string): LocalUser | null {
  const users = readJSON<LocalUserWithHash[]>(KEYS.USERS, []);
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  return { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt };
}

// ─── Floor Averages ─────────────────────────────────────────────────────────────

const FLOOR_DEFAULTS = {
  csat: 75,
  productivity: 75,
  fcr: 75,
  aht: 360, // 6 minutes in seconds
} as const;

function computeMetric(yourValue: number, floorAvg: number): FloorAverageMetric {
  const diff = yourValue - floorAvg;
  let status: "above" | "below" | "at";
  if (yourValue > floorAvg) status = "above";
  else if (yourValue < floorAvg) status = "below";
  else status = "at";
  return { yourValue, floorAvg, diff, status };
}

/**
 * Calculate Floor Average data for the 4 key metrics.
 *
 * CSAT = good / (good + bad) * 100
 * Productivity = channels (placeholder — real calc depends on business logic)
 * FCR = fcr field value (percentage)
 * AHT = aht field value (seconds)
 */
export function calculateFloorAverages(monthData: MonthData): FloorAverageData {
  const totalSurveys = monthData.good + monthData.bad;
  const csatValue = totalSurveys > 0
    ? Math.round((monthData.good / totalSurveys) * 100)
    : 0;

  // Productivity: use channels as a stand-in; in production this would be
  // based on calls/surveys per shift day logic.
  const productivityValue = monthData.channels;

  const fcrValue = monthData.fcr;
  const ahtValue = monthData.aht;

  return {
    csat: computeMetric(csatValue, FLOOR_DEFAULTS.csat),
    productivity: computeMetric(productivityValue, FLOOR_DEFAULTS.productivity),
    fcr: computeMetric(fcrValue, FLOOR_DEFAULTS.fcr),
    aht: computeMetric(ahtValue, FLOOR_DEFAULTS.aht),
  };
}

// ─── Leaderboard (mock) ────────────────────────────────────────────────────────

/**
 * Returns an empty leaderboard. In production, this would aggregate
 * across users — but local-only mode has no multi-user data.
 */
export function getLeaderboard(): LeaderboardEntry[] {
  return readJSON<LeaderboardEntry[]>(KEYS.LEADERBOARD, []);
}

// ─── Convenience: Full Month Snapshot ───────────────────────────────────────────

export interface MonthSnapshot {
  monthData: MonthData;
  tickets: Ticket[];
  genesysTickets: GenesysTicket[];
  dailyChanges: DailyChange[];
  floorAverages: FloorAverageData;
}

/**
 * Get a complete snapshot of all data for a given month.
 */
export function getMonthSnapshot(userId: string, year: number, month: number): MonthSnapshot {
  const monthData = getMonthData(userId, year, month);
  return {
    monthData,
    tickets: getTickets(monthData.id),
    genesysTickets: getGenesysTickets(monthData.id),
    dailyChanges: getDailyChanges(monthData.id),
    floorAverages: calculateFloorAverages(monthData),
  };
}

// ─── Convenience: Batch Update with Change Logging ──────────────────────────────

type MonthDataField = "good" | "bad" | "karmaBad" | "genesysGood" | "genesysBad" | "fcr" | "aht" | "channels" | "tickets";

/**
 * Update a single field in MonthData and automatically log a DailyChange entry.
 */
export function updateMonthField(
  userId: string,
  year: number,
  month: number,
  fieldName: MonthDataField,
  newValue: number,
  changeDate?: string,
  changeTime?: string
): { monthData: MonthData; change: DailyChange } {
  const current = getMonthData(userId, year, month);
  const oldValue = current[fieldName];

  const updated = updateMonthData(userId, year, month, { [fieldName]: newValue });

  const change = addDailyChange(current.id, userId, {
    fieldName,
    oldValue,
    newValue,
    changeAmount: newValue - oldValue,
    changeDate: changeDate ?? new Date().toISOString().slice(0, 10),
    changeTime: changeTime ?? null,
  });

  return { monthData: updated, change };
}

// ─── Reset / Clear ──────────────────────────────────────────────────────────────

/**
 * Clear all Green Tab data from localStorage (for debug/reset).
 */
export function clearAllData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}