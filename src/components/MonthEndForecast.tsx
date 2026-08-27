import { Card } from "@/components/ui/card";
import { Target, Calendar, AlertTriangle, CheckCircle, Brain, Zap, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { useMemo, useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/useAuth";
import { listMonthData, getDailyChanges } from "@/lib/store";

interface MonthEndForecastProps {
  currentGood: number;
  currentBad: number;
  karmaBad: number;
  remainingWorkDays: number | undefined;
  previousMonthData?: {
    good: number;
    bad: number;
    karmaBad: number;
  } | null;
  dailyChanges: any[];
  selectedMonth: number;
  selectedYear: number;
}

interface HistoricalMonth {
  year: number;
  month: number;
  good: number;
  bad: number;
  karma_bad: number;
  genesys_good: number;
  genesys_bad: number;
  fcr: number;
}

export const MonthEndForecast = ({
  currentGood,
  currentBad,
  karmaBad,
  remainingWorkDays,
  previousMonthData,
  dailyChanges,
  selectedMonth,
  selectedYear,
}: MonthEndForecastProps) => {
  const { user } = useAuth();
  const userId = user?.id || "local";
  const [historicalData, setHistoricalData] = useState<HistoricalMonth[]>([]);

  useEffect(() => {
    if (!user) return;
    try {
      const allMonths = listMonthData(userId);
      const months: HistoricalMonth[] = [];
      for (let i = 1; i <= 6; i++) {
        let m = selectedMonth - i;
        let y = selectedYear;
        while (m < 0) { m += 12; y -= 1; }
        const found = allMonths.find(d => d.year === y && d.month === m);
        if (found) {
          months.push({
            year: found.year,
            month: found.month,
            good: found.good,
            bad: found.bad,
            karma_bad: found.karmaBad,
            genesys_good: found.genesysGood,
            genesys_bad: found.genesysBad,
            fcr: found.fcr,
          });
        }
      }
      setHistoricalData(months);
    } catch (e) {
      console.error('Error fetching historical data:', e);
    }
  }, [user, userId, selectedMonth, selectedYear]);

  const forecast = useMemo(() => {
    const today = new Date();
    const isCurrentMonth = selectedMonth === today.getMonth() && selectedYear === today.getFullYear();

    if (!isCurrentMonth) {
      const totalGood = currentGood;
      const totalBad = currentBad;
      const csat = (totalGood + totalBad) > 0 ? (totalGood / (totalGood + totalBad)) * 100 : 0;
      const totalKarma = totalGood + totalBad + karmaBad;
      const karma = totalKarma > 0 ? (totalGood / totalKarma) * 100 : 0;
      return { isPastMonth: true, actualCsat: csat, actualKarma: karma };
    }

    const dayStats: Record<string, { good: number; bad: number }> = {};
    dailyChanges.forEach((change: any) => {
      const isGood = change.fieldName === "good" || change.fieldName === "genesysGood" || change.field_name === "good" || change.field_name === "genesys_good";
      const isBad = change.fieldName === "bad" || change.fieldName === "genesysBad" || change.fieldName === "karmaBad" || change.field_name === "bad" || change.field_name === "genesys_bad" || change.field_name === "karma_bad";
      const amount = Math.max(0, change.changeAmount || change.change_amount || 0);
      const dateKey = change.changeDate || change.change_date || "";
      if (!dayStats[dateKey]) dayStats[dateKey] = { good: 0, bad: 0 };
      if (isGood) dayStats[dateKey].good += amount;
      if (isBad) dayStats[dateKey].bad += amount;
    });

    const daysWithData = Object.keys(dayStats).length;
    const totalDailyGood = Object.values(dayStats).reduce((sum, d) => sum + d.good, 0);
    const totalDailyBad = Object.values(dayStats).reduce((sum, d) => sum + d.bad, 0);
    const avgDailyGood = daysWithData > 0 ? totalDailyGood / daysWithData : 0;
    const avgDailyBad = daysWithData > 0 ? totalDailyBad / daysWithData : 0;

    const historicalKarmas = historicalData.map(h => {
      const tg = h.good + h.genesys_good;
      const tb = h.bad + h.genesys_bad;
      const total = tg + tb + h.karma_bad;
      return { karma: total > 0 ? (tg / total) * 100 : 0, csat: (tg + tb) > 0 ? (tg / (tg + tb)) * 100 : 0, good: tg, bad: tb + h.karma_bad };
    });

    let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';
    let trendStrength = 0;
    if (historicalKarmas.length >= 2) {
      const recent = historicalKarmas.slice(-3);
      const diffs = recent.slice(1).map((r, i) => r.karma - recent[i].karma);
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      if (avgDiff > 1.5) { trendDirection = 'improving'; trendStrength = Math.min(avgDiff, 10); }
      else if (avgDiff < -1.5) { trendDirection = 'declining'; trendStrength = Math.min(Math.abs(avgDiff), 10); }
    }

    const histAvgDailyGood = historicalData.length > 0
      ? historicalData.reduce((sum, h) => sum + (h.good + h.genesys_good), 0) / (historicalData.length * 20)
      : 0;

    let weightedAvgGood = avgDailyGood;
    let weightedAvgBad = avgDailyBad;

    if (daysWithData < 10 && historicalData.length > 0) {
      const currentWeight = Math.min(daysWithData / 10, 1);
      const histWeight = 1 - currentWeight;
      const histDailyBad = historicalData.reduce((sum, h) => sum + h.bad + h.genesys_bad + h.karma_bad, 0) / (historicalData.length * 20);
      weightedAvgGood = avgDailyGood * currentWeight + histAvgDailyGood * histWeight;
      weightedAvgBad = avgDailyBad * currentWeight + histDailyBad * histWeight;
    }

    if (trendDirection === 'improving') weightedAvgGood *= (1 + trendStrength * 0.01);
    else if (trendDirection === 'declining') weightedAvgBad *= (1 + trendStrength * 0.01);

    const remaining = remainingWorkDays ?? 0;
    const projectedGood = currentGood + Math.round(weightedAvgGood * remaining);
    const projectedBad = currentBad + Math.round(weightedAvgBad * remaining);
    const projectedKarmaBad = karmaBad;

    const projectedTotal = projectedGood + projectedBad;
    const projectedKarmaTotal = projectedGood + projectedBad + projectedKarmaBad;
    const forecastCsat = projectedTotal > 0 ? (projectedGood / projectedTotal) * 100 : 0;
    const forecastKarma = projectedKarmaTotal > 0 ? (projectedGood / projectedKarmaTotal) * 100 : 0;

    const currentTotal = currentGood + currentBad;
    const currentKarmaTotal = currentGood + currentBad + karmaBad;
    const currentCsat = currentTotal > 0 ? (currentGood / currentTotal) * 100 : 0;
    const currentKarma = currentKarmaTotal > 0 ? (currentGood / currentKarmaTotal) * 100 : 0;

    let bestMonth: { karma: number; label: string } | null = null;
    let worstMonth: { karma: number; label: string } | null = null;
    if (historicalKarmas.length > 0) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      historicalKarmas.forEach((h, i) => {
        const label = `${monthNames[historicalData[i].month]} ${historicalData[i].year}`;
        if (!bestMonth || h.karma > bestMonth.karma) bestMonth = { karma: h.karma, label };
        if (!worstMonth || h.karma < worstMonth.karma) worstMonth = { karma: h.karma, label };
      });
    }

    const histAvgKarma = historicalKarmas.length > 0
      ? historicalKarmas.reduce((sum, h) => sum + h.karma, 0) / historicalKarmas.length
      : null;

    const paceVsHistory = histAvgDailyGood > 0
      ? ((avgDailyGood - histAvgDailyGood) / histAvgDailyGood) * 100
      : null;

    const targets = [88, 90, 95];
    const neededForTargets = targets.map(target => {
      const neededGood = Math.ceil((target / 100) * projectedKarmaTotal);
      const additionalNeeded = Math.max(0, neededGood - projectedGood);
      const perDay = remaining > 0 ? Math.ceil(additionalNeeded / remaining) : additionalNeeded;
      return {
        target,
        neededTotal: neededGood,
        additionalNeeded,
        perDay,
        isAchievable: additionalNeeded <= remaining * 10,
        willMeet: forecastKarma >= target,
      };
    });

    const insights: { icon: 'up' | 'down' | 'brain' | 'zap'; text: string; type: 'success' | 'warning' | 'info' }[] = [];

    if (trendDirection === 'improving') insights.push({ icon: 'up', text: `Your performance has been improving over the last ${historicalData.length} months`, type: 'success' });
    else if (trendDirection === 'declining') insights.push({ icon: 'down', text: `Your performance is gradually declining — focus on quality`, type: 'warning' });

    if (paceVsHistory !== null) {
      if (paceVsHistory > 15) insights.push({ icon: 'zap', text: `Current pace is ${Math.round(paceVsHistory)}% above your historical average 🔥`, type: 'success' });
      else if (paceVsHistory < -15) insights.push({ icon: 'brain', text: `Pace is ${Math.round(Math.abs(paceVsHistory))}% below your average — need to pick it up`, type: 'warning' });
    }

    if (histAvgKarma !== null && forecastKarma > histAvgKarma + 2) insights.push({ icon: 'up', text: `On track to beat your historical Karma avg (${histAvgKarma.toFixed(1)}%)`, type: 'success' });
    else if (histAvgKarma !== null && forecastKarma < histAvgKarma - 2) insights.push({ icon: 'down', text: `Forecast below your historical avg (${histAvgKarma.toFixed(1)}%) — still time to improve`, type: 'warning' });

    if (bestMonth && forecastKarma > bestMonth.karma) insights.push({ icon: 'zap', text: `Could be your best month ever! Previous best: ${bestMonth.label} (${bestMonth.karma.toFixed(1)}%)`, type: 'success' });

    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (daysWithData >= 10 && historicalData.length >= 3) confidence = 'high';
    else if (daysWithData >= 5 || historicalData.length >= 2) confidence = 'medium';

    return {
      isPastMonth: false,
      currentCsat,
      currentKarma,
      forecastCsat,
      forecastKarma,
      projectedGood,
      projectedBad,
      remainingDays: remaining,
      avgDailyGood: weightedAvgGood,
      avgDailyBad: weightedAvgBad,
      neededForTargets,
      confidence,
      daysWithData,
      trendDirection,
      trendStrength,
      histAvgKarma,
      histAvgDailyGood,
      paceVsHistory,
      bestMonth,
      worstMonth,
      insights,
      historicalMonths: historicalData.length,
    };
  }, [currentGood, currentBad, karmaBad, remainingWorkDays, previousMonthData, dailyChanges, selectedMonth, selectedYear, historicalData]);

  if (forecast.isPastMonth) {
    return (
      <Card className="p-6 border-border">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Month Results</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Final CSAT</p>
            <p className="text-2xl font-bold text-primary">{forecast.actualCsat?.toFixed(1)}%</p>
          </div>
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Final Karma</p>
            <p className="text-2xl font-bold text-primary">{forecast.actualKarma?.toFixed(1)}%</p>
          </div>
        </div>
      </Card>
    );
  }

  const getConfidenceBadge = () => {
    const colors = { high: 'bg-success/15 text-success border-success/30', medium: 'bg-warning/15 text-warning border-warning/30', low: 'bg-muted text-muted-foreground border-border' };
    const labels = { high: 'HIGH', medium: 'MED', low: 'LOW' };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[forecast.confidence!]}`}>
        {labels[forecast.confidence!]} • {forecast.daysWithData}d + {forecast.historicalMonths}mo
      </span>
    );
  };

  const TrendIcon = forecast.trendDirection === 'improving' ? ArrowUpRight : forecast.trendDirection === 'declining' ? ArrowDownRight : Minus;
  const trendColor = forecast.trendDirection === 'improving' ? 'text-success' : forecast.trendDirection === 'declining' ? 'text-destructive' : 'text-muted-foreground';

  const InsightIcon = ({ type }: { type: 'up' | 'down' | 'brain' | 'zap' }) => {
    switch (type) {
      case 'up': return <ArrowUpRight className="h-3.5 w-3.5 text-success flex-shrink-0" />;
      case 'down': return <ArrowDownRight className="h-3.5 w-3.5 text-destructive flex-shrink-0" />;
      case 'brain': return <Brain className="h-3.5 w-3.5 text-warning flex-shrink-0" />;
      case 'zap': return <Zap className="h-3.5 w-3.5 text-primary flex-shrink-0" />;
    }
  };

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Brain className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Smart Forecast</h3>
            <p className="text-[11px] text-muted-foreground">Based on {forecast.historicalMonths} months history + current pace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TrendIcon className={`h-4 w-4 ${trendColor}`} />
          {getConfidenceBadge()}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="p-3 bg-muted rounded-xl">
          <p className="text-[11px] text-muted-foreground mb-1">Now</p>
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-muted-foreground">CSAT</span>
              <span className="text-sm font-bold text-foreground">{forecast.currentCsat?.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-muted-foreground">Karma</span>
              <span className="text-sm font-bold text-foreground">{forecast.currentKarma?.toFixed(1)}%</span>
            </div>
          </div>
        </div>
        <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
          <p className="text-[11px] text-primary mb-1">Forecast</p>
          <div className="space-y-1">
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-muted-foreground">CSAT</span>
              <span className="text-sm font-bold text-primary">{forecast.forecastCsat?.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-[11px] text-muted-foreground">Karma</span>
              <span className="text-sm font-bold text-primary">{forecast.forecastKarma?.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-5">
        <div className="text-center p-2 bg-muted rounded-lg">
          <p className="text-[10px] text-muted-foreground">Days Left</p>
          <p className="text-base font-bold text-foreground">{forecast.remainingDays}</p>
        </div>
        <div className="text-center p-2 bg-muted rounded-lg">
          <p className="text-[10px] text-muted-foreground">Good/Day</p>
          <p className="text-base font-bold text-success">+{forecast.avgDailyGood?.toFixed(1)}</p>
        </div>
        <div className="text-center p-2 bg-muted rounded-lg">
          <p className="text-[10px] text-muted-foreground">Projected</p>
          <p className="text-base font-bold text-primary">{forecast.projectedGood}</p>
        </div>
        <div className="text-center p-2 bg-muted rounded-lg">
          <p className="text-[10px] text-muted-foreground">Pace</p>
          <p className={`text-base font-bold ${(forecast.paceVsHistory ?? 0) >= 0 ? 'text-success' : 'text-destructive'}`}>
            {forecast.paceVsHistory !== null ? `${forecast.paceVsHistory > 0 ? '+' : ''}${Math.round(forecast.paceVsHistory)}%` : '—'}
          </p>
        </div>
      </div>

      {forecast.histAvgKarma !== null && (
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl mb-5 border border-border/50">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Historical Avg Karma</span>
              <span className="text-xs font-semibold text-foreground">{forecast.histAvgKarma.toFixed(1)}%</span>
            </div>
            <Progress value={Math.min(100, (forecast.forecastKarma ?? 0) / Math.max(forecast.histAvgKarma, 1) * 100)} className="h-1.5" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              {forecast.worstMonth && <span>Worst: {forecast.worstMonth.label} ({forecast.worstMonth.karma.toFixed(0)}%)</span>}
              {forecast.bestMonth && <span>Best: {forecast.bestMonth.label} ({forecast.bestMonth.karma.toFixed(0)}%)</span>}
            </div>
          </div>
        </div>
      )}

      {forecast.insights && forecast.insights.length > 0 && (
        <div className="space-y-2 mb-5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pattern Insights</p>
          {forecast.insights.map((insight, i) => (
            <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${
              insight.type === 'success' ? 'bg-success/10 text-success' :
              insight.type === 'warning' ? 'bg-warning/10 text-warning' :
              'bg-muted text-muted-foreground'
            }`}>
              <InsightIcon type={insight.icon} />
              <span className="leading-relaxed">{insight.text}</span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Target Forecast</p>
        {forecast.neededForTargets?.map((targetInfo) => (
          <div key={targetInfo.target} className="p-3 bg-muted rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-semibold text-foreground">{targetInfo.target}%</span>
              </div>
              {targetInfo.willMeet ? (
                <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                  <CheckCircle className="h-3 w-3" /> On track
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] font-medium text-warning">
                  <AlertTriangle className="h-3 w-3" /> +{targetInfo.additionalNeeded}
                </span>
              )}
            </div>
            <Progress value={Math.min(100, (forecast.forecastKarma ?? 0) / targetInfo.target * 100)} className="h-1.5" />
            {!targetInfo.willMeet && targetInfo.additionalNeeded > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1.5">~{targetInfo.perDay} extra good/day needed</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};