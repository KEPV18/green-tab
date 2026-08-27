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
 * Google Sheet "CSAT %" (Tab 0 Col 2)            → csat                      → CSAT
 * Google Sheet "Productivity 8-hrs" (Sheet19)    → productivity               → Productivity
 * Google Sheet "Escalation rate %" (Sheet19)      → escalation_rate            → Escalation Rate
 * Google Sheet "Adherence, %" (Sheet19)           → adherence                  → Adherence
 * Google Sheet "Average basket time" (Sheet19)     → chat_aht                   → ABT (Average Basket Time)
 * Google Sheet "IRT 2 replier" (Sheet19)           → irt_replier                → IRT 2 Replier
 * Google Sheet "FCR, %" (Tab 0 Col 8)             → fcr                        → FCR
 * Google Sheet "Closed after resolution, %"         → closed_after_resolution    → Closed After Resolution
 * Google Sheet "Break exceed" (Sheet19)            → break_exceed               → Break Exceed
 * Google Sheet "Idle time" (Sheet19)               → idle_time                  → Idle Time
 * Google Sheet "Deescalation rate %" (Tab 0/19)    → deescalation_rate          → De-escalation Rate
 * Google Sheet "Occupancy daily, %" (Sheet19)       → occupancy                  → Occupancy
 * Google Sheet "Average group basket time" (Sheet19) → avg_group_basket_time      → Avg Group Basket Time
 * Google Sheet "Closed tickets, %" (Tab 0 Col 8)   → closed_tickets_pct          → Close Rate
 *
 * ⚠️ CRITICAL: Close Rate = "Closed tickets, %" = closed_tickets_pct
 *    NOT "Closed After Resolution" = closed_after_resolution
 *    These are DIFFERENT metrics.
 *
 * RANKING: CSAT % only, highest → lowest.
 * FLOOR AVERAGES: Computed over active Chat team members only (4 excluded).
 *
 * RANKING DIRECTIONS:
 * ─────────────────────────────────────────────────────────────────
 * Higher is better: CSAT, Productivity, FCR, Close Rate, Adherence,
 *   De-escalation Rate, Occupancy, Utilization, Closed After Resolution
 * Lower is better: ABT, Escalation Rate, IRT, Break Exceed, Idle Time,
 *   Chat Handling Time, Avg Group Basket Time, Shrinkage, Concurrency
 *
 * TEAM FILTERING:
 * ─────────────────────────────────────────────────────────────────
 * EXCLUDED from Chat Team ranking:
 * - Abdallah Abdallah (abdallah.abdallah@tabby.ai) — PHONE only
 * - Mohamed Mohamed (mohamed.mohamed.27@tabby.ai) — CONSULTATION team
 * - Ahmed Elkhodary (ahmed.radwan@tabby.ai) — TERMINATED
 * - Abdullah Riad (abdullah.mohamed@tabby.ai) — TERMINATED
 *
 * NEVER DISPLAY: Bamboo ID, Queue, ID_Name, Batch, Citrix user
 * IDENTIFY AGENTS BY: Email only (except logged-in user → use display name)
 */

import { createClient, Client } from "@supabase/supabase-js";
import { readJSON, writeJSON } from "./store";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamMemberRow {
  email: string;
  name: string;
  // Primary ranking metric
  csat: number | null;             // CSAT %
  productivity: number | null;     // Productivity 8-hrs
  escalationRate: number | null;   // Escalation Rate %
  adherence: number | null;        // Adherence %
  aht: number | null;              // ABT = Average Basket Time (lower is better)
  irtReplier: number | null;       // IRT 2 Replier (lower is better)
  fcr: number | null;              // FCR %
  closedAfterResolution: number | null; // Closed After Resolution %
  breakExceed: number | null;      // Break Exceed (lower is better)
  idleTime: number | null;          // Idle Time (lower is better)
  deescalationRate: number | null;  // De-escalation Rate %
  occupancy: number | null;        // Occupancy daily %
  avgGroupBasketTime: number | null; // Average Group Basket Time (lower is better)
  closeRate: number | null;         // Close Rate = "Closed tickets, %"
  // Additional metrics kept for compatibility but not in main display
  chatAht: number | null;          // Same as aht
  chatHandlingTime: number | null;
  genesysAht: number | null;
  concurrency: number | null;
  shrinkage: number | null;
  utilization: number | null;
  bambooId: string | null;         // kept for data, NEVER displayed to user
  // Computed rankings (per-metric rank among chat team)
  rankCsat: number | null;
  // Floor averages (all metrics)
  floorAvgProductivity: number;
  floorAvgCsat: number;
  floorAvgAht: number;
  floorAvgCloseRate: number;
  floorAvgFcr: number;
  floorAvgEscalationRate: number;
  floorAvgAdherence: number;
  floorAvgIrtReplier: number;
  floorAvgClosedAfterResolution: number;
  floorAvgDeescalationRate: number;
  floorAvgOccupancy: number;
  floorAvgAvgGroupBasketTime: number;
  floorAvgBreakExceed: number;
  floorAvgIdleTime: number;
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
    escalationRate: number;
    adherence: number;
    irtReplier: number;
    closedAfterResolution: number;
    deescalationRate: number;
    occupancy: number;
    avgGroupBasketTime: number;
    breakExceed: number;
    idleTime: number;
  };
}

