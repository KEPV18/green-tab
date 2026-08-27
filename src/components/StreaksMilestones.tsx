import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Flame, Trophy, Star, Zap } from "lucide-react";
import { getDailyChanges, getMonthData } from "@/lib/store";

interface StreaksMilestonesProps {
  userId: string;
  selectedMonth: number;
  selectedYear: number;
  todayGood: number;
  dailyTarget: number;
}

const getMilestoneEmoji = (calls: number) => {
  if (calls >= 40) return "👑";
  if (calls >= 35) return "🔥";
  if (calls >= 30) return "⭐";
  return null;
};

export const StreaksMilestones = ({
  userId,
  selectedMonth,
  selectedYear,
  todayGood,
  dailyTarget,
}: StreaksMilestonesProps) => {
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [todayCalls, setTodayCalls] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    try {
      const md = getMonthData(userId, selectedYear, selectedMonth);
      const changes = getDailyChanges(md.id);

      // Calculate "calls" per day from daily changes (good + bad changes)
      const dayMap = new Map<string, number>();
      changes.forEach((c) => {
        if (c.fieldName === "good" || c.fieldName === "genesysGood" ||
            c.fieldName === "bad" || c.fieldName === "genesysBad") {
          const current = dayMap.get(c.changeDate) || 0;
          dayMap.set(c.changeDate, current + Math.abs(c.changeAmount));
        }
      });

      // Today's calls
      const today = new Date().toISOString().split('T')[0];
      setTodayCalls(dayMap.get(today) || 0);

      // Calculate streak: consecutive days with >= 30 calls
      const sortedDays = Array.from(dayMap.entries())
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[0].localeCompare(a[0])); // descending

      let currentStreak = 0;
      for (const [, count] of sortedDays) {
        if (count >= 30) currentStreak++;
        else break;
      }

      // Best streak
      const chronological = Array.from(dayMap.entries())
        .filter(([, count]) => count > 0)
        .sort((a, b) => a[0].localeCompare(b[0]));

      let tempStreak = 0;
      let maxStreak = 0;
      for (const [, count] of chronological) {
        if (count >= 30) {
          tempStreak++;
          maxStreak = Math.max(maxStreak, tempStreak);
        } else {
          tempStreak = 0;
        }
      }

      setStreak(currentStreak);
      setBestStreak(maxStreak);
    } catch (error) {
      console.error('Error loading streak data:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, selectedMonth, selectedYear]);

  const todayMilestone = useMemo(() => getMilestoneEmoji(todayCalls), [todayCalls]);
  const targetHit = todayGood >= Math.ceil(dailyTarget) && dailyTarget > 0;

  if (loading) return null;

  return (
    <Card className="p-3 border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <Flame className={`h-4 w-4 ${streak > 0 ? "text-orange-500" : "text-muted-foreground/40"}`} />
          <div>
            <span className={`text-lg font-extrabold tabular-nums ${streak > 0 ? "text-orange-500" : "text-muted-foreground/60"}`}>
              {streak}
            </span>
            <span className="text-[10px] text-muted-foreground ml-1">day streak</span>
          </div>
        </div>

        <div className="w-px h-8 bg-border" />

        <div className="flex items-center gap-1.5">
          <Trophy className={`h-3.5 w-3.5 ${bestStreak > 0 ? "text-warning" : "text-muted-foreground/40"}`} />
          <div>
            <span className="text-sm font-bold tabular-nums text-muted-foreground">{bestStreak}</span>
            <span className="text-[10px] text-muted-foreground ml-1">best</span>
          </div>
        </div>

        <div className="w-px h-8 bg-border" />

        <div className="flex items-center gap-1.5">
          <Zap className={`h-3.5 w-3.5 ${todayCalls >= 30 ? "text-success" : "text-muted-foreground/40"}`} />
          <div>
            <span className={`text-sm font-bold tabular-nums ${todayCalls >= 30 ? "text-success" : "text-muted-foreground"}`}>
              {todayCalls}
            </span>
            <span className="text-[10px] text-muted-foreground ml-1">calls today</span>
            {todayMilestone && <span className="ml-1">{todayMilestone}</span>}
          </div>
        </div>

        {targetHit && (
          <>
            <div className="w-px h-8 bg-border" />
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 text-success fill-success" />
              <span className="text-[10px] font-bold text-success uppercase">Target ✓</span>
            </div>
          </>
        )}
      </div>
    </Card>
  );
};