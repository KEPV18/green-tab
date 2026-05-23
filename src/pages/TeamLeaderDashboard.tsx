import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Trophy, TrendingDown, Target, Users, Award } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface AgentScore {
  id: string;
  agent_email: string;
  csat_count: number;
  dsat_count: number;
  csat_percentage: number | null;
  rank_in_team: number | null;
  team_size: number | null;
  synced_at: string | null;
}

const TARGET_CSAT = 85;

function nameFromEmail(email: string): string {
  const local = email.split("@")[0];
  return local
    .split(/[._-]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getCsatColor(pct: number): string {
  if (pct >= 90) return "text-emerald-400";
  if (pct >= 85) return "text-green-400";
  if (pct >= 80) return "text-yellow-400";
  return "text-red-400";
}

function getRankBadge(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export default function TeamLeaderDashboard() {
  const { user } = useAuth();
  const [agents, setAgents] = useState<AgentScore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, []);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("team_leaderboard")
        .select("id, agent_email, csat_count, dsat_count, csat_percentage, rank_in_team, team_size, synced_at")
        .eq("year", 2026)
        .eq("month", 5)
        .order("csat_percentage", { ascending: false });

      if (error) {
        console.error("Supabase query error:", error);
      } else if (data && data.length > 0) {
        // Filter out agents with null csat_percentage
        const valid = data.filter((a: AgentScore) => a.csat_percentage !== null);
        setAgents(valid as AgentScore[]);
      }
    } catch (err) {
      console.error("Leaderboard load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // Computed stats
  const avgCsat =
    agents.length > 0
      ? agents.reduce((sum, a) => sum + (a.csat_percentage || 0), 0) / agents.length
      : 0;
  const aboveTarget = agents.filter((a) => (a.csat_percentage || 0) >= TARGET_CSAT).length;
  const belowTarget = agents.filter((a) => (a.csat_percentage || 0) < TARGET_CSAT).length;
  const totalSurveys = agents.reduce((sum, a) => sum + a.csat_count + a.dsat_count, 0);
  const teamSize = agents[0]?.team_size || agents.length;
  const lastSync = agents[0]?.synced_at
    ? new Date(agents[0].synced_at).toLocaleString()
    : "";

  // Calculate surveys needed to hit 85% for each agent
  const surveysToTarget = (agent: AgentScore): number => {
    if ((agent.csat_percentage || 0) >= TARGET_CSAT) return 0;
    const currentTotal = agent.csat_count + agent.dsat_count;
    const needed = Math.ceil(
      (TARGET_CSAT * currentTotal - 100 * agent.csat_count) / (100 - TARGET_CSAT)
    );
    return Math.max(0, needed);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Team Leader Dashboard</h2>
          <p className="text-sm text-muted-foreground">
            No leaderboard data available for May 2026.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-yellow-500" />
          Team Leader Dashboard
        </h2>
        <p className="text-sm text-muted-foreground">
          CSAT performance ranking • May 2026 • Target: {TARGET_CSAT}%
          {lastSync && <span className="ml-2">• Synced {lastSync}</span>}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4 border-l-4 border-l-primary">
          <p className="text-xs text-muted-foreground">Team Size</p>
          <p className="text-2xl font-bold">{teamSize}</p>
          <Users className="h-4 w-4 text-primary mt-1" />
        </Card>
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs text-muted-foreground">Avg CSAT</p>
          <p className={`text-2xl font-bold ${getCsatColor(avgCsat)}`}>
            {avgCsat.toFixed(1)}%
          </p>
          <Award className="h-4 w-4 text-emerald-500 mt-1" />
        </Card>
        <Card className="p-4 border-l-4 border-l-green-500">
          <p className="text-xs text-muted-foreground">Above Target</p>
          <p className="text-2xl font-bold text-green-400">{aboveTarget}</p>
          <Target className="h-4 w-4 text-green-500 mt-1" />
        </Card>
        <Card className="p-4 border-l-4 border-l-red-500">
          <p className="text-xs text-muted-foreground">Below Target</p>
          <p className="text-2xl font-bold text-red-400">{belowTarget}</p>
          <TrendingDown className="h-4 w-4 text-red-500 mt-1" />
        </Card>
      </div>

      {/* Leaderboard Table */}
      <Card className="overflow-hidden">
        <div className="p-4 border-b">
          <h3 className="font-semibold">CSAT Leaderboard — May 2026</h3>
          <p className="text-xs text-muted-foreground">
            {totalSurveys} total surveys • Sorted by CSAT%
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-center font-medium w-16">Rank</th>
                <th className="px-4 py-3 text-left font-medium">Agent</th>
                <th className="px-4 py-3 text-center font-medium">C-sat</th>
                <th className="px-4 py-3 text-center font-medium">D-sat</th>
                <th className="px-4 py-3 text-center font-medium">Total</th>
                <th className="px-4 py-3 text-center font-medium">CSAT%</th>
                <th className="px-4 py-3 text-center font-medium">To Target</th>
                <th className="px-4 py-3 text-left font-medium min-w-[120px]">Progress</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, idx) => {
                const rank = agent.rank_in_team || idx + 1;
                const total = agent.csat_count + agent.dsat_count;
                const csatPct = agent.csat_percentage || 0;
                const barWidth = Math.min(csatPct, 100);
                const needsSurveys = surveysToTarget(agent);

                return (
                  <tr
                    key={agent.id}
                    className={`border-b hover:bg-muted/30 transition-colors ${
                      agent.agent_email.includes("ahmed.ahmed.5") ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-center font-medium">
                      {getRankBadge(rank)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{nameFromEmail(agent.agent_email)}</div>
                      <div className="text-xs text-muted-foreground">{agent.agent_email}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-green-400 font-medium">
                      {agent.csat_count}
                    </td>
                    <td className="px-4 py-3 text-center text-red-400 font-medium">
                      {agent.dsat_count}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">
                      {total}
                    </td>
                    <td className={`px-4 py-3 text-center font-bold ${getCsatColor(csatPct)}`}>
                      {csatPct.toFixed(0)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      {needsSurveys > 0 ? (
                        <span className="text-red-400 font-medium">+{needsSurveys}</span>
                      ) : (
                        <span className="text-green-400">✓</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              csatPct >= TARGET_CSAT
                                ? "bg-emerald-500"
                                : csatPct >= 80
                                ? "bg-yellow-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-8">{TARGET_CSAT}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}