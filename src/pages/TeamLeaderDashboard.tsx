import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Target,
  Star,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Mail,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchTeamData,
  refreshTeamData,
  findMyRow,
  filterChatTeam,
  getExclusionReason,
  type TeamData,
  type TeamMemberRow,
} from "@/lib/googleSheets";
import { toast } from "sonner";

// ─── Metric direction config ───────────────────────────────────────────────────

interface MetricDef {
  key: keyof TeamMemberRow;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  floorKey: string;
}

const DISPLAYED_METRICS: MetricDef[] = [
  { key: "csat",                    label: "CSAT",                   unit: "%",  higherIsBetter: true,  floorKey: "csat" },
  { key: "productivity",           label: "Productivity",          unit: "%",  higherIsBetter: true,  floorKey: "productivity" },
  { key: "escalationRate",         label: "Escalation Rate",       unit: "%",  higherIsBetter: false,  floorKey: "escalationRate" },
  { key: "adherence",              label: "Adherence",             unit: "%",  higherIsBetter: true,  floorKey: "adherence" },
  { key: "aht",                    label: "Avg Basket Time",       unit: "s",  higherIsBetter: false,  floorKey: "aht" },
  { key: "irtReplier",             label: "IRT 2 Replier",         unit: "",   higherIsBetter: false,  floorKey: "irtReplier" },
  { key: "fcr",                    label: "FCR",                   unit: "%",  higherIsBetter: true,  floorKey: "fcr" },
  { key: "closedAfterResolution",  label: "Closed After Res.",     unit: "%",  higherIsBetter: true,  floorKey: "closedAfterResolution" },
  { key: "breakExceed",            label: "Break Exceed",          unit: "",   higherIsBetter: false,  floorKey: "breakExceed" },
  { key: "idleTime",               label: "Idle Time",             unit: "",   higherIsBetter: false,  floorKey: "idleTime" },
  { key: "deescalationRate",       label: "De-escalation Rate",    unit: "%",  higherIsBetter: true,  floorKey: "deescalationRate" },
  { key: "occupancy",              label: "Occupancy",             unit: "%",  higherIsBetter: true,  floorKey: "occupancy" },
  { key: "avgGroupBasketTime",     label: "Avg Group Basket Time", unit: "s",  higherIsBetter: false,  floorKey: "avgGroupBasketTime" },
  { key: "closeRate",              label: "Closed Tickets %",      unit: "%",  higherIsBetter: true,  floorKey: "closeRate" },
];

