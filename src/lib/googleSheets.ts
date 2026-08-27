/**
 * Google Sheets integration for Green Tab Team Dashboard.
 *
 * Fetches team performance data from a public Google Sheet (CSV export).
 * The sheet has TWO tables stacked vertically:
 *   - Table 1 (upper): CSAT, Productivity, FCR
 *   - Table 2 (lower): AHT
 *
 * Each table has columns like: Name, [metric values...], Average
 * We match rows by email or display name to the logged-in user.
 */

import { readJSON, writeJSON } from "./store";

// ─── Config ────────────────────────────────────────────────────────────────────
const SHEET_ID = "1O3WHz1gphUvoBLdQlJ9sT5pWBlgrjASwGFpgO-0qRmw";
const SHEET_GID = "87009911";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

const CACHE_KEY = "gt_team_data_cache";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamMemberRow {
  /** Agent name as it appears in the sheet */
  name: string;
  /** Email if available in sheet, otherwise empty */
  email: string;
  /** CSAT score percentage */
  csat: number | null;
  /** Productivity score percentage */
  productivity: number | null;
  /** FCR score percentage */
  fcr: number | null;
  /** AHT in seconds */
  aht: number | null;
  /** Overall weighted score (computed) */
  overallScore: number | null;
  /** Floor average for this metric (computed from all team members) */
  floorAvgCsat: number;
  floorAvgProductivity: number;
  floorAvgFcr: number;
  floorAvgAht: number;
}

export interface TeamData {
  /** All team member rows parsed from the sheet */
  members: TeamMemberRow[];
  /** When this data was fetched */
  fetchedAt: string;
  /** Month label from sheet header (e.g. "August 2026") */
  monthLabel: string;
  /** Overall floor averages across all members */
  floorAvg: {
    csat: number;
    productivity: number;
    fcr: number;
    aht: number;
  };
}

// ─── CSV Parsing ──────────────────────────────────────────────────────────────

function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = "";
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && i + 1 < csv.length && csv[i + 1] === '\n') {
          i++;
        }
        row.push(current.trim());
        if (row.some((c) => c.length > 0)) {
          rows.push(row);
        }
        row = [];
        current = "";
      } else {
        current += ch;
      }
    }
  }
  // Last field
  row.push(current.trim());
  if (row.some((c) => c.length > 0)) {
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a number from a cell that might contain "%", "s" suffix, or be empty.
 */
function parseNum(val: string): number | null {
  if (!val || val.trim() === "" || val === "-" || val === "N/A") return null;
  const cleaned = val.replace(/[%s]/g, "").replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/**
 * Find which column contains a keyword (case-insensitive partial match).
 */
function findCol(headers: string[], keyword: string): number {
  const lower = keyword.toLowerCase();
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].toLowerCase().includes(lower)) return i;
  }
  return -1;
}

// ─── Fetch & Parse ────────────────────────────────────────────────────────────