// ─── Team Filtering ────────────────────────────────────────────────────────────

/**
 * Emails excluded from the Chat Team ranking and floor averages.
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
  break_exceed: number | null;
  idle_time: number | null;
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

// ─── Helper: compute floor average of non-null values ──────────────────────────

function computeFloorAvg(values: (number | null)[]): number {
  const valid = values.filter((v): v is number => v !== null);
  return valid.length > 0 ? Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10 : 0;
}

// ─── Helper: assign per-metric CSAT rank (1 = best = highest CSAT) ─────────────

function assignCsatRanks(members: TeamMemberRow[]): void {
  const sorted = [...members]
    .filter((m) => m.csat !== null)
    .sort((a, b) => (b.csat ?? 0) - (a.csat ?? 0)); // highest CSAT first
  for (const m of members) {
    if (m.csat === null) {
      m.rankCsat = null;
    } else {
      m.rankCsat = sorted.findIndex((s) => s.email === m.email) + 1;
    }
  }
}

function supabaseRowToMemberRow(row: SupabaseTeamMetric): TeamMemberRow {
  const aht = row.chat_aht;
  const closeRate = row.closed_tickets_pct; // ⚠️ NOT "Closed After Resolution"

  return {
    email: row.agent_email,
    name: row.agent_name || row.agent_email.split("@")[0],
    bambooId: row.bamboo_id,
    csat: row.csat,
    productivity: row.productivity,
    escalationRate: row.escalation_rate,
    adherence: row.adherence,
    aht: aht,
    irtReplier: row.irt_replier,
    fcr: row.fcr,
    closedAfterResolution: row.closed_after_resolution,
    breakExceed: row.break_exceed ?? null,
    idleTime: row.idle_time ?? null,
    deescalationRate: row.deescalation_rate,
    occupancy: row.occupancy,
    avgGroupBasketTime: row.avg_group_basket_time,
    closeRate: closeRate,
    chatAht: aht,
    chatHandlingTime: row.chat_handling_time,
    genesysAht: row.genesys_aht,
    concurrency: row.concurrency,
    shrinkage: row.shrinkage,
    utilization: row.utilization,
    // Computed (will be filled after floor averages and ranking)
    rankCsat: null,
    floorAvgProductivity: 0,
    floorAvgCsat: 0,
    floorAvgAht: 0,
    floorAvgCloseRate: 0,
    floorAvgFcr: 0,
    floorAvgEscalationRate: 0,
    floorAvgAdherence: 0,
    floorAvgIrtReplier: 0,
    floorAvgClosedAfterResolution: 0,
    floorAvgDeescalationRate: 0,
    floorAvgOccupancy: 0,
    floorAvgAvgGroupBasketTime: 0,
    floorAvgBreakExceed: 0,
    floorAvgIdleTime: 0,
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

  // 2. Try Supabase
  const supabase = getSupabaseClient();
  if (supabase) {
    try {
      const data = await fetchFromSupabase(supabase);
      if (data) return data;
    } catch (err) {
      console.warn("[googleSheets] Supabase fetch failed:", err);
    }
  }

  // 3. Try static JSON file
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
    floorAvg: {
      productivity: 0, csat: 0, aht: 0, closeRate: 0, fcr: 0,
      escalationRate: 0, adherence: 0, irtReplier: 0, closedAfterResolution: 0,
      deescalationRate: 0, occupancy: 0, avgGroupBasketTime: 0, breakExceed: 0, idleTime: 0,
    },
  };
}

/**
 * Force a fresh fetch (bypass cache).
 */
