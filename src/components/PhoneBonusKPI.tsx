import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Phone, SmilePlus, CalendarOff, Trophy, DollarSign, Pencil, Save, X } from "lucide-react";
import { getMonthData, getDailyChanges, getUserSettings, updateMonthData } from "@/lib/store";

interface PhoneBonusKPIProps {
  userId: string;
  selectedMonth: number;
  selectedYear: number;
  csatPercentage: number;
  totalSurveys?: number;
  karmaPercentage?: number;  // Karma % — KPI is 0 if karma < 73%
}

const getProductivityScore = (avg: number) => {
  if (avg >= 30) return 100;
  if (avg >= 28) return 75;
  if (avg >= 26) return 50;
  return 0;
};

const getCsatScore = (csat: number) => {
  if (csat >= 93) return 100;
  if (csat >= 90) return 75;
  if (csat >= 87) return 50;
  return 0;
};

const getAbsenceGate = (days: number) => {
  if (days <= 1) return 100;
  if (days === 2) return 75;
  return 0;
};

const getScoreColor = (score: number) => {
  if (score === 100) return "text-green-500";
  if (score === 75) return "text-yellow-500";
  if (score === 50) return "text-orange-500";
  return "text-destructive";
};

const getScoreBg = (score: number) => {
  if (score === 100) return "bg-green-500";
  if (score === 75) return "bg-yellow-500";
  if (score === 50) return "bg-orange-500";
  return "bg-destructive";
};

const getBadgeVariant = (score: number): "default" | "secondary" | "destructive" | "outline" => {
  if (score >= 75) return "default";
  if (score >= 50) return "secondary";
  return "destructive";
};

const SHIFT_PREFIX = "gt_shifts_";

