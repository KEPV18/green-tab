/**
 * Green Tab — Team Data Provider
 *
 * PRIMARY SOURCE: Supabase (team_metrics table)
 * FALLBACK: /team-data.json (for development only)
 *
 * The Python fetch script upserts data into Supabase daily.
 * The frontend reads directly from Supabase — no Vercel redeployment needed.
 *
 * Chat AHT = "Average basket time" from Sheet19.
 * Genesys AHT = "Genesys Inbound AHT + ACW" (voice/call, always null currently).
 * These are DIFFERENT metrics and must NEVER be conflated.
 */

import { createClient, Client } from "@supabase/supabase-js";
import { readJSON, writeJSON } from "./store";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamMemberRow {
  name: string;
  email: string;
  csat: number | null;
  productivity: number | null;
  fcr: number | null;
  aht: number | null;          // Chat AHT = Average basket time
  chatAht: number | null;      // Same as aht (for compatibility)
  genesysAht: number | null;   // Voice/call AHT (always null currently)
  bambooId: string | null;
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

// ─── Supabase Client ──────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

let supabaseClient: Client | null = null;

function getSupabaseClient(): Client | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn("[googleSheets] Supabase credentials not configured");
    return null;
  }
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

// ─── Supabase Row Type ────────────────────────────────────────────────────────

interface SupabaseTeamMetric {
  id: string;
  month: string;
  report_date: string | null;
  agent_email: string;
  agent_name: string;
  bamboo_id: string | null;
  team_lead: string | null;
  csat: number | null;
  productivity: number | null;
  fcr: number | null;
  chat_aht: number | null;
  genesys_aht: number | null;
  chat_handling_time: number | null;
  avg_group_basket_time: number | null;
  escalation_rate: number | null;
  adherence: number | null;
  closed_after_resolution: number | null;
  closed_tickets_pct: number | null;
  deescalation_rate: number | null;
  occupancy: number | null;
  concurrency: number | null;
  irt_replier: number | null;
  shrinkage: number | null;
  utilization: number | null;
  source: string;
  fetched_at: string;
  created_at: string;
  updated_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CACHE_KEY = "gt_team_data_cache";
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

interface CachedTeamData {
  data: TeamData;
  fetchedAt: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeOverallScore(
  csat: number | null,
  productivity: number | null,
  fcr: number | null
): number | null {
  const scores = [csat, productivity, fcr].filter((v): v is number => v !== null);
  return scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
}

function computeFloorAvg(values: (number | null)[]): number {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length > 0 ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10 : 0;
}

function supabaseRowToMemberRow(row: SupabaseTeamMetric): TeamMemberRow {
  const aht = row.chat_aht; // Chat AHT = Average basket time
  return {
    name: row.agent_name || row.agent_email.split("@")[0],
    email: row.agent_email,
    csat: row.csat,
    productivity: row.productivity,
    fcr: row.fcr,
    aht: aht,
    chatAht: aht,                // Same as aht (for compatibility)
    genesysAht: row.genesys_aht, // Voice/call AHT (always null currently)
    bambooId: row.bamboo_id,
    overallScore: computeOverallScore(row.csat, row.productivity, row.fcr),
    floorAvgCsat: 0,  // Will be computed after all members are loaded
    floorAvgProductivity: 0,
    floorAvgFcr: 0,
    floorAvgAht: 0,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch team data. Priority:
 * 1. localStorage cache (if fresh < 4h)
 * 2. Supabase (primary source)
 * 3. /team-data.json (fallback for development)
 * 4. localStorage cache (even if stale)
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

  // 2. Try Supabase (primary source)
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("team_metrics")
        .select("*")
        .order("agent_name");

      if (!error && data && data.length > 0) {
        const members = (data as SupabaseTeamMetric[]).map(supabaseRowToMemberRow);

        // Compute floor averages
        const floorAvgCsat = computeFloorAvg(members.map((m) => m.csat));
        const floorAvgProductivity = computeFloorAvg(members.map((m) => m.productivity));
        const floorAvgFcr = computeFloorAvg(members.map((m) => m.fcr));
        const floorAvgAht = computeFloorAvg(members.map((m) => m.aht));

        // Assign floor averages to each member
        for (const m of members) {
          m.floorAvgCsat = floorAvgCsat;
          m.floorAvgProductivity = floorAvgProductivity;
          m.floorAvgFcr = floorAvgFcr;
          m.floorAvgAht = floorAvgAht;
        }

        // Sort by overall score descending
        members.sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

        // Determine month label from data
        const monthLabel = data[0]?.month || new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

        const teamData: TeamData = {
          members,
          fetchedAt: new Date().toISOString(),
          monthLabel,
          floorAvg: {
            csat: floorAvgCsat,
            productivity: floorAvgProductivity,
            fcr: floorAvgFcr,
            aht: floorAvgAht,
          },
        };

        // Cache it
        try {
          writeJSON(CACHE_KEY, { data: teamData, fetchedAt: Date.now() });
        } catch {}

        return teamData;
      }
    } catch (err) {
      console.warn("[googleSheets] Supabase fetch failed:", err);
    }
  }

  // 3. Try static JSON file (fallback for development/offline)
  try {
    const res = await fetch("/team-data.json", {
      cache: "no-cache",
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
  } catch {
    // Static file not available
  }

  // 4. Return stale cache if available
  try {
    const cached = readJSON<CachedTeamData | null>(CACHE_KEY, null);
    if (cached && cached.data && cached.data.members.length > 0) {
      return cached.data;
    }
  } catch {}

  // 5. Return empty data
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

  // Re-fetch from Supabase first
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("team_metrics")
        .select("*")
        .order("agent_name");

      if (!error && data && data.length > 0) {
        const members = (data as SupabaseTeamMetric[]).map(supabaseRowToMemberRow);
        const floorAvgCsat = computeFloorAvg(members.map((m) => m.csat));
        const floorAvgProductivity = computeFloorAvg(members.map((m) => m.productivity));
        const floorAvgFcr = computeFloorAvg(members.map((m) => m.fcr));
        const floorAvgAht = computeFloorAvg(members.map((m) => m.aht));

        for (const m of members) {
          m.floorAvgCsat = floorAvgCsat;
          m.floorAvgProductivity = floorAvgProductivity;
          m.floorAvgFcr = floorAvgFcr;
          m.floorAvgAht = floorAvgAht;
        }

        members.sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

        const monthLabel = (data as SupabaseTeamMetric[])[0]?.month || new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

        const teamData: TeamData = {
          members,
          fetchedAt: new Date().toISOString(),
          monthLabel,
          floorAvg: { csat: floorAvgCsat, productivity: floorAvgProductivity, fcr: floorAvgFcr, aht: floorAvgAht },
        };

        try {
          writeJSON(CACHE_KEY, { data: teamData, fetchedAt: Date.now() });
        } catch {}

        return teamData;
      }
    } catch (err) {
      console.warn("[googleSheets] Supabase refresh failed:", err);
    }
  }

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