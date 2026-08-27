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
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  fetchTeamData,
  refreshTeamData,
  findMyRow,
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
}: {
  member: TeamMemberRow;
  rank: number;
  isMe: boolean;
}) {
  const medalColor = rank === 1 ? "text-yellow-400" : rank === 2 ? "text-gray-300" : rank === 3 ? "text-amber-600" : "text-muted-foreground";

  return (
    <div
      className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${
        isMe
          ? "bg-primary/10 border border-primary/30"
          : "hover:bg-muted/50"
      }`}
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
        {member.csat !== null && (
          <span className="w-12 text-right" title="CSAT">{member.csat}%</span>
        )}
        {member.productivity !== null && (
          <span className="w-12 text-right" title="Productivity">{member.productivity}%</span>
        )}
        {member.fcr !== null && (
          <span className="w-10 text-right" title="FCR">{member.fcr}%</span>
        )}
        {member.aht !== null && (
          <span className="w-14 text-right" title="Chat AHT">{member.aht}s</span>
        )}
      </div>
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

  // Filtered members for search
  const filteredMembers = teamData?.members.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  }) ?? [];

  // Sort members by overall score (highest first)
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const aScore = a.overallScore ?? 0;
    const bScore = b.overallScore ?? 0;
    return bScore - aScore;
  });

  const myRank = myRow
    ? sortedMembers.findIndex((m) => m.name.toLowerCase() === myRow.name.toLowerCase()) + 1
    : 0;

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
          <p className="text-muted-foreground">Loading team data from Google Sheets...</p>
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
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            {error}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Make sure the Google Sheet is shared as "Anyone with the link can view".
          </p>
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
              Team Dashboard
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
              {myRow.name} — compared to team floor averages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard
                label="CSAT"
                value={myRow.csat}
                unit="%"
                floorAvg={floorAvg.csat}
                icon={<CheckCircle2 className="h-4 w-4" />}
                higherIsBetter={true}
              />
              <MetricCard
                label="Productivity"
                value={myRow.productivity}
                unit="%"
                floorAvg={floorAvg.productivity}
                icon={<BarChart3 className="h-4 w-4" />}
                higherIsBetter={true}
              />
              <MetricCard
                label="FCR"
                value={myRow.fcr}
                unit="%"
                floorAvg={floorAvg.fcr}
                icon={<Phone className="h-4 w-4" />}
                higherIsBetter={true}
              />
              <MetricCard
                label="AHT"
                value={myRow.aht}
                unit="s"
                floorAvg={floorAvg.aht}
                icon={<MessageSquare className="h-4 w-4" />}
                higherIsBetter={false}
              />
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
                Logged in as <strong>{user?.email}</strong>. Make sure your name or email matches a row in the Google Sheet.
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
            Floor Averages
            <span className="text-xs text-muted-foreground font-normal">
              ({teamData.members.length} team members)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.csat}%</div>
              <div className="text-xs text-muted-foreground">CSAT</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.productivity}%</div>
              <div className="text-xs text-muted-foreground">Productivity</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.fcr}%</div>
              <div className="text-xs text-muted-foreground">FCR</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{floorAvg.aht}s</div>
              <div className="text-xs text-muted-foreground">Chat AHT</div>
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
              Team Leaderboard
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
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {sortedMembers.length > 0 ? (
              sortedMembers.map((member, idx) => (
                <LeaderboardRow
                  key={member.name}
                  member={member}
                  rank={idx + 1}
                  isMe={myRow ? member.name.toLowerCase() === myRow.name.toLowerCase() : false}
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