export async function refreshTeamData(): Promise<TeamData> {
  try { localStorage.removeItem(CACHE_KEY); } catch {}

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
 * Fetch from Supabase, compute floor averages OVER CHAT TEAM ONLY,
 * assign CSAT rankings.
 */
async function fetchFromSupabase(client: Client): Promise<TeamData | null> {
  const { data, error } = await client
    .from("team_metrics")
    .select("*")
    .order("agent_name");

  if (error || !data || data.length === 0) return null;

  const allMembers = (data as SupabaseTeamMetric[]).map(supabaseRowToMemberRow);

  // Floor averages computed over CHAT TEAM ONLY (excluded agents are NOT included)
  const chatTeam = filterChatTeam(allMembers);
  const floorAvgProductivity = computeFloorAvg(chatTeam.map((m) => m.productivity));
  const floorAvgCsat = computeFloorAvg(chatTeam.map((m) => m.csat));
  const floorAvgAht = computeFloorAvg(chatTeam.map((m) => m.aht));
  const floorAvgCloseRate = computeFloorAvg(chatTeam.map((m) => m.closeRate));
  const floorAvgFcr = computeFloorAvg(chatTeam.map((m) => m.fcr));
  const floorAvgEscalationRate = computeFloorAvg(chatTeam.map((m) => m.escalationRate));
  const floorAvgAdherence = computeFloorAvg(chatTeam.map((m) => m.adherence));
  const floorAvgIrtReplier = computeFloorAvg(chatTeam.map((m) => m.irtReplier));
  const floorAvgClosedAfterResolution = computeFloorAvg(chatTeam.map((m) => m.closedAfterResolution));
  const floorAvgDeescalationRate = computeFloorAvg(chatTeam.map((m) => m.deescalationRate));
  const floorAvgOccupancy = computeFloorAvg(chatTeam.map((m) => m.occupancy));
  const floorAvgAvgGroupBasketTime = computeFloorAvg(chatTeam.map((m) => m.avgGroupBasketTime));
  const floorAvgBreakExceed = computeFloorAvg(chatTeam.map((m) => m.breakExceed));
  const floorAvgIdleTime = computeFloorAvg(chatTeam.map((m) => m.idleTime));

  // Assign floor averages and rankings to ALL members (including excluded)
  for (const m of allMembers) {
    m.floorAvgProductivity = floorAvgProductivity;
    m.floorAvgCsat = floorAvgCsat;
    m.floorAvgAht = floorAvgAht;
    m.floorAvgCloseRate = floorAvgCloseRate;
    m.floorAvgFcr = floorAvgFcr;
    m.floorAvgEscalationRate = floorAvgEscalationRate;
    m.floorAvgAdherence = floorAvgAdherence;
    m.floorAvgIrtReplier = floorAvgIrtReplier;
    m.floorAvgClosedAfterResolution = floorAvgClosedAfterResolution;
    m.floorAvgDeescalationRate = floorAvgDeescalationRate;
    m.floorAvgOccupancy = floorAvgOccupancy;
    m.floorAvgAvgGroupBasketTime = floorAvgAvgGroupBasketTime;
    m.floorAvgBreakExceed = floorAvgBreakExceed;
    m.floorAvgIdleTime = floorAvgIdleTime;
  }

  // CSAT ranking over CHAT TEAM ONLY
  assignCsatRanks(chatTeam);

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
      escalationRate: floorAvgEscalationRate,
      adherence: floorAvgAdherence,
      irtReplier: floorAvgIrtReplier,
      closedAfterResolution: floorAvgClosedAfterResolution,
      deescalationRate: floorAvgDeescalationRate,
      occupancy: floorAvgOccupancy,
      avgGroupBasketTime: floorAvgAvgGroupBasketTime,
      breakExceed: floorAvgBreakExceed,
      idleTime: floorAvgIdleTime,
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