// ─── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, unit, floorAvg, higherIsBetter }: {
  label: string; value: number | null; unit: string; floorAvg: number; higherIsBetter: boolean;
}) {
  if (value === null) {
    return (
      <Card className="border-border/40 bg-muted/20">
        <CardContent className="p-4">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
          <div className="text-lg font-bold text-muted-foreground/50 mt-1">—</div>
          <div className="text-xs text-muted-foreground mt-1">Floor: {floorAvg}{unit}</div>
        </CardContent>
      </Card>
    );
  }

  const diff = value - floorAvg;
  const isAbove = diff > 0;
  const isGood = higherIsBetter ? diff > 0 : diff < 0;
  const isNeutral = diff === 0;
  const diffAbs = Math.abs(Math.round(diff * 10) / 10);
  const statusColor = isGood ? "text-emerald-400" : isNeutral ? "text-yellow-400" : "text-red-400";
  const statusBg = isGood ? "bg-emerald-500/10 border-emerald-500/20" : isNeutral ? "bg-yellow-500/10 border-yellow-500/20" : "bg-red-500/10 border-red-500/20";
  const TrendIcon = isAbove ? ArrowUpRight : diff < 0 ? ArrowDownRight : ArrowRight;

  return (
    <Card className={`border-border/40 ${isGood ? 'bg-emerald-500/5' : isNeutral ? 'bg-yellow-500/5' : 'bg-red-500/5'}`}>
      <CardContent className="p-4">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-2xl font-bold text-foreground">{Math.round(value * 10) / 10}{unit}</span>
          <div className={`flex items-center gap-0.5 text-xs font-medium ${statusColor}`}>
            <TrendIcon className="h-3 w-3" />
            <span>{isAbove ? "+" : ""}{diffAbs}{unit}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className={`${statusBg} ${statusColor} text-[10px] px-1.5 py-0`}>
            {isGood ? "Above Floor" : isNeutral ? "At Floor" : "Below Floor"}
          </Badge>
          <span className="text-[10px] text-muted-foreground">Floor: {floorAvg}{unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Per-metric rank helper ────────────────────────────────────────────────────

function computeMetricRank(members: TeamMemberRow[], key: keyof TeamMemberRow, higherIsBetter: boolean): Map<string, number> {
  const sorted = [...members]
    .filter((m) => m[key] !== null && m[key] !== undefined)
    .sort((a, b) => {
      const av = a[key] as number | null;
      const bv = b[key] as number | null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return higherIsBetter ? (bv - av) : (av - bv);
    });
  const rankMap = new Map<string, number>();
  sorted.forEach((m, i) => { rankMap.set(m.email, i + 1); });
  return rankMap;
}

// ─── Team Leaderboard Row ──────────────────────────────────────────────────────

function LeaderboardRow({
  member,
  rank,
  isMe,
  isExpanded,
  onToggle,
  metricRanks,
}: {
  member: TeamMemberRow;
  rank: number;
  isMe: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  metricRanks: Map<string, Map<string, number>>;
}) {
  const medalColor = rank <= 3 ? (rank === 1 ? "text-yellow-400" : rank === 2 ? "text-gray-300" : "text-amber-600") : "text-muted-foreground";

  return (
    <div className={`rounded-lg transition-colors ${isMe ? "bg-primary/10 border border-primary/30" : ""}`}>
      <div
        className="flex items-center gap-3 py-2.5 px-3 cursor-pointer hover:bg-muted/50"
        onClick={onToggle}
      >
        <span className={`w-6 text-center font-bold text-sm ${medalColor}`}>
          {rank <= 3 ? <Star className="h-4 w-4 inline" /> : rank}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium truncate ${isMe ? "text-primary" : "text-foreground"}`}>
              {isMe ? (member.name || "You") : member.email}
            </span>
            {isMe && (
              <Badge className="bg-primary/20 text-primary text-[10px] px-1.5 py-0 border-primary/30">
                YOU
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          {member.csat !== null && (
            <span className="w-12 text-right" title="CSAT">{member.csat}%</span>
          )}
          {member.productivity !== null && (
            <span className="w-12 text-right" title="Productivity">{member.productivity}%</span>
          )}
          {member.closeRate !== null && (
            <span className="w-14 text-right" title="Close Rate">{member.closeRate}%</span>
          )}
          {member.aht !== null && member.aht > 0 && (
            <span className="w-10 text-right" title="ABT">{member.aht}s</span>
          )}
        </div>
        <div className="text-muted-foreground">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded detail: all metrics with rank and floor comparison */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
            {DISPLAYED_METRICS.map((m) => {
              const val = member[m.key] as number | null;
              const rankMap = metricRanks.get(m.key as string);
              const metricRank = rankMap?.get(member.email) ?? null;
              return (
                <div key={m.key} className="flex justify-between items-baseline">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-medium text-foreground">
                    {val !== null && val !== undefined ? `${Math.round(val * 10) / 10}${m.unit}` : "—"}
                    {metricRank !== null && val !== null && (
                      <span className="text-[10px] text-muted-foreground ml-1">#{metricRank}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function TeamLeaderDashboard() {
  const { user } = useAuth();
  const [teamData, setTeamData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const loadData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = forceRefresh ? await refreshTeamData() : await fetchTeamData();
      setTeamData(data);
      setLastRefresh(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load team data";
      setError(msg);
      toast.error("Could not load team data. The sheet may require login.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Find current user's row
  const myRow = teamData && user
    ? findMyRow(teamData, user.email, user.displayName)
    : null;

  // Filter to Chat team only
  const chatTeamMembers = teamData ? filterChatTeam(teamData.members) : [];

  // Sort by CSAT only (highest → lowest)
  const sortedMembers = [...chatTeamMembers].sort((a, b) => {
    const aCsat = a.csat ?? -Infinity;
    const bCsat = b.csat ?? -Infinity;
    return bCsat - aCsat;
  });

  // Compute per-metric rankings
  const metricRanks = new Map<string, Map<string, number>>();
  for (const m of DISPLAYED_METRICS) {
    metricRanks.set(m.key as string, computeMetricRank(chatTeamMembers, m.key, m.higherIsBetter));
  }

  // Apply search filter
  const filteredMembers = sortedMembers.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  const myRank = myRow
    ? sortedMembers.findIndex((m) => m.email.toLowerCase() === myRow.email.toLowerCase()) + 1
    : 0;

  const excludedCount = teamData ? teamData.members.length - chatTeamMembers.length : 0;

  // ── Loading State ──
  if (loading && !teamData) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary animate-pulse" />
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Chat Team Dashboard
          </h1>
        </div>
        <Card className="p-8 border-border text-center">
          <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading team data...</p>
        </Card>
      </div>
    );
  }

  // ── Error State ──
  if (error && !teamData) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Chat Team Dashboard
          </h1>
        </div>
        <Card className="p-8 border-border text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">Unable to Load Team Data</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">{error}</p>
          <Button variant="outline" onClick={() => loadData(true)}>
            <RefreshCw className="h-4 w-4 mr-2" /> Retry
          </Button>
        </Card>
      </div>
    );
  }

  if (!teamData) return null;

  const floorAvg = teamData.floorAvg;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Chat Team Dashboard
            </h1>
            {teamData.monthLabel && (
              <p className="text-sm text-muted-foreground">{teamData.monthLabel}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastRefresh && (
            <span className="text-[10px] text-muted-foreground">
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => loadData(true)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Excluded Agents Notice */}
      {excludedCount > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-3 flex items-start gap-3">
            <Shield className="h-5 w-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {excludedCount} agent{excludedCount > 1 ? 's' : ''} excluded from Chat ranking
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {teamData.members
                  .filter((m) => getExclusionReason(m.email))
                  .map((m) => `${m.email} (${getExclusionReason(m.email)})`)
                  .join(" • ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* My Metrics vs Floor Average */}
      {myRow ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Your Performance vs Floor Average
              <Badge className="bg-primary/20 text-primary text-xs ml-2">
                CSAT Rank #{myRank}
              </Badge>
            </CardTitle>
            <CardDescription>
              {user?.displayName || myRow.name} — compared to Chat team floor averages ({chatTeamMembers.length} agents)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {DISPLAYED_METRICS.map((m) => {
                const floorVal = floorAvg[m.floorKey as keyof typeof floorAvg] ?? 0;
                return (
                  <MetricCard
                    key={m.key}
                    label={m.label}
                    value={myRow[m.key] as number | null}
                    unit={m.unit}
                    floorAvg={floorVal}
                    higherIsBetter={m.higherIsBetter}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Your name wasn't found in the team sheet
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Logged in as <strong>{user?.email}</strong>. Make sure your email matches a row in the data.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Floor Averages */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Chat Team Floor Averages
            <span className="text-xs text-muted-foreground font-normal">
              ({chatTeamMembers.length} active agents)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.csat}%</div>
              <div className="text-xs text-muted-foreground">CSAT</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.productivity}%</div>
              <div className="text-xs text-muted-foreground">Productivity</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.closeRate}%</div>
              <div className="text-xs text-muted-foreground">Closed Tickets %</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.aht}s</div>
              <div className="text-xs text-muted-foreground">ABT</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.fcr}%</div>
              <div className="text-xs text-muted-foreground">FCR</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.escalationRate}%</div>
              <div className="text-xs text-muted-foreground">Escalation</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.adherence}%</div>
              <div className="text-xs text-muted-foreground">Adherence</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Leaderboard — sorted by CSAT only */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-400" />
              Chat Team Ranking
              <span className="text-xs text-muted-foreground font-normal">
                (by CSAT %, highest → lowest)
              </span>
            </CardTitle>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search agent..."
                className="pl-8 h-8 w-48 text-xs"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {filteredMembers.length > 0 ? (
              filteredMembers.map((member) => (
                <LeaderboardRow
                  key={member.email}
                  member={member}
                  rank={sortedMembers.findIndex((m) => m.email === member.email) + 1}
                  isMe={myRow ? member.email.toLowerCase() === myRow.email.toLowerCase() : false}
                  isExpanded={expandedMember === member.email}
                  onToggle={() => setExpandedMember(expandedMember === member.email ? null : member.email)}
                  metricRanks={metricRanks}
                />
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery ? "No agents match your search" : "No team data available"}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}