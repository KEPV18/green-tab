import { Card } from "@/components/ui/card";
import { Calendar, TrendingUp, TrendingDown, CheckCircle, XCircle } from "lucide-react";

interface WeeklyData {
  week: number;
  csat: number;
  dsat: number;
}

interface WeeklyProgressProps {
  selectedMonth: number;
  selectedYear: number;
  weeklyData: WeeklyData[];
  currentKarma: number; // Add current overall karma percentage
}

export const WeeklyProgress = ({ selectedMonth, selectedYear, weeklyData, currentKarma }: WeeklyProgressProps) => {
  const weekTargets = [
    { week: 1, target: 80, days: "1-7" },
    { week: 2, target: 84, days: "8-14" },
    { week: 3, target: 86, days: "15-21" },
    { week: 4, target: 90, days: "22-End" },
  ];

  const getCurrentWeek = () => {
    const today = new Date();
    if (today.getMonth() !== selectedMonth || today.getFullYear() !== selectedYear) {
      return -1; // Not current month
    }
    const day = today.getDate();
    if (day <= 7) return 1;
    if (day <= 14) return 2;
    if (day <= 21) return 3;
    return 4;
  };

  const currentWeek = getCurrentWeek();

  const getWeekStatus = (weekNumber: number) => {
    const weekData = weeklyData.find(w => w.week === weekNumber);
    const target = weekTargets[weekNumber - 1].target;
    
    // Compare with previous week
    let comparison = null;
    if (weekNumber > 1) {
      const prevWeekData = weeklyData.find(w => w.week === weekNumber - 1);
      if (prevWeekData && (prevWeekData.csat + prevWeekData.dsat) > 0 && weekData && (weekData.csat + weekData.dsat) > 0) {
        const currentTotal = weekData.csat + weekData.dsat;
        const prevTotal = prevWeekData.csat + prevWeekData.dsat;
        const currentPercent = (weekData.csat / currentTotal) * 100;
        const prevPercent = (prevWeekData.csat / prevTotal) * 100;
        
        const diff = currentPercent - prevPercent;
        comparison = {
          diff: diff,
          improved: diff > 0,
          label: `${Math.abs(diff).toFixed(1)}%`
        };
      }
    }
    
    if (currentWeek === 4) {
      const week4Data = weeklyData.find(w => w.week === 4);
      if (week4Data && (week4Data.csat + week4Data.dsat) > 0) {
        const week4Total = week4Data.csat + week4Data.dsat;
        const week4Percentage = (week4Data.csat / week4Total) * 100;
        const week4Target = weekTargets[3].target;
        
        if (week4Percentage >= week4Target && weekNumber < 4) {
          
          if (!weekData || (weekData.csat === 0 && weekData.dsat === 0)) {
            return { met: true, percentage: 0, hasData: false, autoMet: true, comparison };
          }
        }
      }
    }
    
    if (!weekData || (weekData.csat === 0 && weekData.dsat === 0)) {
      return { met: false, percentage: 0, hasData: false, comparison };
    }
    
    const total = weekData.csat + weekData.dsat;
    const percentage = (weekData.csat / total) * 100;
    
    return {
      met: percentage >= target,
      percentage,
      totalGood: weekData.csat,
      totalBad: weekData.dsat,
      total,
      hasData: true,
      comparison
    };
  };

  const renderComparison = (comparison: any) => {
    if (!comparison) return null;
    return (
      <div className={`text-xs mt-1 flex items-center gap-1 ${comparison.improved ? 'text-green-500' : 'text-red-500'}`}>
        {comparison.improved ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        <span>{comparison.improved ? '+' : ''}{comparison.label} vs last week</span>
      </div>
    );
  };

  
  const getAdvancedLevel = () => {
    if (currentWeek !== 4) return null;
    
    const week4Data = weeklyData.find(w => w.week === 4);
    if (!week4Data || (week4Data.csat + week4Data.dsat) === 0) return null;
    
    const total = week4Data.csat + week4Data.dsat;
    const percentage = (week4Data.csat / total) * 100;
    const baseTarget = 88;
    const advancedTarget = 90;
    const expertTarget = 95;
    
    if (percentage >= baseTarget && percentage < advancedTarget) {
      const needed = Math.ceil((advancedTarget * (total + week4Data.dsat)) / 100) - week4Data.csat;
      return {
        current: percentage,
        target: advancedTarget,
        needed: needed > 0 ? needed : 0,
        message: "Can you reach 90%? 🚀"
      };
    }
    
    if (percentage >= advancedTarget && percentage < expertTarget) {
      const needed = Math.ceil((expertTarget * (total + week4Data.dsat)) / 100) - week4Data.csat;
      return {
        current: percentage,
        target: expertTarget,
        needed: needed > 0 ? needed : 0,
        message: "Expert level 95%! 🏆"
      };
    }
    
    if (percentage >= expertTarget) {
      return {
        current: percentage,
        target: expertTarget,
        needed: 0,
        message: "You are at expert level! 🌟"
      };
    }
    
    return null;
  };

  const advancedLevel = getAdvancedLevel();

  const monthName = new Date(selectedYear, selectedMonth).toLocaleString("en-US", { month: "long" });

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Weekly Progress Tracker</h3>
        <p className="text-xs text-muted-foreground ml-auto">
          Calculated from daily changes in {monthName}
        </p>
      </div>
      <div className="space-y-3">
        {weekTargets.map((weekInfo) => {
          const isCurrentWeek = currentWeek === weekInfo.week;
          const isPastWeek = currentWeek > weekInfo.week || currentWeek === -1;
          const status = getWeekStatus(weekInfo.week);
          
          // Use actual current karma for the current week display
          const displayPercentage = isCurrentWeek ? currentKarma : status.percentage;
          const displayMet = isCurrentWeek ? currentKarma >= weekInfo.target : status.met;
          
          return (
            <div
              key={weekInfo.week}
              className={`flex items-center justify-between p-4 rounded-lg transition-all ${
                isCurrentWeek
                  ? "bg-primary/10 border-2 border-primary"
                  : isPastWeek
                  ? displayMet
                    ? "bg-success/10 border border-success"
                    : "bg-destructive/10 border border-destructive"
                  : "bg-muted border border-border"
              }`}
            >
              <div className="flex items-center gap-3">
                {isPastWeek ? (
                  displayMet ? (
                    <CheckCircle className="h-5 w-5 text-success" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )
                ) : isCurrentWeek ? (
                  <TrendingUp className="h-5 w-5 text-primary" />
                ) : (
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Week {weekInfo.week} ({weekInfo.days})
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Target: {weekInfo.target}%
                  </p>
                  {renderComparison(status.comparison)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isCurrentWeek ? (
                  <span className={`text-sm font-medium ${
                    displayMet ? "text-success" : "text-primary"
                  }`}>
                    Current: {displayPercentage.toFixed(1)}%
                    {displayMet && " ✓"}
                  </span>
                ) : status.hasData ? (
                  <>
                    <span className={`text-sm font-medium ${
                      displayMet ? "text-success" : "text-destructive"
                    }`}>
                      {status.percentage.toFixed(1)}%
                      {isPastWeek && displayMet && " ✓"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({status.totalGood}/{status.total})
                    </span>
                  </>
                ) : status.autoMet ? (
                  <span className="text-sm text-success font-medium">Auto-achieved ✓</span>
                ) : (
                  <span className="text-sm text-muted-foreground">No data yet</span>
                )}
              </div>
            </div>
          );
        })}
        
        {/* Advanced level for high performers */}
        {advancedLevel && (
          <div className="mt-4 p-5 rounded-lg bg-gradient-to-r from-primary/20 via-success/20 to-primary/20 border-2 border-primary/50 animate-pulse-glow">
            <div className="flex items-center gap-3 mb-3">
              <TrendingUp className="h-6 w-6 text-primary" />
              <h4 className="text-lg font-bold text-primary">{advancedLevel.message}</h4>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Current:</span>
                <span className="text-lg font-bold text-success">{advancedLevel.current.toFixed(1)}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Next target:</span>
                <span className="text-lg font-bold text-primary">{advancedLevel.target}%</span>
              </div>
              {advancedLevel.needed > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-sm font-medium text-foreground">You need:</span>
                  <span className="text-xl font-bold text-primary">{advancedLevel.needed} extra good ratings</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
