/**
 * Green Tab — Monthly Bonus Calculation
 *
 * Rules (effective this cycle):
 * ─────────────────────────────────
 * 1. KCSAT Score = 40% CSAT + 30% Productivity + 30% Close Rate
 *    - CSAT is split equally across channels
 *    - Channels with <5 surveys or <20 productive hours are dropped and re-weighted
 *
 * 2. KCSAT Gate: Below 73% KCSAT → disqualified at both team and individual levels
 *    - A top-5 team with KCSAT < 73% loses its place; next team moves up
 *    - Agents below 73% KCSAT can still qualify individually if they reach 73%
 *
 * 3. Team Route (Top 5):
 *    - 1st place team → 100% of bonus
 *    - 2nd place team → 90%
 *    - 3rd place team → 80%
 *    - 4th place team → 70%
 *    - 5th place team → 60%
 *    - Every eligible agent on that team gets the team's award %
 *
 * 4. Individual Route (Team ranked 6th or lower):
 *    - Top 20% of all remaining eligible agents → 100% of bonus
 *
 * 5. Bonus = Base Salary × 70% × Award %
 *
 * 6. Eligibility:
 *    - 11+ productive days in the month
 *    - Out of nesting (eligible from the month you leave nesting)
 *    - KCSAT ≥ 73%
 */

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface AgentMetrics {
  email: string;
  name: string;
  csat: number | null;
  productivity: number | null;
  closeRate: number | null;
  fcr: number | null;
  karmaGood: number;
  karmaBad: number;
  productiveDays: number;
  isInNesting: boolean;
}

export interface TeamRank {
  teamName: string;
  teamKcsatAvg: number;
  rank: number;
  agents: AgentMetrics[];
}

