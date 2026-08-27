import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Users,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Clock,
  Target,
  Star,
  BarChart3,
  Phone,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ShieldX,
  Shield,
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

// ─── Metric Card ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number | null;
  unit: string;
  floorAvg: number;
  icon: React.ReactNode;
  higherIsBetter: boolean;
}

function MetricCard({ label, value, unit, floorAvg, icon, higherIsBetter }: MetricCardProps) {
  if (value === null) {
    return (
      <Card className="border-border/40 bg-muted/20">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
            <div className="text-muted-foreground/50">{icon}</div>
          </div>
          <div className="text-lg font-bold text-muted-foreground/50">—</div>
          <div className="text-xs text-muted-foreground mt-1">Floor Avg: {floorAvg}{unit}</div>
        </CardContent>
      </Card>
    );
  }

  const diff = value - floorAvg;
  const isAbove = diff > 0;
  const isBelow = diff < 0;
  const isGood = higherIsBetter ? isAbove : isBelow;
  const diffAbs = Math.abs(Math.round(diff * 10) / 10);

  const statusColor = isGood
    ? "text-emerald-400"
    : diff === 0
    ? "text-yellow-400"
    : "text-red-400";

  const statusBg = isGood
    ? "bg-emerald-500/10 border-emerald-500/20"
    : diff === 0
    ? "bg-yellow-500/10 border-yellow-500/20"
    : "bg-red-500/10 border-red-500/20";

  const TrendIcon = isAbove ? ArrowUpRight : isBelow ? ArrowDownRight : ArrowRight;
  const trendColor = isGood ? "text-emerald-400" : diff === 0 ? "text-yellow-400" : "text-red-400";

  return (
    <Card className={`border-border/40 ${isGood ? 'bg-emerald-500/5' : diff === 0 ? 'bg-yellow-500/5' : 'bg-red-500/5'}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
          <div className={statusColor}>{icon}</div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-foreground">{Math.round(value * 10) / 10}{unit}</span>
          <div className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            <span>{isAbove ? "+" : ""}{diffAbs}{unit}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Badge variant="outline" className={`${statusBg} ${statusColor} text-[10px] px-1.5 py-0`}>
            {isGood ? "Above Floor" : diff === 0 ? "At Floor" : "Below Floor"}
          </Badge>
          <span className="text-[10px] text-muted-foreground">Floor: {floorAvg}{unit}</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Team Leaderboard Row ──────────────────────────────────────────────────────

function LeaderboardRow({
  member,
  rank,
  isMe,
  isExpanded,
  onToggle,
}: {
  member: TeamMemberRow;
  rank: number;
  isMe: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const medalColor = rank === 1 ? "text-yellow-400" : rank === 2 ? "text-gray-300" : rank === 3 ? "text-amber-600" : "text-muted-foreground";

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
              {member.name}
            </span>
            {isMe && (
              <Badge className="bg-primary/20 text-primary text-[10px] px-1.5 py-0 border-primary/30">
                YOU
              </Badge>
            )}
          </div>
          {member.email && (
            <span className="text-[10px] text-muted-foreground truncate block">{member.email}</span>
          )}
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground">
          {member.productivity !== null && (
            <span className="w-14 text-right" title="Productivity"><span className="text-[10px] text-muted-foreground/60">Prod</span> {member.productivity}%</span>
          )}
          {member.csat !== null && (
            <span className="w-10 text-right" title="CSAT">{member.csat}%</span>
          )}
          {member.closeRate !== null && (
            <span className="w-14 text-right" title="Close Rate"><span className="text-[10px] text-muted-foreground/60">CR</span> {member.closeRate}%</span>
          )}
          {member.aht !== null && member.aht > 0 && (
            <span className="w-10 text-right" title="ABT">{member.aht}s</span>
          )}
        </div>
        <div className="text-muted-foreground">
          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </div>

      {/* Expanded detail view */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
            {/* Primary Metrics */}
            <div className="col-span-full text-[10px] font-semibold text-primary/80 uppercase tracking-wider mb-1">Primary Metrics</div>
            <MetricLine label="Productivity" value={member.productivity} unit="%" />
            <MetricLine label="CSAT" value={member.csat} unit="%" />
            <MetricLine label="Close Rate" value={member.closeRate} unit="%" />
            <MetricLine label="ABT" value={member.aht} unit="s" invertGood />

            {/* Additional Metrics */}
            <div className="col-span-full text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2 mb-1">Additional Metrics</div>
            <MetricLine label="FCR" value={member.fcr} unit="%" />
            <MetricLine label="Adherence" value={member.adherence} unit="%" />
            <MetricLine label="Avg Handling Time" value={member.chatHandlingTime} unit="s" invertGood />
            <MetricLine label="Closed After Res." value={member.closedAfterResolution} unit="%" />
            <MetricLine label="Escalation Rate" value={member.escalationRate} unit="%" invertGood />
            <MetricLine label="De-escalation Rate" value={member.deescalationRate} unit="%" />
            <MetricLine label="Occupancy" value={member.occupancy} unit="%" />
            <MetricLine label="Concurrency" value={member.concurrency} unit="" />
            <MetricLine label="IRT Replier" value={member.irtReplier} unit="" />
            <MetricLine label="Avg Group Basket" value={member.avgGroupBasketTime} unit="s" invertGood />
            <MetricLine label="Shrinkage" value={member.shrinkage} unit="%" invertGood />
            <MetricLine label="Utilization" value={member.utilization} unit="%" />
          </div>
          {member.overallScore !== null && (
            <div className="mt-2 pt-2 border-t border-border/30 text-xs text-muted-foreground">
              Overall Score: <span className="font-bold text-foreground">{member.overallScore}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MetricLine({ label, value, unit, invertGood }: { label: string; value: number | null; unit: string; invertGood?: boolean }) {
  if (value === null) {
    return (
      <div className="flex justify-between">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground/50">—</span>
      </div>
    );
  }
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{Math.round(value * 10) / 10}{unit}</span>
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

  // Filter to Chat team only, then apply search
  const chatTeamMembers = teamData ? filterChatTeam(teamData.members) : [];
  const filteredMembers = chatTeamMembers.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  // Sort by overall score (highest first)
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const aScore = a.overallScore ?? 0;
    const bScore = b.overallScore ?? 0;
    return bScore - aScore;
  });

  const myRank = myRow
    ? sortedMembers.findIndex((m) => m.email.toLowerCase() === myRow.email.toLowerCase()) + 1
    : 0;

  // Count excluded agents for display
  const excludedCount = teamData ? teamData.members.length - chatTeamMembers.length : 0;

  // ── Loading State ──
  if (loading && !teamData) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary animate-pulse" />
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Team Dashboard
          </h1>
        </div>
        <Card className="p-8 border-border text-center">
          <RefreshCw className="h-8 w-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading team data from Supabase...</p>
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
            Team Dashboard
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            disabled={loading}
          >
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
                  .map((m) => `${m.name} (${getExclusionReason(m.email)})`)
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
                Rank #{myRank}
              </Badge>
            </CardTitle>
            <CardDescription>
              {myRow.name} — compared to Chat team floor averages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="Productivity"
                value={myRow.productivity}
                unit="%"
                floorAvg={floorAvg.productivity}
                icon={<BarChart3 className="h-4 w-4" />}
                higherIsBetter={true}
              />
              <MetricCard
                label="CSAT"
                value={myRow.csat}
                unit="%"
                floorAvg={floorAvg.csat}
                icon={<CheckCircle2 className="h-4 w-4" />}
                higherIsBetter={true}
              />
              <MetricCard
                label="Close Rate"
                value={myRow.closeRate}
                unit="%"
                floorAvg={floorAvg.closeRate}
                icon={<ShieldCheck className="h-4 w-4" />}
                higherIsBetter={true}
              />
              <MetricCard
                label="ABT"
                value={myRow.aht}
                unit="s"
                floorAvg={floorAvg.aht}
                icon={<MessageSquare className="h-4 w-4" />}
                higherIsBetter={false}
              />
            </div>
            {/* Additional metrics for current user */}
            <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <MetricLine label="FCR" value={myRow.fcr} unit="%" />
              <MetricLine label="Adherence" value={myRow.adherence} unit="%" />
              <MetricLine label="Avg Handling Time" value={myRow.chatHandlingTime} unit="s" invertGood />
              <MetricLine label="Closed After Res." value={myRow.closedAfterResolution} unit="%" />
              <MetricLine label="Escalation Rate" value={myRow.escalationRate} unit="%" invertGood />
              <MetricLine label="De-escalation Rate" value={myRow.deescalationRate} unit="%" />
              <MetricLine label="Occupancy" value={myRow.occupancy} unit="%" />
              <MetricLine label="Concurrency" value={myRow.concurrency} unit="" />
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
                Logged in as <strong>{user?.email}</strong>. Make sure your name or email matches a row in the data.
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
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.productivity}%</div>
              <div className="text-xs text-muted-foreground">Productivity</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.csat}%</div>
              <div className="text-xs text-muted-foreground">CSAT</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.closeRate}%</div>
              <div className="text-xs text-muted-foreground">Close Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.aht}s</div>
              <div className="text-xs text-muted-foreground">ABT</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.fcr}%</div>
              <div className="text-xs text-muted-foreground">FCR</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Leaderboard */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-400" />
              Chat Team Ranking
              <span className="text-xs text-muted-foreground font-normal">
                (Prod &gt; CSAT &gt; Close Rate &gt; ABT)
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
            {sortedMembers.length > 0 ? (
              sortedMembers.map((member) => (
                <LeaderboardRow
                  key={member.email}
                  member={member}
                  rank={sortedMembers.findIndex((m) => m.email === member.email) + 1}
                  isMe={myRow ? member.email.toLowerCase() === myRow.email.toLowerCase() : false}
                  isExpanded={expandedMember === member.email}
                  onToggle={() => setExpandedMember(expandedMember === member.email ? null : member.email)}
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