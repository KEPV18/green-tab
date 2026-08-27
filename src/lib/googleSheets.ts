/**
 * Green Tab — Team Data Provider
 *
 * PRIMARY SOURCE: Supabase (team_metrics table)
 * FALLBACK: /team-data.json (for development only)
 *
 * The Python fetch script upserts data into Supabase daily.
 * The frontend reads directly from Supabase — no Vercel redeployment needed.
 *
 * MAPPING DOCUMENTATION (Source → DB → Frontend):
 * ─────────────────────────────────────────────────────────────────
 * Google Sheet "CSAT %" (Tab 0 Col 2)          → csat              → CSAT
 * Google Sheet "Productivity 8-hrs" (Sheet19)   → productivity      → Productivity
 * Google Sheet "FCR, %" (Tab 0 Col 8)           → fcr               → FCR
 * Google Sheet "Average basket time" (Sheet19)   → chat_aht         → ABT (Average Basket Time)
 * Google Sheet "Closed tickets, %" (Tab 0 Col 8) → closed_tickets_pct → Close Rate ⚠️ NOT "Closed After Resolution"
 * Google Sheet "Average handling time" (Sheet19) → chat_handling_time → Avg Handling Time
 * Google Sheet "Adherence, %" (Sheet19)          → adherence         → Adherence
 * Google Sheet "IRT 2 replier" (Sheet19)         → irt_replier       → IRT
 * Google Sheet "Closed after resolution, %"      → closed_after_resolution → Closed After Resolution (SEPARATE from Close Rate)
 * Google Sheet "Escalation rate %" (Sheet19)     → escalation_rate   → Escalation Rate
 * Google Sheet "Deescalation rate %" (Tab 0/19)  → deescalation_rate → De-escalation Rate
 * Google Sheet "Occupancy daily, %" (Sheet19)    → occupancy         → Occupancy
 * Google Sheet "Concurrency" (Sheet19)            → concurrency       → Concurrency
 * Google Sheet "Average group basket time" (Sheet19) → avg_group_basket_time → Avg Group Basket Time
 * Google Sheet "Shrinkage - agent - unplanned" (Sheet19) → shrinkage  → Shrinkage
 * Google Sheet "Utilization daily, %" (Sheet19)   → utilization       → Utilization
 * Google Sheet "Genesys Inbound AHT + ACW"       → genesys_aht       → Genesys AHT (voice, NOT chat)
 *
 * ⚠️ CRITICAL: Close Rate = "Closed tickets, %" = closed_tickets_pct
 *    NOT "Closed After Resolution" = closed_after_resolution
 *    These are DIFFERENT metrics.
 *
 * TEAM FILTERING:
 * ─────────────────────────────────────────────────────────────────
 * The Chat Team ranking EXCLUDES:
 * - Abdallah Abdallah (abdallah.abdallah@tabby.ai) — PHONE only
 * - Mohamed Mohamed (mohamed.mohamed.27@tabby.ai) — CONSULTATION team
 * - Ahmed Elkhodary (ahmed.radwan@tabby.ai) — TERMINATED
 * - Abdullah Riad (abdullah.mohamed@tabby.ai) — TERMINATED
 */

import { createClient, Client } from "@supabase/supabase-js";
import { readJSON, writeJSON } from "./store";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamMemberRow {
  name: string;
  email: string;
  bambooId: string | null;
  // Primary ranking metrics
  productivity: number | null;     // Productivity 8-hrs
  csat: number | null;             // CSAT % (percentage, NOT raw count)
  aht: number | null;              // ABT = Average Basket Time (lower is better)
  closeRate: number | null;         // Close Rate = "Closed tickets, %" (NOT "Closed After Resolution")
  // Additional metrics
  fcr: number | null;              // FCR %
  chatAht: number | null;          // Same as aht (for compatibility)
  chatHandlingTime: number | null; // Average Handling Time
  genesysAht: number | null;       // Voice/call AHT (always null currently)
  adherence: number | null;        // Adherence %
  irtReplier: number | null;       // IRT 2 Replier
  closedAfterResolution: number | null; // Closed After Resolution % (SEPARATE from Close Rate)
  escalationRate: number | null;    // Escalation Rate %
  deescalationRate: number | null;  // De-escalation Rate %
  occupancy: number | null;        // Occupancy %
  concurrency: number | null;      // Concurrency
  avgGroupBasketTime: number | null; // Average Group Basket Time
  shrinkage: number | null;        // Shrinkage %
  utilization: number | null;      // Utilization %
  // Computed
  overallScore: number | null;
  // Floor averages
  floorAvgProductivity: number;
  floorAvgCsat: number;
  floorAvgAht: number;
  floorAvgCloseRate: number;
}