export interface BonusResult {
  eligible: boolean;
  disqualificationReason?: string;
  kcsatScore: number;
  kcsatPass: boolean;
  productiveDays: number;
  productiveDaysPass: boolean;
  nestingPass: boolean;
  route: "team" | "individual" | "none";
  teamRank?: number;
  teamAwardPercent?: number;
  isTop20Percent?: boolean;
  awardPercent: number;
  baseSalary: number;
  bonusPool: number; // baseSalary × 70%
  grossBonus: number; // bonusPool × awardPercent
  netBonus: number; // after tax
  taxRate: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────────

export const KCSAT_THRESHOLD = 73;
export const MIN_PRODUCTIVE_DAYS = 11;
export const BONUS_POOL_PERCENT = 70; // 70% of base salary
export const TEAM_AWARD_MAP: Record<number, number> = {
  1: 100,
  2: 90,
  3: 80,
  4: 70,
  5: 60,
};
export const INDIVIDUAL_AWARD_PERCENT = 100;

// ─── Scoring ──────────────────────────────────────────────────────────────────────

/**
 * Calculate individual KCSAT score.
 * Formula: 40% CSAT + 30% Productivity + 30% Close Rate
 */
export function calculateKcsat(agent: AgentMetrics): number {
  let csat = agent.csat ?? 0;
  let prod = agent.productivity ?? 0;
  let close = agent.closeRate ?? 0;
  return csat * 0.4 + prod * 0.3 + close * 0.3;
}

/**
 * Calculate karma percentage from good/bad counts.
 */
export function calculateKarma(good: number, bad: number): number {
  const total = good + bad;
  if (total === 0) return 0;
  return (good / total) * 100;
}

// ─── Eligibility ──────────────────────────────────────────────────────────────────

/**
 * Check basic eligibility (before considering team/individual routes).
 */
export function checkEligibility(agent: AgentMetrics): {
  eligible: boolean;
  kcsatPass: boolean;
  productiveDaysPass: boolean;
  nestingPass: boolean;
  reasons: string[];
} {
  const kcsat = calculateKcsat(agent);
  const kcsatPass = kcsat >= KCSAT_THRESHOLD;
  const productiveDaysPass = agent.productiveDays >= MIN_PRODUCTIVE_DAYS;
  const nestingPass = !agent.isInNesting;

  const reasons: string[] = [];
  if (!kcsatPass) reasons.push(`KCSAT ${kcsat.toFixed(1)}% < ${KCSAT_THRESHOLD}%`);
  if (!productiveDaysPass) reasons.push(`${agent.productiveDays} productive days < ${MIN_PRODUCTIVE_DAYS}`);
  if (!nestingPass) reasons.push("Still in nesting period");

  return {
    eligible: kcsatPass && productiveDaysPass && nestingPass,
    kcsatPass,
    productiveDaysPass,
    nestingPass,
    reasons,
  };
}

// ─── Team Ranking ────────────────────────────────────────────────────────────────

/**
 * Rank teams by average KCSAT (descending).
 * Teams with average KCSAT < 73% are disqualified and removed from ranking.
 */
export function rankTeams(allTeams: TeamRank[]): TeamRank[] {
  return allTeams
    .filter(t => t.teamKcsatAvg >= KCSAT_THRESHOLD)
    .sort((a, b) => b.teamKcsatAvg - a.teamKcsatAvg)
    .map((t, i) => ({ ...t, rank: i + 1 }));
}

// ─── Individual Top 20% ──────────────────────────────────────────────────────────

/**
 * From all agents NOT on a top-5 team, find the top 20% by KCSAT.
 * Only eligible agents (KCSAT ≥ 73%, 11+ days, not in nesting) are considered.
 */
export function getTop20Percent(agents: AgentMetrics[]): AgentMetrics[] {
  const eligible = agents.filter(a => {
    const { eligible } = checkEligibility(a);
    return eligible;
  });

  // Sort by KCSAT descending
  eligible.sort((a, b) => calculateKcsat(b) - calculateKcsat(a));

  // Top 20% (at least 1 if any eligible)
  const count = Math.max(1, Math.ceil(eligible.length * 0.2));
  return eligible.slice(0, count);
}

// ─── Full Bonus Calculation ───────────────────────────────────────────────────────

/**
 * Calculate the monthly bonus for a single agent.
 *
 * @param agent - The agent's metrics
 * @param allTeams - All teams with their rankings
 * @param agentTeamName - The agent's team name
 * @param baseSalary - Agent's base salary (EGP)
 * @param taxRate - Tax & insurance rate (e.g. 14.5)
 *
 * @returns BonusResult with full breakdown
 */
export function calculateBonus(
  agent: AgentMetrics,
  allTeams: TeamRank[],
  agentTeamName: string,
  baseSalary: number,
  taxRate: number = 0,
): BonusResult {
  const kcsat = calculateKcsat(agent);
  const eligibility = checkEligibility(agent);

  // Not eligible at all
  if (!eligibility.eligible) {
    return {
      eligible: false,
      disqualificationReason: eligibility.reasons.join("; "),
      kcsatScore: kcsat,
      kcsatPass: eligibility.kcsatPass,
      productiveDays: agent.productiveDays,
      productiveDaysPass: eligibility.productiveDaysPass,
      nestingPass: eligibility.nestingPass,
      route: "none",
      awardPercent: 0,
      baseSalary,
      bonusPool: baseSalary * (BONUS_POOL_PERCENT / 100),
      grossBonus: 0,
      netBonus: 0,
      taxRate,
    };
  }

  // Filter teams with KCSAT ≥ 73%
  const rankedTeams = rankTeams(allTeams);
  const myTeam = rankedTeams.find(t => t.teamName === agentTeamName);

  if (myTeam && myTeam.rank <= 5) {
    // Team Route: top 5 team
    const awardPercent = TEAM_AWARD_MAP[myTeam.rank] ?? 60;
    const bonusPool = baseSalary * (BONUS_POOL_PERCENT / 100);
    const grossBonus = bonusPool * (awardPercent / 100);
    const netBonus = grossBonus * (1 - taxRate / 100);

    return {
      eligible: true,
      kcsatScore: kcsat,
      kcsatPass: true,
      productiveDays: agent.productiveDays,
      productiveDaysPass: true,
      nestingPass: true,
      route: "team",
      teamRank: myTeam.rank,
      teamAwardPercent: awardPercent,
      awardPercent,
      baseSalary,
      bonusPool,
      grossBonus,
      netBonus,
      taxRate,
    };
  }

  // Individual Route: team ranked 6th or lower (or not in ranked teams)
  const nonTop5Agents = allTeams
    .filter(t => !rankedTeams.slice(0, 5).includes(t) || t.teamName !== agentTeamName)
    .flatMap(t => t.agents);

  // Add agents from the agent's own team if it's 6th or lower
  const agentsForIndividual = myTeam && myTeam.rank > 5
    ? [...nonTop5Agents, ...myTeam.agents]
    : nonTop5Agents;

  const top20 = getTop20Percent(agentsForIndividual);
  const isInTop20 = top20.some(a => a.email === agent.email);

  const bonusPool = baseSalary * (BONUS_POOL_PERCENT / 100);
  const grossBonus = isInTop20 ? bonusPool : 0;
  const netBonus = grossBonus * (1 - taxRate / 100);

  return {
    eligible: isInTop20,
    disqualificationReason: isInTop20 ? undefined : "Not in top 20% of individual agents",
    kcsatScore: kcsat,
    kcsatPass: true,
    productiveDays: agent.productiveDays,
    productiveDaysPass: true,
    nestingPass: true,
    route: isInTop20 ? "individual" : "none",
    isTop20Percent: isInTop20,
    awardPercent: isInTop20 ? 100 : 0,
    baseSalary,
    bonusPool,
    grossBonus,
    netBonus,
    taxRate,
  };
}

// ─── Bonus Display Helpers ─────────────────────────────────────────────────────────

/**
 * Format a number as EGP currency.
 */
export function formatEGP(amount: number): string {
  return `EGP ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Get the award percentage label for a team rank.
 */
export function getTeamAwardLabel(rank: number): string {
  const map: Record<number, string> = {
    1: "1st — 100%",
    2: "2nd — 90%",
    3: "3rd — 80%",
    4: "4th — 70%",
    5: "5th — 60%",
  };
  return map[rank] ?? "Not in top 5";
}

/**
 * Get a human-readable route description.
 */
export function getRouteDescription(result: BonusResult): string {
  if (!result.eligible) {
    if (result.disqualificationReason) {
      return `❌ Not eligible: ${result.disqualificationReason}`;
    }
    return "❌ Not eligible for bonus this month";
  }

  if (result.route === "team") {
    return `🏆 Team Route: Your team ranked ${result.teamRank}${getSuffix(result.teamRank!)} → ${result.awardPercent}% of bonus`;
  }

  if (result.route === "individual") {
    return `🌟 Individual Route: Top 20% performer → 100% of bonus`;
  }

  return "No bonus this month";
}

function getSuffix(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}