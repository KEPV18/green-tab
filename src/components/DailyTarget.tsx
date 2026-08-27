import { useEffect, useMemo, useState } from "react";
import { Target, CheckCircle, Flame, AlertTriangle, Trophy, Star } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface DailyTargetProps {
  currentGood: number;
  totalNegatives: number;
  karmaBad: number;
  selectedMonth: number;
  selectedYear: number;
  todayGood: number;
  todayBad: number;
  remainingWorkingDays?: number;
}

interface LevelTarget {
  level: number;
  percentage: number;
  needed: number;
  dailyTarget: number;
  label: string;
  icon: React.ReactNode;
}

export const DailyTarget = ({
  currentGood,
  totalNegatives,
  karmaBad,
  selectedMonth,
  selectedYear,
  todayGood,
  todayBad,
  remainingWorkingDays: propRemainingDays,
}: DailyTargetProps) => {
  const [streak, setStreak] = useState<number>(() => {
    const v = localStorage.getItem("ktb_streak_count");
    return v ? parseInt(v, 10) || 0 : 0;
  });
  const [lastDate, setLastDate] = useState<string>(() => {
    return localStorage.getItem("ktb_streak_lastDate") || "";
  });
  const calculations = useMemo(() => {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const isCurrentMonth = selectedMonth === currentMonth && selectedYear === currentYear;
    
    if (!isCurrentMonth) return null;
    
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const remainingCalendarDays = lastDay - currentDay;
    
    let remainingWorkDays;
    
    if (propRemainingDays !== undefined) {
      remainingWorkDays = Math.max(1, propRemainingDays);
    } else {
      const remainingWeeks = Math.ceil(remainingCalendarDays / 7);
      const weekendDays = remainingWeeks * 2;
      remainingWorkDays = Math.max(1, remainingCalendarDays - weekendDays);
    }

    
    const totalKarmaBase = currentGood + totalNegatives + karmaBad;
    const currentKarma = totalKarmaBase > 0 ? (currentGood / totalKarmaBase) * 100 : 0;
    
    // Calculate for each level (88%, 90%, 92%)
    const levels: LevelTarget[] = [
      { level: 1, percentage: 88, label: "Level 1", icon: <Target className="h-4 w-4" />, needed: 0, dailyTarget: 0 },
      { level: 2, percentage: 90, label: "Level 2", icon: <Star className="h-4 w-4" />, needed: 0, dailyTarget: 0 },
      { level: 3, percentage: 92, label: "Expert", icon: <Trophy className="h-4 w-4" />, needed: 0, dailyTarget: 0 },
    ];
    
    levels.forEach((level) => {
      const targetPercentage = level.percentage / 100;
      const neededRaw = (targetPercentage * totalKarmaBase - currentGood) / (1 - targetPercentage);
      const needed = Math.ceil(neededRaw);
      level.needed = Math.max(0, needed);
      const perDay = level.needed > 0 ? level.needed / remainingWorkDays : 0;
      level.dailyTarget = Math.round(perDay * 100) / 100;
    });
    
    // Find current level
    let currentLevel = 0;
    if (currentKarma >= 92) currentLevel = 3;
    else if (currentKarma >= 90) currentLevel = 2;
    else if (currentKarma >= 88) currentLevel = 1;
    
    // Today's progress based on level 1 target (88%)
    const todayProgress = levels[0].dailyTarget > 0 
      ? Math.min(100, (todayGood / levels[0].dailyTarget) * 100) 
      : 100;
    const isCompleted = todayGood >= levels[0].dailyTarget;
    const exceededBy = todayGood - levels[0].dailyTarget;
    const remaining = Math.max(0, levels[0].dailyTarget - todayGood);
    
    // Impact of bad ratings
    const compensationNeeded = todayBad > 0 
      ? Math.ceil(todayBad / (1 - 0.88)) 
      : 0;
    
    return {
      levels,
      currentLevel,
      currentKarma,
      todayGood,
      todayBad,
      todayProgress,
      isCompleted,
      exceededBy,
      remaining,
      remainingWorkDays,
      compensationNeeded,
    };
  }, [currentGood, totalNegatives, karmaBad, selectedMonth, selectedYear, todayGood, todayBad]);

  useEffect(() => {
    if (!calculations) return;
    const todayStr = new Date().toISOString().split("T")[0];
    if (calculations.isCompleted && lastDate !== todayStr) {
      const prev = lastDate ? new Date(lastDate) : null;
      const today = new Date(todayStr);
      let nextStreak = 1;
      if (prev) {
        const diff = Math.round((today.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));
        nextStreak = diff === 1 ? streak + 1 : 1;
      }
      setStreak(nextStreak);
      setLastDate(todayStr);
      localStorage.setItem("ktb_streak_count", String(nextStreak));
      localStorage.setItem("ktb_streak_lastDate", todayStr);
    }
  }, [calculations?.isCompleted]);

  // Move badges useMemo BEFORE the early return to avoid hooks error
  const badges = useMemo(() => {
    if (!calculations) return [];
    const list: { label: string }[] = [];
    if (currentGood >= 25) list.push({ label: "Starter 25" });
    if (currentGood >= 50) list.push({ label: "Bronze 50" });
    if (currentGood >= 100) list.push({ label: "Silver 100" });
    if (currentGood >= 200) list.push({ label: "Gold 200" });
    if (calculations.currentKarma >= 92) list.push({ label: "Expert 92%" });
    return list;
  }, [currentGood, calculations]);

  if (!calculations) {
    return (
      <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Daily Target</h3>
        </div>
        <p className="text-muted-foreground text-sm">
          Daily target tracking is only available for the current month.
        </p>
      </div>
    );
  }

  const { 
    levels,
    currentKarma,
    todayProgress, 
    isCompleted, 
    exceededBy, 
    remaining, 
    remainingWorkDays,
    compensationNeeded,
  } = calculations;

  return (
    <div className={`rounded-xl p-6 border shadow-sm transition-all ${
      isCompleted 
        ? 'bg-success/5 border-success/30' 
        : 'bg-card border-border'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isCompleted ? 'bg-success/20' : 'bg-primary/10'}`}>
            {isCompleted ? (
              <CheckCircle className="h-5 w-5 text-success" />
            ) : (
              <Target className="h-5 w-5 text-primary" />
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              Daily Target {isCompleted && '🎉'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {remainingWorkDays} working days remaining
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-2xl font-bold ${currentKarma >= 88 ? 'text-success' : 'text-foreground'}`}>
            {currentKarma.toFixed(1)}%
          </div>
          <div className="text-xs text-muted-foreground">current karma</div>
          <div className="text-xs text-muted-foreground">streak {streak}🔥</div>
        </div>
      </div>

      {/* 3 Level Cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {levels.map((level) => {
          const isAchieved = currentKarma >= level.percentage;
          const nextUnachieved = levels.find((l) => currentKarma < l.percentage)?.level ?? null;
          const isNext = !isAchieved && nextUnachieved === level.level;

          return (
            <div
              key={level.level}
              className={`p-4 rounded-lg border-2 text-center transition-all ${
                isAchieved
                  ? "bg-success/10 border-success"
                  : isNext
                  ? "bg-primary/10 border-primary"
                  : "bg-muted border-border"
              }`}
            >
              <div
                className={`flex justify-center mb-2 ${
                  isAchieved ? "text-success" : isNext ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {level.icon}
              </div>
              <div
                className={`text-lg font-bold ${
                  isAchieved ? "text-success" : isNext ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {level.percentage}%
              </div>
              <div className="text-xs text-muted-foreground">{level.label}</div>

              {isAchieved ? (
                <div className="text-xs text-success font-medium mt-1">✓ Achieved</div>
              ) : (
                <div className="mt-2 space-y-1">
                  <div className={`text-sm font-semibold ${isNext ? "text-primary" : "text-muted-foreground"}`}>
                    {level.needed} total needed
                  </div>
                  <div className="text-xs text-muted-foreground">≈ {level.dailyTarget}/day</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Today's Progress for Level 1 */}
      <div className="mb-6 p-4 bg-background rounded-lg border border-border">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-foreground">Today's Progress (88% Target)</span>
          <span className={`font-medium ${isCompleted ? 'text-success' : 'text-foreground'}`}>
            {Math.round(todayProgress)}%
          </span>
        </div>
        <Progress 
          value={todayProgress} 
          className={`h-3 ${isCompleted ? '[&>div]:bg-success' : ''}`}
        />
        
        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="text-center">
            <div className="text-xl font-bold text-success">{todayGood}</div>
            <div className="text-xs text-muted-foreground">Achieved</div>
          </div>
          <div className="text-center">
            <div className={`text-xl font-bold ${remaining > 0 ? 'text-warning' : 'text-success'}`}>
              {remaining}
            </div>
            <div className="text-xs text-muted-foreground">Remaining</div>
          </div>
          <div className="text-center">
            <div className={`text-xl font-bold ${exceededBy > 0 ? 'text-success' : 'text-muted-foreground'}`}>
              {exceededBy > 0 ? `+${exceededBy}` : '-'}
            </div>
            <div className="text-xs text-muted-foreground">Exceeded</div>
          </div>
        </div>
      </div>

      {/* Completion Message */}
      {isCompleted && (
        <div className="bg-success/10 rounded-lg p-4 border border-success/20">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-success" />
            <span className="font-semibold text-success">Daily target achieved! 🎊</span>
          </div>
          <p className="text-sm text-success/80 mt-1">
            {exceededBy > 0 
              ? `You exceeded by ${exceededBy}! Keep going for higher levels! 🚀`
              : "Great job hitting your target!"}
          </p>
          {badges.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {badges.map((b) => (
                <span key={b.label} className="px-2 py-1 text-xs rounded-full border bg-success/5 text-success">
                  {b.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bad Rating Impact Warning */}
      {todayBad > 0 && compensationNeeded > 0 && (
        <div className="bg-warning/10 rounded-lg p-4 border border-warning/20 mt-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            <span className="font-semibold text-warning">Target Impact ⚠️</span>
          </div>
          <p className="text-sm text-warning/80 mt-1">
            Today's {todayBad} bad rating(s) mean you need{' '}
            <span className="font-bold">+{compensationNeeded} more</span> good ratings to compensate.
          </p>
        </div>
      )}
    </div>
  );
};