export interface TeamData {
  members: TeamMemberRow[];
  fetchedAt: string;
  monthLabel: string;
  floorAvg: {
    productivity: number;
    csat: number;
    aht: number;
    closeRate: number;
    fcr: number;
  };
}

// ─── Team Filtering ────────────────────────────────────────────────────────────

/**
 * Emails excluded from the Chat Team ranking.
 * These agents are either PHONE-only, CONSULTATION team, or TERMINATED.
 * They remain in the database for historical purposes but are hidden from the active ranking.
 */
const EXCLUDED_FROM_CHAT_TEAM: Record<string, string> = {
  "abdallah.abdallah@tabby.ai": "PHONE team only",
  "mohamed.mohamed.27@tabby.ai": "CONSULTATION team",
  "ahmed.radwan@tabby.ai": "TERMINATED",
  "abdullah.mohamed@tabby.ai": "TERMINATED",
};

/**
 * Filter a list of team members to show only active Chat team agents.
 */
export function filterChatTeam(members: TeamMemberRow[]): TeamMemberRow[] {
  return members.filter((m) => !EXCLUDED_FROM_CHAT_TEAM[m.email]);
}

/**
 * Get the exclusion reason for an agent, or null if not excluded.
 */
export function getExclusionReason(email: string): string | null {
  return EXCLUDED_FROM_CHAT_TEAM[email] ?? null;
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

// ─── Ranking Formula ──────────────────────────────────────────────────────────

/**
 * Compute overall ranking score for a Chat team member.
 *
 * Primary metrics (in priority order):
 * 1. Productivity (higher is better) — weight 35%
 * 2. CSAT (higher is better) — weight 30%
 * 3. Close Rate / "Closed tickets, %" (higher is better) — weight 20%
 * 4. ABT / Average Basket Time (LOWER is better) — weight 15%
 *
 * Each metric is normalized against the floor average (0.5 = at average).
 * For ABT, the normalization inverts because lower is better.
 * Missing metrics contribute 0 to the score.
 */
export function computeOverallScore(
  productivity: number | null,
  csat: number | null,
  closeRate: number | null,
  aht: number | null,
  floorAvgProductivity: number,
  floorAvgCsat: number,
  floorAvgCloseRate: number,
  floorAvgAht: number,
): number | null {
  const scores: number[] = [];
  const weights: number[] = [];

  // Productivity (35%) — higher is better
  if (productivity !== null && floorAvgProductivity > 0) {
    scores.push(Math.min(productivity / floorAvgProductivity, 2)); // Cap at 2x
    weights.push(0.35);
  }

  // CSAT (30%) — higher is better
  if (csat !== null && floorAvgCsat > 0) {
    scores.push(Math.min(csat / floorAvgCsat, 2));
    weights.push(0.30);
  }

  // Close Rate (20%) — higher is better
  if (closeRate !== null && floorAvgCloseRate > 0) {
    scores.push(Math.min(closeRate / floorAvgCloseRate, 2));
    weights.push(0.20);
  }

  // ABT (15%) — LOWER is better, so we invert
  if (aht !== null && floorAvgAht > 0 && aht > 0) {
    scores.push(Math.min(floorAvgAht / aht, 2)); // Inverted: lower AHT = higher score
    weights.push(0.15);
  }

  if (scores.length === 0) return null;

  // Weighted average
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const weightedScore = scores.reduce((sum, s, i) => sum + s * weights[i], 0);
  return Math.round((weightedScore / totalWeight) * 100) / 100;
}

function computeFloorAvg(values: (number | null)[]): number {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length > 0 ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10 : 0;
}

function supabaseRowToMemberRow(row: SupabaseTeamMetric): TeamMemberRow {
  const aht = row.chat_aht; // ABT = Average Basket Time (NOT Genesys AHT)
  const closeRate = row.closed_tickets_pct; // ⚠️ "Closed tickets, %" — NOT "Closed After Resolution"

  return {
    name: row.agent_name || row.agent_email.split("@")[0],
    email: row.agent_email,
    bambooId: row.bamboo_id,
    // Primary ranking metrics
    productivity: row.productivity,
    csat: row.csat,
    aht: aht,
    closeRate: closeRate,
    // Additional metrics
    fcr: row.fcr,
    chatAht: aht,                          // Same as aht (for compatibility)
    chatHandlingTime: row.chat_handling_time,
    genesysAht: row.genesys_aht,
    adherence: row.adherence,
    irtReplier: row.irt_replier,
    closedAfterResolution: row.closed_after_resolution, // SEPARATE from Close Rate
    escalationRate: row.escalation_rate,
    deescalationRate: row.deescalation_rate,
    occupancy: row.occupancy,
    concurrency: row.concurrency,
    avgGroupBasketTime: row.avg_group_basket_time,
    shrinkage: row.shrinkage,
    utilization: row.utilization,
    // Computed (will be filled after floor averages)
    overallScore: null,
    floorAvgProductivity: 0,
    floorAvgCsat: 0,
    floorAvgAht: 0,
    floorAvgCloseRate: 0,
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
      const data = await fetchFromSupabase(supabase);
      if (data) return data;
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
    floorAvg: { productivity: 0, csat: 0, aht: 0, closeRate: 0, fcr: 0 },
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
      const data = await fetchFromSupabase(supabase);
      if (data) return data;
    } catch (err) {
      console.warn("[googleSheets] Supabase refresh failed:", err);
    }
  }

  return fetchTeamData();
}

