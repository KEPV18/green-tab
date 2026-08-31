import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Trophy, Users, Star, AlertTriangle, CheckCircle, XCircle, Info, Save } from "lucide-react";
import {
  calculateKcsat,
  checkEligibility,
  calculateBonus,
  formatEGP,
  getTeamAwardLabel,
  getRouteDescription,
  KCSAT_THRESHOLD,
  MIN_PRODUCTIVE_DAYS,
  BONUS_POOL_PERCENT,
  TEAM_AWARD_MAP,
  type AgentMetrics,
  type TeamRank,
  type BonusResult,
} from "@/lib/bonus";
import { getUserSettings } from "@/lib/store";

interface BonusCardProps {
  userId: string;
  csat?: number | null;
  productivity?: number | null;
  closeRate?: number | null;
  karmaGood?: number;
  karmaBad?: number;
  productiveDays?: number;
  selectedMonth: number;
  selectedYear: number;
}

export const BonusCard = ({
  userId,
  csat,
  productivity,
  closeRate,
  karmaGood = 0,
  karmaBad = 0,
  productiveDays = 0,
  selectedMonth,
  selectedYear,
}: BonusCardProps) => {
  const [teamName, setTeamName] = useState<string>("");
  const [teamRankInput, setTeamRankInput] = useState<string>("");
  const [allTeams, setAllTeams] = useState<TeamRank[]>([]);
  const [isInNesting, setIsInNesting] = useState(false);

  // Load saved bonus settings
  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(`gt_bonus_settings_${userId}`);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.teamName) setTeamName(s.teamName);
        if (s.teamRank) setTeamRankInput(String(s.teamRank));
        if (s.isInNesting != null) setIsInNesting(s.isInNesting);
        if (s.allTeams) setAllTeams(s.allTeams);
      }
    } catch {}
  }, [userId]);

  const saveSettings = () => {
    if (!userId) return;
    try {
      localStorage.setItem(`gt_bonus_settings_${userId}`, JSON.stringify({
        teamName,
        teamRank: teamRankInput,
        isInNesting,
        allTeams,
      }));
      toast.success("Bonus settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
  };

  // Build agent metrics from props
  const agent: AgentMetrics = useMemo(() => ({
    email: "",
    name: "",
    csat: csat ?? null,
    productivity: productivity ?? null,
    closeRate: closeRate ?? null,
    fcr: null,
    karmaGood,
    karmaBad,
    productiveDays,
    isInNesting,
  }), [csat, productivity, closeRate, karmaGood, karmaBad, productiveDays, isInNesting]);

  const kcsat = useMemo(() => calculateKcsat(agent), [agent]);
  const eligibility = useMemo(() => checkEligibility(agent), [agent]);

  // Build team data from input
  const teams: TeamRank[] = useMemo(() => {
    if (teamRankInput && teamName) {
      // User has set their team and rank
      const rank = parseInt(teamRankInput);
      const myTeam: TeamRank = {
        teamName,
        teamKcsatAvg: kcsat,
        rank,
        agents: [agent],
      };
      // Add other placeholder teams to fill top 5 if needed
      const result: TeamRank[] = [];
      for (let i = 1; i <= 5; i++) {
        if (i === rank) {
          result.push(myTeam);
        } else {
          result.push({
            teamName: `Team ${i}`,
            teamKcsatAvg: 80 - i * 2, // placeholder
            rank: i,
            agents: [],
          });
        }
      }
      return result;
    }
    return allTeams.length > 0 ? allTeams : [];
  }, [teamName, teamRankInput, kcsat, agent, allTeams]);

  // Get base salary from settings
  const userSettings = useMemo(() => getUserSettings(userId), [userId]);
  const baseSalary = userSettings.baseSalary ?? userSettings.base_salary ?? 0;
  const taxRate = userSettings.taxRate ?? userSettings.tax_rate ?? 0;

  // Calculate bonus
  const bonusResult: BonusResult = useMemo(() => {
    if (!teamName && allTeams.length === 0) {
      // No team info — show eligibility only
      return {
        eligible: eligibility.eligible,
        disqualificationReason: eligibility.reasons.join("; ") || undefined,
        kcsatScore: kcsat,
        kcsatPass: eligibility.kcsatPass,
        productiveDays,
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

    return calculateBonus(agent, teams, teamName || "Unknown", baseSalary, taxRate);
  }, [agent, teams, teamName, baseSalary, taxRate, eligibility, kcsat, productiveDays]);

  const monthLabel = new Date(selectedYear, selectedMonth).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <Card className="border-border animate-fade-in overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Trophy className="h-6 w-6 text-primary" />
          Monthly Bonus Calculator
          <Badge variant="outline" className="ml-auto text-xs">
            {monthLabel}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* KCSAT Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">KCSAT Score</span>
              <Badge variant="outline" className="text-xs">40% CSAT + 30% Prod + 30% Close%</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-bold ${kcsat >= KCSAT_THRESHOLD ? "text-green-500" : "text-destructive"}`}>
                {kcsat.toFixed(1)}%
              </span>
              {kcsat >= KCSAT_THRESHOLD ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </div>
          </div>
          <div className="relative">
            <Progress value={Math.min(kcsat, 100)} className="h-3" />
            <div
              className={`absolute inset-0 h-3 rounded-full ${kcsat >= KCSAT_THRESHOLD ? "bg-green-500" : "bg-destructive"} opacity-80 transition-all`}
              style={{ width: `${Math.min(kcsat, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span className={kcsat < KCSAT_THRESHOLD ? "text-destructive font-bold" : ""}>
              Below {KCSAT_THRESHOLD}%: Disqualified
            </span>
            <span className={kcsat >= KCSAT_THRESHOLD ? "text-green-500 font-bold" : ""}>
              {KCSAT_THRESHOLD}%+: Eligible
            </span>
          </div>
        </div>

        {/* Eligibility Checklist */}
        <div className="space-y-1.5 p-3 rounded-lg bg-muted/30 border border-border/50">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Eligibility Checklist</p>
          <div className="flex items-center gap-2 text-sm">
            {eligibility.kcsatPass ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
            <span>KCSAT ≥ {KCSAT_THRESHOLD}% <span className="text-muted-foreground">({kcsat.toFixed(1)}%)</span></span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {eligibility.productiveDaysPass ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
            <span>Productive days ≥ {MIN_PRODUCTIVE_DAYS} <span className="text-muted-foreground">({productiveDays} days)</span></span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {eligibility.nestingPass ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
            <span>Out of nesting</span>
          </div>
        </div>

        {/* Team Settings */}
        <div className="space-y-3 p-3 rounded-lg border border-dashed border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Team & Ranking</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Your Team Name</Label>
              <Input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Chat Team Alpha"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Team Rank This Month</Label>
              <Select value={teamRankInput} onValueChange={setTeamRankInput}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select rank" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1st — 100%</SelectItem>
                  <SelectItem value="2">2nd — 90%</SelectItem>
                  <SelectItem value="3">3rd — 80%</SelectItem>
                  <SelectItem value="4">4th — 70%</SelectItem>
                  <SelectItem value="5">5th — 60%</SelectItem>
                  <SelectItem value="6+">6th or lower</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                id="nesting-check"
                checked={isInNesting}
                onChange={(e) => setIsInNesting(e.target.checked)}
                className="cursor-pointer"
              />
              <Label htmlFor="nesting-check" className="text-xs cursor-pointer">
                I am currently in nesting period
              </Label>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={saveSettings} className="gap-1">
            <Save className="h-3 w-3" /> Save Settings
          </Button>
        </div>

        {/* Bonus Result */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Bonus Result</span>
          </div>

          {bonusResult.eligible ? (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  {bonusResult.route === "team"
                    ? `🏆 Team Route — ${getTeamAwardLabel(bonusResult.teamRank!)}`
                    : "🌟 Individual Route — Top 20%"}
                </span>
                <Badge variant="default" className="bg-green-500 text-white">
                  {bonusResult.awardPercent}% award
                </Badge>
              </div>
              {baseSalary > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="bg-muted/50 p-2 rounded text-center">
                    <p className="text-[10px] text-muted-foreground">Bonus Pool</p>
                    <p className="text-sm font-bold">{formatEGP(bonusResult.bonusPool)}</p>
                    <p className="text-[9px] text-muted-foreground">Salary × {BONUS_POOL_PERCENT}%</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded text-center">
                    <p className="text-[10px] text-muted-foreground">Gross Bonus</p>
                    <p className="text-sm font-bold">{formatEGP(bonusResult.grossBonus)}</p>
                  </div>
                  <div className="bg-primary/10 p-2 rounded text-center border border-primary/20">
                    <p className="text-[10px] text-muted-foreground">Net Bonus</p>
                    <p className="text-lg font-bold text-primary">{formatEGP(bonusResult.netBonus)}</p>
                    {taxRate > 0 && <p className="text-[9px] text-muted-foreground">After {taxRate}% tax</p>}
                  </div>
                </div>
              )}
              {baseSalary === 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  💡 Set your base salary in Settings → Salary to see the payout amount
                </p>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-medium text-destructive">
                  {bonusResult.disqualificationReason || "Not eligible for bonus this month"}
                </span>
              </div>
              {baseSalary > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2 opacity-50">
                  <div className="bg-muted/50 p-2 rounded text-center">
                    <p className="text-[10px] text-muted-foreground">Bonus Pool</p>
                    <p className="text-sm font-bold line-through">{formatEGP(bonusResult.bonusPool)}</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded text-center">
                    <p className="text-[10px] text-muted-foreground">Gross Bonus</p>
                    <p className="text-sm font-bold line-through">{formatEGP(0)}</p>
                  </div>
                  <div className="bg-muted/50 p-2 rounded text-center">
                    <p className="text-[10px] text-muted-foreground">Net Bonus</p>
                    <p className="text-sm font-bold line-through">{formatEGP(0)}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bonus Rules Summary */}
        <div className="p-3 rounded-lg bg-muted/20 border border-dashed border-border/50 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">How It Works</span>
          </div>
          <div className="text-[11px] text-muted-foreground space-y-1">
            <p>• <strong>KCSAT Score:</strong> 40% CSAT + 30% Productivity + 30% Close Rate</p>
            <p>• <strong>KCSAT Gate:</strong> Below {KCSAT_THRESHOLD}% → disqualified (team AND individual)</p>
            <p>• <strong>Team Route:</strong> Top 5 teams → 1st=100%, 2nd=90%, 3rd=80%, 4th=70%, 5th=60%</p>
            <p>• <strong>Individual Route:</strong> 6th+ team → Top 20% of eligible agents → 100%</p>
            <p>• <strong>Bonus:</strong> Base Salary × {BONUS_POOL_PERCENT}% × Award %</p>
            <p>• <strong>Eligibility:</strong> {MIN_PRODUCTIVE_DAYS}+ productive days, out of nesting, KCSAT ≥ {KCSAT_THRESHOLD}%</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};