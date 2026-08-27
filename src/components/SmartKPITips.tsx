import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Lightbulb, TrendingUp, Phone, SmilePlus, Target } from "lucide-react";
import { getDailyChanges, getMonthData } from "@/lib/store";

interface SmartKPITipsProps {
  userId: string;
  selectedMonth: number;
  selectedYear: number;
  kpiScore: number;
  csatPercentage: number;
  totalGood: number;
  totalSurveys: number;
  surveyConversionRate?: number;
  remainingWorkDays?: number;
}

interface Tip {
  icon: React.ReactNode;
  text: string;
  priority: number;
  type: "calls" | "csat" | "survey" | "celebration";
}

export const SmartKPITips = ({
  userId,
  selectedMonth,
  selectedYear,
  kpiScore,
  csatPercentage,
  totalGood,
  totalSurveys,
  surveyConversionRate = 100,
  remainingWorkDays,
}: SmartKPITipsProps) => {
  const [totalCalls, setTotalCalls] = useState(0);
  const [recordedDays, setRecordedDays] = useState(0);

  useEffect(() => {
    if (!userId) return;
    try {
      const md = getMonthData(userId, selectedYear, selectedMonth);
      const changes = getDailyChanges(md.id);
      const dayMap = new Map<string, number>();
      changes.forEach((c) => {
        if (c.fieldName === "good" || c.fieldName === "genesysGood" ||
            c.fieldName === "bad" || c.fieldName === "genesysBad") {
          const current = dayMap.get(c.changeDate) || 0;
          dayMap.set(c.changeDate, current + Math.abs(c.changeAmount));
        }
      });
      let total = 0;
      let days = 0;
      dayMap.forEach((v) => {
        if (v > 0) { total += v; days++; }
      });
      setTotalCalls(total);
      setRecordedDays(days);
    } catch (e) {
      console.error(e);
    }
  }, [userId, selectedMonth, selectedYear]);

  const avgDailyCalls = useMemo(() => recordedDays > 0 ? totalCalls / recordedDays : 0, [totalCalls, recordedDays]);

  const tips = useMemo(() => {
    const result: Tip[] = [];

    if (kpiScore >= 100) {
      result.push({
        icon: <span className="text-lg">🏆</span>,
        text: "Perfect KPI! You're at 100% — keep this pace!",
        priority: 0,
        type: "celebration",
      });
      return result;
    }

    if (avgDailyCalls < 26 && recordedDays > 0) {
      const needed = Math.ceil(26 * recordedDays - totalCalls);
      result.push({
        icon: <Phone className="h-4 w-4 text-destructive" />,
        text: `⚠️ Avg ${avgDailyCalls.toFixed(1)} calls/day — need ${needed} more to reach 50% tier`,
        priority: 1,
        type: "calls",
      });
    } else if (avgDailyCalls < 28 && recordedDays > 0) {
      const needed = Math.ceil(28 * recordedDays - totalCalls);
      result.push({
        icon: <Phone className="h-4 w-4 text-warning" />,
        text: `📞 ${needed} more calls → 75% productivity (28/day)`,
        priority: 2,
        type: "calls",
      });
    } else if (avgDailyCalls < 30 && recordedDays > 0) {
      const needed = Math.ceil(30 * recordedDays - totalCalls);
      result.push({
        icon: <Phone className="h-4 w-4 text-primary" />,
        text: `🔥 Just ${needed} more calls → 100% productivity!`,
        priority: 2,
        type: "calls",
      });
    }

    if (csatPercentage < 87 && totalSurveys > 0) {
      const needed = Math.max(0, Math.ceil((0.87 * totalSurveys - totalGood) / (1 - 0.87)));
      result.push({
        icon: <SmilePlus className="h-4 w-4 text-destructive" />,
        text: `⚠️ CSAT ${csatPercentage.toFixed(1)}% — need ${needed} good ratings → 50% tier`,
        priority: 1,
        type: "csat",
      });
    } else if (csatPercentage < 90 && totalSurveys > 0) {
      const needed = Math.max(0, Math.ceil((0.90 * totalSurveys - totalGood) / (1 - 0.90)));
      result.push({
        icon: <SmilePlus className="h-4 w-4 text-warning" />,
        text: `😊 ${needed} more good ratings → 90% CSAT (75% tier)`,
        priority: 2,
        type: "csat",
      });
    } else if (csatPercentage < 93 && totalSurveys > 0) {
      const needed = Math.max(0, Math.ceil((0.93 * totalSurveys - totalGood) / (1 - 0.93)));
      result.push({
        icon: <SmilePlus className="h-4 w-4 text-primary" />,
        text: `🎯 ${needed} more good ratings → 93% CSAT = 100% score!`,
        priority: 2,
        type: "csat",
      });
    }

    if (surveyConversionRate < 85) {
      result.push({
        icon: <Target className="h-4 w-4 text-warning" />,
        text: `📋 Survey conversion ${surveyConversionRate.toFixed(0)}% — push to 85%+`,
        priority: 3,
        type: "survey",
      });
    }

    if (remainingWorkDays && remainingWorkDays > 0 && avgDailyCalls > 0 && avgDailyCalls < 30) {
      const totalDays = recordedDays + remainingWorkDays;
      const callsPerDay = Math.ceil((30 * totalDays - totalCalls) / remainingWorkDays);
      if (callsPerDay <= 35) {
        result.push({
          icon: <TrendingUp className="h-4 w-4 text-success" />,
          text: `📈 ${callsPerDay} calls/day for ${remainingWorkDays} days → 100% productivity`,
          priority: 4,
          type: "calls",
        });
      }
    }

    return result.sort((a, b) => a.priority - b.priority).slice(0, 3);
  }, [kpiScore, avgDailyCalls, totalCalls, recordedDays, csatPercentage, totalGood, totalSurveys, surveyConversionRate, remainingWorkDays]);

  if (tips.length === 0) return null;

  return (
    <Card className="p-3 border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 mb-2">
        <Lightbulb className="h-4 w-4 text-warning" />
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Smart Tips</span>
      </div>
      <div className="space-y-1.5">
        {tips.map((tip, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-foreground/90">
            <span className="mt-0.5 shrink-0">{tip.icon}</span>
            <span>{tip.text}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};