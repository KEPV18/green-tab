import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { BarChart3, TrendingUp } from "lucide-react";
import { getMonthData, getDailyChanges } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";

interface SurveyConversionProps {
  userId: string;
  selectedMonth: number;
  selectedYear: number;
}

export const SurveyConversion = ({ userId, selectedMonth, selectedYear }: SurveyConversionProps) => {
  const { user } = useAuth();
  const [conversionRate, setConversionRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    try {
      // Without daily_survey_calls, we estimate conversion from daily changes
      // This is a simplified approximation
      const md = getMonthData(userId || "local", selectedYear, selectedMonth);
      const totalGood = (md.good || 0) + (md.genesysGood || 0);
      const totalBad = (md.bad || 0) + (md.genesysBad || 0);
      const total = totalGood + totalBad;
      
      if (total > 0) {
        // Approximate: if we had surveys, the conversion is roughly total surveys / working days
        // Since we don't have call data, show the total survey count
        setConversionRate(total);
      } else {
        setConversionRate(0);
      }
    } catch (e) {
      console.error('Error loading survey conversion:', e);
    } finally {
      setLoading(false);
    }
  }, [user, userId, selectedMonth, selectedYear]);

  if (loading) return null;

  return (
    <Card className="p-3 border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Surveys This Month</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums">{conversionRate ?? 0}</span>
        <span className="text-xs text-muted-foreground">total surveys</span>
      </div>
    </Card>
  );
};