/**
 * Fetch and process team data from Supabase.
 */
async function fetchFromSupabase(client: Client): Promise<TeamData | null> {
  const { data, error } = await client
    .from("team_metrics")
    .select("*")
    .order("agent_name");

  if (error || !data || data.length === 0) return null;

  const members = (data as SupabaseTeamMetric[]).map(supabaseRowToMemberRow);

  // Compute floor averages (over ALL members, including excluded ones for context)
  const allMembers = members;
  const floorAvgProductivity = computeFloorAvg(allMembers.map((m) => m.productivity));
  const floorAvgCsat = computeFloorAvg(allMembers.map((m) => m.csat));
  const floorAvgAht = computeFloorAvg(allMembers.map((m) => m.aht));
  const floorAvgCloseRate = computeFloorAvg(allMembers.map((m) => m.closeRate));
  const floorAvgFcr = computeFloorAvg(allMembers.map((m) => m.fcr));

  // Assign floor averages and compute overall scores for ALL members
  for (const m of allMembers) {
    m.floorAvgProductivity = floorAvgProductivity;
    m.floorAvgCsat = floorAvgCsat;
    m.floorAvgAht = floorAvgAht;
    m.floorAvgCloseRate = floorAvgCloseRate;
    m.overallScore = computeOverallScore(
      m.productivity, m.csat, m.closeRate, m.aht,
      floorAvgProductivity, floorAvgCsat, floorAvgCloseRate, floorAvgAht,
    );
  }

  // Determine month label from data
  const monthLabel = (data as SupabaseTeamMetric[])[0]?.month || new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const teamData: TeamData = {
    members: allMembers,
    fetchedAt: new Date().toISOString(),
    monthLabel,
    floorAvg: {
      productivity: floorAvgProductivity,
      csat: floorAvgCsat,
      aht: floorAvgAht,
      closeRate: floorAvgCloseRate,
      fcr: floorAvgFcr,
    },
  };

  // Cache it
  try {
    writeJSON(CACHE_KEY, { data: teamData, fetchedAt: Date.now() });
  } catch {}

  return teamData;
}

/**
 * Find the current user's row in the team data by matching email or display name.
 */
export function findMyRow(
  teamData: TeamData,
  userEmail: string,
  userDisplayName: string | null,
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