export const PhoneBonusKPI = ({ userId, selectedMonth, selectedYear, csatPercentage, totalSurveys = 0, karmaPercentage = 0 }: PhoneBonusKPIProps) => {
  const [totalCalls, setTotalCalls] = useState(0);
  const [recordedDays, setRecordedDays] = useState(0);
  const [absenceDays, setAbsenceDays] = useState(0);
  const [baseSalary, setBaseSalary] = useState<number | null>(null);
  const [taxRate, setTaxRate] = useState<number | null>(null);
  const [kpiPercentage, setKpiPercentage] = useState<number>(70);
  const [loading, setLoading] = useState(true);
  const [manualProductivity, setManualProductivity] = useState<number | null>(null);
  const [useManual, setUseManual] = useState(false);
  const [manualInput, setManualInput] = useState<string>("");
  const [editingManual, setEditingManual] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    try {
      const md = getMonthData(userId, selectedYear, selectedMonth);
      const changes = getDailyChanges(md.id);

      // Calculate calls from daily changes
      const dayMap = new Map<string, number>();
      changes.forEach(c => {
        if (c.fieldName === "good" || c.fieldName === "genesysGood" ||
            c.fieldName === "bad" || c.fieldName === "genesysBad") {
          const current = dayMap.get(c.changeDate) || 0;
          dayMap.set(c.changeDate, current + Math.abs(c.changeAmount));
        }
      });

      let calls = 0;
      let days = 0;
      dayMap.forEach(v => { if (v > 0) { calls += v; days++; } });
      setTotalCalls(calls);
      setRecordedDays(days);

      // Manual productivity from store
      const mp = (md as any).manualProductivity;
      if (mp != null) {
        setManualProductivity(Number(mp));
        setUseManual(true);
        setManualInput(String(mp));
      } else {
        setManualProductivity(null);
        setUseManual(false);
        setManualInput("");
      }

      // Count absence days from localStorage shifts
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      let absence = 0;
      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const key = `${SHIFT_PREFIX}${userId}_${dateStr}`;
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const shift = JSON.parse(raw);
            if (shift.is_off_day && (shift.absence_type === 'sick_leave' || shift.absence_type === 'unexcused')) {
              absence++;
            }
          } catch {}
        }
      }
      setAbsenceDays(absence);

      // Load salary settings
      const settings = getUserSettings(userId) as any;
      if (settings) {
        setBaseSalary(settings.baseSalary ?? settings.base_salary ?? null);
        setTaxRate(settings.taxRate ?? settings.tax_rate ?? null);
        setKpiPercentage(settings.kpiPercentage ?? settings.kpi_percentage ?? 70);
      }
    } catch (error) {
      console.error('Error loading KPI data:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, selectedMonth, selectedYear]);

  const avgDailyCalls = useMemo(() => recordedDays > 0 ? totalCalls / recordedDays : 0, [totalCalls, recordedDays]);
  const productivityScore = useMemo(() => {
    if (useManual && manualProductivity != null) return Math.max(0, Math.min(100, manualProductivity));
    return getProductivityScore(avgDailyCalls);
  }, [avgDailyCalls, useManual, manualProductivity]);
  const effectiveCsat = useMemo(() => totalSurveys === 0 ? 100 : csatPercentage, [totalSurveys, csatPercentage]);
  const csatScore = useMemo(() => getCsatScore(effectiveCsat), [effectiveCsat]);
  const absenceGate = useMemo(() => getAbsenceGate(absenceDays), [absenceDays]);

  // Karma gate: KPI is 0 if karma < 73%
  const KARMA_THRESHOLD = 73;
  const karmaGate = karmaPercentage >= KARMA_THRESHOLD ? 1 : 0;

  const finalBonus = useMemo(() => {
    const base = (productivityScore * 0.5) + (csatScore * 0.5);
    return karmaGate === 0 ? 0 : (base * absenceGate) / 100;
  }, [productivityScore, csatScore, absenceGate, karmaGate]);

  const saveManualProductivity = () => {
    const val = parseFloat(manualInput);
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error("Enter a value between 0 and 100");
      return;
    }
    try {
      updateMonthData(userId, selectedYear, selectedMonth, { manualProductivity: val } as any);
      setManualProductivity(val);
      setUseManual(true);
      setEditingManual(false);
      toast.success("Manual productivity saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save");
    }
  };

  const clearManualProductivity = () => {
    try {
      updateMonthData(userId, selectedYear, selectedMonth, { manualProductivity: null } as any);
      setManualProductivity(null);
      setUseManual(false);
      setManualInput("");
      setEditingManual(false);
      toast.success("Reverted to automatic productivity");
    } catch (e) {
      console.error(e);
    }
  };

  // Broadcast KPI score
  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent("ktb_kpi_score", { detail: finalBonus }));
      localStorage.setItem("ktb_kpi_score", String(finalBonus));
    } catch {}
  }, [finalBonus]);

  // KPI payout calculation
  const kpiPayout = useMemo(() => {
    if (baseSalary == null) return null;
    const kpiPoolGross = baseSalary * (kpiPercentage / 100);
    const tax = taxRate != null ? taxRate / 100 : 0;
    const kpiPoolNet = kpiPoolGross * (1 - tax);
    const grossBonus = kpiPoolGross * (finalBonus / 100);
    const netBonus = grossBonus * (1 - tax);
    return { kpiPoolNet, grossBonus, netBonus };
  }, [baseSalary, taxRate, kpiPercentage, finalBonus]);

  if (loading) {
    return (
      <Card className="p-6 border-border animate-pulse">
        <div className="h-40 bg-muted rounded" />
      </Card>
    );
  }

  return (
    <Card className="border-border animate-fade-in overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xl">
          <Trophy className="h-6 w-6 text-primary" />
          Phone Bonus KPI
          <Badge variant={getBadgeVariant(finalBonus)} className="ml-auto text-lg px-3 py-1">
            {finalBonus.toFixed(0)}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Productivity (50%) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Productivity</span>
              <Badge variant="outline" className="text-xs">50%</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {useManual ? 'Manual entry' : `${avgDailyCalls.toFixed(1)} calls/day (${totalCalls} total / ${recordedDays} days)`}
              </span>
              <span className={`font-bold ${getScoreColor(productivityScore)}`}>
                {productivityScore}%
              </span>
            </div>
          </div>
          <div className="relative">
            <Progress value={productivityScore} className="h-3" />
            <div className={`absolute inset-0 h-3 rounded-full ${getScoreBg(productivityScore)} opacity-80 transition-all`}
              style={{ width: `${productivityScore}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{"<26: 0%"}</span>
            <span>26-28: 50%</span>
            <span>28-30: 75%</span>
            <span>30+: 100%</span>
          </div>
          {productivityScore < 100 && recordedDays > 0 && !useManual && (
            <p className="text-xs text-muted-foreground mt-1">
              📈 Need <span className="font-bold text-primary">{Math.ceil((30 * recordedDays) - totalCalls)}</span> more calls to reach 100% (30 calls/day)
            </p>
          )}

          {/* Manual productivity override */}
          <div className="mt-3 p-3 rounded-lg border border-dashed border-border bg-muted/30 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs font-semibold">Manual Productivity Override</Label>
                {useManual && <Badge variant="default" className="text-[9px] h-4">ACTIVE</Badge>}
              </div>
              <Switch
                checked={useManual || editingManual}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setEditingManual(true);
                    if (manualInput === "" && manualProductivity != null) setManualInput(String(manualProductivity));
                  } else {
                    if (useManual) clearManualProductivity();
                    setEditingManual(false);
                  }
                }}
              />
            </div>
            {(editingManual || useManual) && (
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={100} step="0.1"
                  placeholder="0-100"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="h-8 text-sm"
                />
                <Button size="sm" className="h-8" onClick={saveManualProductivity}>
                  <Save className="h-3.5 w-3.5" />
                </Button>
                {useManual && (
                  <Button size="sm" variant="outline" className="h-8" onClick={clearManualProductivity}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">
              Type a productivity score (0-100%) for {new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} and the KPI will use it instead of the automatic calculation.
            </p>
          </div>
        </div>

        {/* CSAT (50%) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SmilePlus className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">CSAT</span>
              <Badge variant="outline" className="text-xs">50%</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {effectiveCsat.toFixed(1)}%{totalSurveys === 0 ? ' (no surveys yet)' : ''}
              </span>
              <span className={`font-bold ${getScoreColor(csatScore)}`}>
                {csatScore}%
              </span>
            </div>
          </div>
          <div className="relative">
            <Progress value={csatScore} className="h-3" />
            <div className={`absolute inset-0 h-3 rounded-full ${getScoreBg(csatScore)} opacity-80 transition-all`}
              style={{ width: `${csatScore}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{"<87%: 0%"}</span>
            <span>87-90%: 50%</span>
            <span>90-93%: 75%</span>
            <span>93%+: 100%</span>
          </div>
        </div>

        {/* Absence Gate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Absence Gate</span>
              <Badge variant="outline" className="text-xs">Multiplier</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {absenceDays} absence day{absenceDays !== 1 ? 's' : ''}
              </span>
              <span className={`font-bold ${getScoreColor(absenceGate)}`}>
                ×{(absenceGate / 100).toFixed(2)}
              </span>
            </div>
          </div>
          <div className="relative">
            <Progress value={absenceGate} className="h-3" />
            <div className={`absolute inset-0 h-3 rounded-full ${getScoreBg(absenceGate)} opacity-80 transition-all`}
              style={{ width: `${absenceGate}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>3+ days: 0%</span>
            <span>2 days: 75%</span>
            <span>0-1 day: 100%</span>
          </div>
        </div>

        {/* Karma Gate */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">🔒 Karma Gate</span>
              <Badge variant="outline" className="text-xs">Required ≥ {KARMA_THRESHOLD}%</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {karmaPercentage.toFixed(1)}% karma
              </span>
              <span className={`font-bold ${karmaGate === 1 ? 'text-green-500' : 'text-destructive'}`}>
                {karmaGate === 1 ? '✓ PASS' : `✗ < ${KARMA_THRESHOLD}%`}
              </span>
            </div>
          </div>
          <div className="relative">
            <Progress value={karmaPercentage} className="h-3" />
            <div className={`absolute inset-0 h-3 rounded-full ${karmaPercentage >= KARMA_THRESHOLD ? 'bg-green-500' : 'bg-destructive'} opacity-80 transition-all`}
              style={{ width: `${Math.min(karmaPercentage, 100)}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>{`< ${KARMA_THRESHOLD}%: KPI = 0`}</span>
            <span>{`≥ ${KARMA_THRESHOLD}%: KPI unlocked`}</span>
          </div>
        </div>

        {/* Final Result */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Final = (Productivity×50% + CSAT×50%) × Absence × Karma Gate
            </span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              ({productivityScore}×50% + {csatScore}×50%) × {absenceGate}% × (karma{karmaPercentage.toFixed(0)}% {karmaGate === 1 ? '✓' : '✗'})
            </span>
            <span className={`text-3xl font-bold ${getScoreColor(finalBonus)}`}>
              {finalBonus.toFixed(0)}%
            </span>
          </div>
          {karmaGate === 0 && (
            <p className="text-xs text-destructive mt-2">
              🔒 KPI locked — reach {KARMA_THRESHOLD}% karma to unlock
            </p>
          )}
        </div>

        {/* KPI Payout */}
        {kpiPayout && (
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold">Estimated KPI Payout</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 p-3 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground mb-1">KPI Pool (Net)</p>
                <p className="text-sm font-bold">{kpiPayout.kpiPoolNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="bg-muted/50 p-3 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground mb-1">Gross Bonus</p>
                <p className="text-sm font-bold">{kpiPayout.grossBonus.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="bg-primary/10 p-3 rounded-lg text-center border border-primary/20">
                <p className="text-[10px] text-muted-foreground mb-1">Net Bonus{taxRate != null ? ` (-${taxRate}%)` : ''}</p>
                <p className="text-lg font-bold text-primary">{kpiPayout.netBonus.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Based on base salary of {baseSalary?.toLocaleString()}{taxRate != null ? ` with ${taxRate}% tax` : ''}
            </p>
          </div>
        )}

        {!kpiPayout && (
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground text-center">
              💡 Set your base salary in Settings → Salary & KPI to see your estimated payout
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};