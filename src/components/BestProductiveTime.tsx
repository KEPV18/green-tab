import { Card } from "@/components/ui/card";
import { Clock, TrendingUp, Calendar, Star } from "lucide-react";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";

interface DailyChange {
  id: string;
  change_date: string;
  change_time: string | null;
  field_name: string;
  change_amount: number;
  created_at: string;
}

interface BestProductiveTimeProps {
  changes: DailyChange[];
}

interface HourStats {
  hour: number;
  goodCount: number;
  badCount?: number;
  totalCount: number;
  successRate: number;
  label: string;
}

interface DayStats {
  day: string;
  dayName: string;
  goodCount: number;
  totalCount: number;
  successRate: number;
}

export const BestProductiveTime = ({ changes }: BestProductiveTimeProps) => {
  const [includeGenesys, setIncludeGenesys] = useState(true);
  const [includeKarma, setIncludeKarma] = useState(true);
  const MIN_SAMPLES = 2;
  const reminderTimeouts = useRef<number[]>([]);
  useEffect(() => {
    return () => { reminderTimeouts.current.forEach((id) => window.clearTimeout(id)); reminderTimeouts.current = []; };
  }, []);
  const analysis = useMemo(() => {
    if (!changes || changes.length === 0) {
      return null;
    }

    // Analyze by hour
    const hourStats: Record<number, { good: number; bad: number; total: number }> = {};
    // Analyze by day of week
    const dayOfWeekStats: Record<number, { good: number; total: number }> = {};
    // Analyze by specific date
    const dateStats: Record<string, { good: number; bad: number }> = {};

    // Step 1: Calculate NET changes per date+field to know true totals
    const netByDateField: Record<string, number> = {};
    const positiveByDateField: Record<string, number> = {};
    changes.forEach((change) => {
      const key = `${change.change_date}|${change.field_name}`;
      netByDateField[key] = (netByDateField[key] || 0) + change.change_amount;
      if (change.change_amount > 0) {
        positiveByDateField[key] = (positiveByDateField[key] || 0) + change.change_amount;
      }
    });

    // Step 2: Process individual positive changes, scaled by (net/totalPositive) ratio
    // This preserves hourly distribution while keeping correct totals
    changes.forEach((change) => {
      if (change.change_amount <= 0) return;

      const key = `${change.change_date}|${change.field_name}`;
      const net = netByDateField[key] || 0;
      const totalPositive = positiveByDateField[key] || 1;
      if (net <= 0) return; // field was net-negative or zero, skip entirely

      const scaleFactor = net / totalPositive; // scales down if there were corrections
      const scaledAmount = change.change_amount * scaleFactor;

      const isGenesys = change.field_name === 'genesys_good' || change.field_name === 'genesys_bad';
      const isKarma = change.field_name === 'karma_bad';
      if (!includeGenesys && isGenesys) return;
      if (!includeKarma && isKarma) return;
      const isGood = change.field_name === 'good' || change.field_name === 'genesys_good';
      const isBad = change.field_name === 'bad' || change.field_name === 'genesys_bad' || change.field_name === 'karma_bad';

      // Get time from change_time or created_at
      let hour = 12;
      if (change.change_time) {
        hour = parseInt(change.change_time.split(':')[0], 10);
      } else if (change.created_at) {
        hour = new Date(change.created_at).getHours();
      }

      const date = new Date(change.change_date);
      const dayOfWeek = date.getDay();

      // Update hour stats (no weight multiplier — raw accurate numbers)
      if (!hourStats[hour]) hourStats[hour] = { good: 0, bad: 0, total: 0 };
      if (isGood) hourStats[hour].good += scaledAmount;
      if (isBad) hourStats[hour].bad += scaledAmount;
      hourStats[hour].total += scaledAmount;

      // Update day of week stats
      if (!dayOfWeekStats[dayOfWeek]) dayOfWeekStats[dayOfWeek] = { good: 0, total: 0 };
      if (isGood) dayOfWeekStats[dayOfWeek].good += scaledAmount;
      dayOfWeekStats[dayOfWeek].total += scaledAmount;

      // Update date stats
      const dateKey = change.change_date;
      if (!dateStats[dateKey]) dateStats[dateKey] = { good: 0, bad: 0 };
      if (isGood) dateStats[dateKey].good += scaledAmount;
      if (isBad) dateStats[dateKey].bad += scaledAmount;
    });

    // Find best hours (top 3)
    const bestHours: HourStats[] = Object.entries(hourStats)
      .map(([hour, stats]) => {
        const total = stats.total;
        const good = stats.good;
        const rate = total > 0 ? good / total : 0;
        return {
          hour: parseInt(hour, 10),
          goodCount: good,
          badCount: stats.bad,
          totalCount: total,
          successRate: rate,
          label: `${parseInt(hour, 10).toString().padStart(2, '0')}:00`,
        };
      })
      .filter(h => h.totalCount >= MIN_SAMPLES)
      .sort((a, b) => (b.successRate - a.successRate) || (b.goodCount - a.goodCount))
      .slice(0, 3);
    
    const worstHours: HourStats[] = Object.entries(hourStats)
      .map(([hour, stats]) => {
        const total = stats.total;
        const bad = stats.bad;
        const rateBad = total > 0 ? bad / total : 0;
        return {
          hour: parseInt(hour, 10),
          goodCount: stats.good,
          badCount: bad,
          totalCount: total,
          successRate: rateBad,
          label: `${parseInt(hour, 10).toString().padStart(2, '0')}:00`,
        };
      })
      .filter(h => (h.badCount ?? 0) > 0 && h.totalCount >= MIN_SAMPLES)
      .sort((a, b) => {
        const ar = a.badCount ? a.badCount / a.totalCount : 0;
        const br = b.badCount ? b.badCount / b.totalCount : 0;
        if (br !== ar) return br - ar;
        return (b.badCount || 0) - (a.badCount || 0);
      })
      .slice(0, 3);

    // Find best days of week
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const bestDaysOfWeek: DayStats[] = Object.entries(dayOfWeekStats)
      .map(([day, stats]) => ({
        day,
        dayName: dayNames[parseInt(day)],
        goodCount: stats.good,
        totalCount: stats.total,
        successRate: stats.total > 0 ? (stats.good / stats.total) * 100 : 0,
      }))
      .filter(d => d.totalCount >= MIN_SAMPLES)
      .sort((a, b) => (b.successRate - a.successRate) || (b.goodCount - a.goodCount))
      .slice(0, 3);

    // Find best dates in the month
    const bestDates = Object.entries(dateStats)
      .map(([date, stats]) => ({
        date,
        good: stats.good,
        bad: stats.bad,
        total: stats.good + stats.bad,
        successRate: (stats.good + stats.bad) > 0 ? (stats.good / (stats.good + stats.bad)) * 100 : 0,
      }))
      .filter(d => d.good > 0)
      .sort((a, b) => b.good - a.good)
      .slice(0, 5);

    return {
      bestHours,
      bestDaysOfWeek,
      bestDates,
      totalGoodRatings: Object.values(hourStats).reduce((sum, h) => sum + h.good, 0),
      worstHours,
    };
  }, [changes, includeGenesys, includeKarma]);

  if (!analysis) {
    return (
      <Card className="p-6 border-border">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold text-foreground">Best Productive Time</h3>
        </div>
        <p className="text-sm text-muted-foreground">Not enough data to analyze. Add more ratings to see patterns.</p>
      </Card>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
  };

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center gap-2 mb-6">
        <Clock className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Best Productive Time</h3>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={includeGenesys} onChange={(e) => setIncludeGenesys(e.target.checked)} />
            <span>Include Genesys</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={includeKarma} onChange={(e) => setIncludeKarma(e.target.checked)} />
            <span>Include Karma</span>
          </label>
        </div>
        <button
          className="text-xs px-2 py-1 rounded border"
          onClick={() => {
            toast.message("Setting reminder…");
            // Schedule 10 minutes before next best hour
            const now = new Date();
            const bh = analysis?.bestHours?.[0];
            if (!bh) { toast.error("No best hour yet"); return; }
            const topHour = parseInt(bh.label.split(":")[0], 10);
            const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), topHour, 0, 0, 0);
            if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
            const ms = target.getTime() - Date.now() - 10 * 60 * 1000;
            if (ms > 0) {
              const id = window.setTimeout(() => {
                toast.message("Golden hour soon", { description: `Best hour at ${bh.label} in 10 min` });
                if ("Notification" in window && Notification.permission === "granted") {
                  try { new Notification("Golden hour soon", { body: `Best hour at ${bh.label}` }); } catch {}
                }
              }, ms);
              reminderTimeouts.current.push(id);
              toast.success("Reminder set for best hour");
            } else {
              toast.message("Too close to best hour");
            }
          }}
        >
          Enable reminder
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Best Hours */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TrendingUp className="h-4 w-4" />
            <span>Best CSAT Hours</span>
          </div>
          {analysis.bestHours.length > 0 ? (
            <div className="space-y-2">
              {analysis.bestHours.map((hour, idx) => (
                <div 
                  key={hour.hour} 
                  className={`p-3 rounded-lg ${idx === 0 ? 'bg-primary/10 border border-primary/20' : 'bg-muted'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{hour.label}</span>
                    <span className="text-sm text-primary font-bold">+{Math.round(hour.goodCount)} good • {Math.round(hour.successRate * 100)}% • ({Math.round(hour.totalCount)})</span>
                  </div>
                  {idx === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Your peak productivity hour</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </div>

        {/* Worst Hours (DSAT) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <TrendingUp className="h-4 w-4 text-destructive" />
            <span>Top DSAT Hours</span>
          </div>
          {analysis.worstHours.length > 0 ? (
            <div className="space-y-2">
              {analysis.worstHours.map((hour, idx) => (
                <div 
                  key={hour.hour} 
                  className={`p-3 rounded-lg ${idx === 0 ? 'bg-destructive/10 border border-destructive/20' : 'bg-muted'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{hour.label}</span>
                    <span className="text-sm text-destructive font-bold">+{Math.round(hour.badCount || 0)} bad</span>
                  </div>
                  {idx === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Highest DSAT hour</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </div>

        {/* Best Days of Week */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Best Days of Week</span>
          </div>
          {analysis.bestDaysOfWeek.length > 0 ? (
            <div className="space-y-2">
              {analysis.bestDaysOfWeek.map((day, idx) => (
                <div 
                  key={day.day} 
                  className={`p-3 rounded-lg ${idx === 0 ? 'bg-success/10 border border-success/20' : 'bg-muted'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{day.dayName}</span>
                    <span className="text-sm text-success font-bold">+{day.goodCount} good</span>
                  </div>
                  {idx === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">Your best performing day</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </div>

        {/* Best Dates in Month */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Star className="h-4 w-4" />
            <span>Top Days This Month</span>
          </div>
          {analysis.bestDates.length > 0 ? (
            <div className="space-y-2">
              {analysis.bestDates.slice(0, 3).map((dateInfo, idx) => (
                <div 
                  key={dateInfo.date} 
                  className={`p-3 rounded-lg ${idx === 0 ? 'bg-warning/10 border border-warning/20' : 'bg-muted'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{formatDate(dateInfo.date)}</span>
                    <span className="text-sm text-warning font-bold">+{dateInfo.good} good</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {dateInfo.successRate.toFixed(0)}% success rate
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </div>
      </div>

      {/* Summary */}
      {analysis.bestHours.length > 0 && analysis.bestDaysOfWeek.length > 0 && (
        <div className="mt-6 p-4 bg-muted rounded-lg">
          <p className="text-sm text-foreground">
            <strong>Summary:</strong> You perform best around <strong>{analysis.bestHours[0]?.label}</strong> on <strong>{analysis.bestDaysOfWeek[0]?.dayName}s</strong>. 
            Schedule important tasks during these times for optimal results.
          </p>
        </div>
      )}
    </Card>
  );
};