async function fetchSheetCSV(): Promise<string> {
  const res = await fetch(CSV_URL, {
    redirect: "follow",
    headers: { Accept: "text/csv" },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch sheet: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

/**
 * Parse the two-table sheet into team member rows.
 *
 * The sheet has two tables stacked vertically:
 *   - Table 1: Name | CSAT | Productivity | FCR | Average
 *   - Table 2: Name | AHT | Average
 *
 * We parse both tables and merge by name.
 */
function parseSheetData(csv: string): TeamData {
  const rows = parseCSV(csv);
  if (rows.length < 2) {
    return { members: [], fetchedAt: new Date().toISOString(), monthLabel: "", floorAvg: { csat: 0, productivity: 0, fcr: 0, aht: 0 } };
  }

  // ── Find the header row for Table 1 (CSAT/Productivity/FCR) ──
  let table1HeaderIdx = -1;
  let table2HeaderIdx = -1;

  for (let i = 0; i < rows.length; i++) {
    const joined = rows[i].join(" ").toLowerCase();
    if (table1HeaderIdx === -1 && (joined.includes("csat") || joined.includes("productivity") || joined.includes("fcr"))) {
      table1HeaderIdx = i;
    }
    if (joined.includes("aht") && table1HeaderIdx !== -1 && table2HeaderIdx === -1 && i > table1HeaderIdx) {
      table2HeaderIdx = i;
    }
  }

  // Fallback: first row is header if we didn't find keywords
  if (table1HeaderIdx === -1) table1HeaderIdx = 0;

  const headers1 = rows[table1HeaderIdx];

  // Extract month label from the very first row (often a title row like "August 2026 Performance")
  let monthLabel = "";
  const titleRow = rows[0];
  if (titleRow && titleRow.length > 0) {
    monthLabel = titleRow[0] || "";
    // Try to find a month name in the first 3 rows
    for (let i = 0; i < Math.min(3, rows.length); i++) {
      const text = rows[i].join(" ");
      const monthMatch = text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4}/i);
      if (monthMatch) {
        monthLabel = monthMatch[0];
        break;
      }
    }
  }

  // Column indices for Table 1
  const name1Col = findCol(headers1, "name") !== -1 ? findCol(headers1, "name") : findCol(headers1, "agent");
  const csatCol = findCol(headers1, "csat");
  const prodCol = findCol(headers1, "productivity") !== -1 ? findCol(headers1, "productivity") : findCol(headers1, "prod");
  const fcrCol = findCol(headers1, "fcr");
  const email1Col = findCol(headers1, "email");

  // ── Parse Table 1 data rows ──
  const memberMap = new Map<string, { csat: number | null; productivity: number | null; fcr: number | null; email: string }>();

  const data1Start = table1HeaderIdx + 1;
  const data1End = table2HeaderIdx !== -1 ? table2HeaderIdx : rows.length;

  const csatValues: number[] = [];
  const prodValues: number[] = [];
  const fcrValues: number[] = [];

  for (let i = data1Start; i < data1End; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const name = (name1Col !== -1 ? row[name1Col] : row[0]).trim();
    if (!name || name.toLowerCase().includes("average") || name.toLowerCase().includes("total") || name.toLowerCase().includes("floor")) continue;

    const csat = csatCol !== -1 ? parseNum(row[csatCol]) : null;
    const productivity = prodCol !== -1 ? parseNum(row[prodCol]) : null;
    const fcr = fcrCol !== -1 ? parseNum(row[fcrCol]) : null;
    const email = email1Col !== -1 ? (row[email1Col] || "").trim() : "";

    memberMap.set(name.toLowerCase(), { csat, productivity, fcr, email });

    if (csat !== null) csatValues.push(csat);
    if (productivity !== null) prodValues.push(productivity);
    if (fcr !== null) fcrValues.push(fcr);
  }

  // ── Parse Table 2 (AHT) ──
  const ahtValues: number[] = [];

  if (table2HeaderIdx !== -1) {
    const headers2 = rows[table2HeaderIdx];
    const name2Col = findCol(headers2, "name") !== -1 ? findCol(headers2, "name") : findCol(headers2, "agent");
    const ahtCol = findCol(headers2, "aht");

    for (let i = table2HeaderIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;
      const name = (name2Col !== -1 ? row[name2Col] : row[0]).trim();
      if (!name || name.toLowerCase().includes("average") || name.toLowerCase().includes("total") || name.toLowerCase().includes("floor")) continue;

      const aht = ahtCol !== -1 ? parseNum(row[ahtCol]) : null;

      const key = name.toLowerCase();
      const existing = memberMap.get(key);
      if (existing) {
        existing.aht = aht; // We'll add aht to the type later
        (existing as any).aht = aht;
      } else {
        memberMap.set(key, { csat: null, productivity: null, fcr: null, email: "", aht } as any);
      }

      if (aht !== null) ahtValues.push(aht);
    }
  }

  // ── Compute floor averages ──
  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const floorAvg = {
    csat: Math.round(avg(csatValues) * 10) / 10,
    productivity: Math.round(avg(prodValues) * 10) / 10,
    fcr: Math.round(avg(fcrValues) * 10) / 10,
    aht: Math.round(avg(ahtValues) * 10) / 10,
  };

  // ── Build TeamMemberRow[] ──
  const members: TeamMemberRow[] = [];
  for (const [nameLower, data] of memberMap) {
    const displayName = nameLower.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    // Compute overall score: weighted average of available metrics
    const scores: number[] = [];
    if (data.csat !== null) scores.push(data.csat);
    if (data.productivity !== null) scores.push(data.productivity);
    if (data.fcr !== null) scores.push(data.fcr);
    const aht = (data as any).aht as number | null;
    // For AHT, lower is better. Normalize: if floor avg is 360s and person has 340s, score = 100 * (360/340)
    // Simple approach: include AHT as-is for now (higher = worse for AHT)
    const overallScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : null;

    members.push({
      name: displayName,
      email: data.email,
      csat: data.csat,
      productivity: data.productivity,
      fcr: data.fcr,
      aht: aht ?? null,
      overallScore,
      floorAvgCsat: floorAvg.csat,
      floorAvgProductivity: floorAvg.productivity,
      floorAvgFcr: floorAvg.fcr,
      floorAvgAht: floorAvg.aht,
    });
  }

  return {
    members,
    fetchedAt: new Date().toISOString(),
    monthLabel,
    floorAvg,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

interface CachedTeamData {
  data: TeamData;
  fetchedAt: number;
}

/**
 * Fetch team data from the Google Sheet.
 * Uses a 4-hour cache to avoid hitting Google on every page load.
 */
export async function fetchTeamData(): Promise<TeamData> {
  // Check cache first
  try {
    const cached = readJSON<CachedTeamData | null>(CACHE_KEY, null);
    if (cached && cached.data && cached.data.members.length > 0) {
      const age = Date.now() - cached.fetchedAt;
      if (age < CACHE_TTL_MS) {
        return cached.data;
      }
    }
  } catch {
    // Cache corrupted, refetch
  }

  // Fetch fresh data
  try {
    const csv = await fetchSheetCSV();
    const data = parseSheetData(csv);

    // Cache it
    try {
      writeJSON(CACHE_KEY, { data, fetchedAt: Date.now() });
    } catch {
      // Cache write failed (localStorage unavailable) — non-fatal
    }

    return data;
  } catch (err) {
    // Network error — try to return stale cache if available
    try {
      const cached = readJSON<CachedTeamData | null>(CACHE_KEY, null);
      if (cached && cached.data && cached.data.members.length > 0) {
        return cached.data;
      }
    } catch {
      // Stale cache also unavailable
    }
    throw err;
  }
}

/**
 * Find the current user's row in the team data by matching email or display name.
 */
export function findMyRow(
  teamData: TeamData,
  userEmail: string,
  userDisplayName: string | null
): TeamMemberRow | null {
  const emailLower = userEmail.toLowerCase();
  const nameLower = (userDisplayName || "").toLowerCase();

  // Try exact email match first
  let match = teamData.members.find((m) => m.email && m.email.toLowerCase() === emailLower);
  if (match) return match;

  // Try exact name match
  if (nameLower) {
    match = teamData.members.find((m) => m.name.toLowerCase() === nameLower);
    if (match) return match;
  }

  // Try partial name match (first name or last name)
  if (nameLower) {
    const parts = nameLower.split(" ");
    match = teamData.members.find((m) => {
      const mParts = m.name.toLowerCase().split(" ");
      return parts.some((p) => mParts.some((mp) => mp === p || mp.startsWith(p)));
    });
    if (match) return match;
  }

  // Try email username (before @) as name match
  const emailUser = emailLower.split("@")[0];
  if (emailUser) {
    match = teamData.members.find((m) => {
      const mName = m.name.toLowerCase().replace(/\s+/g, "");
      const eUser = emailUser.replace(/[._]/g, "");
      return mName.includes(eUser) || eUser.includes(mName);
    });
    if (match) return match;
  }

  return null;
}

/**
 * Force a fresh fetch (bypass cache).
 */
export async function refreshTeamData(): Promise<TeamData> {
  try {
    const cached = readJSON<CachedTeamData | null>(CACHE_KEY, null);
    if (cached) {
      // Clear cache
      try { localStorage.removeItem(`gt_${CACHE_KEY}`); } catch {}
    }
  } catch {}
  return fetchTeamData();
}