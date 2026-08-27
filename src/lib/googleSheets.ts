/**
 * Green Tab — Team Data Provider
 *
 * Reads pre-fetched team data from /team-data.json (updated daily by fetch_team_data.py).
 * Falls back to Google Sheets CSV export only if the static file is unavailable.
 *
 * The Python script runs on the user's machine with their Chrome profile
 * (already logged in to Google) and saves the JSON to public/team-data.json.
 */

import { readJSON, writeJSON } from "./store";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamMemberRow {
  name: string;
  email: string;
  csat: number | null;
  productivity: number | null;
  fcr: number | null;
  aht: number | null;
  overallScore: number | null;
  floorAvgCsat: number;
  floorAvgProductivity: number;
  floorAvgFcr: number;
  floorAvgAht: number;
}

export interface TeamData {
  members: TeamMemberRow[];
  fetchedAt: string;
  monthLabel: string;
  floorAvg: {
    csat: number;
    productivity: number;
    fcr: number;
    aht: number;
  };
}

const CACHE_KEY = "gt_team_data_cache";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CachedTeamData {
  data: TeamData;
  fetchedAt: number;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch team data. Priority:
 * 1. localStorage cache (if fresh < 4h)
 * 2. /team-data.json (pre-fetched by Python script)
 * 3. localStorage cache (even if stale)
 */
export async function fetchTeamData(): Promise<TeamData> {
  // 1. Check localStorage cache
  try {
    const cached = readJSON<CachedTeamData | null>(CACHE_KEY, null);
    if (cached && cached.data && cached.data.members.length > 0) {
      const age = Date.now() - cached.fetchedAt;
      if (age < CACHE_TTL_MS) {
        return cached.data;
      }
    }
  } catch {
    // Cache corrupted
  }

  // 2. Try fetching from static JSON file (pre-fetched by Python script)
  try {
    const res = await fetch("/team-data.json", {
      cache: "no-cache",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data: TeamData = await res.json();
      if (data && data.members && data.members.length > 0) {
        // Cache it
        try {
          writeJSON(CACHE_KEY, { data, fetchedAt: Date.now() });
        } catch {}
        return data;
      }
    }
  } catch {
    // Static file not available — continue to fallback
  }

  // 3. Return stale cache if available
  try {
    const cached = readJSON<CachedTeamData | null>(CACHE_KEY, null);
    if (cached && cached.data && cached.data.members.length > 0) {
      return cached.data;
    }
  } catch {}

  // 4. Return empty data
  return {
    members: [],
    fetchedAt: new Date().toISOString(),
    monthLabel: "",
    floorAvg: { csat: 0, productivity: 0, fcr: 0, aht: 0 },
  };
}

/**
 * Force a fresh fetch (bypass cache).
 */
export async function refreshTeamData(): Promise<TeamData> {
  // Clear cache
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {}

  // Re-fetch from static file
  try {
    const res = await fetch("/team-data.json", {
      cache: "reload",
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data: TeamData = await res.json();
      if (data && data.members && data.members.length > 0) {
        try {
          writeJSON(CACHE_KEY, { data, fetchedAt: Date.now() });
        } catch {}
        return data;
      }
    }
  } catch {}

  return fetchTeamData();
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