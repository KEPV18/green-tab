import { Card } from "@/components/ui/card";
import { Clock, Target, Zap, CheckCircle2 } from "lucide-react";

interface DailySummaryCardProps {
  todayGood: number;
  todayBad: number;
  dailyTarget: number;
  shiftTimeLeft: string;
  shiftLabel: string;
}

export const DailySummaryCard = ({
  todayGood,
  todayBad,
  dailyTarget,
  shiftTimeLeft,
  shiftLabel,
}: Omit<DailySummaryCardProps, 'karma'>) => {
  const remaining = Math.max(0, Math.ceil(dailyTarget) - todayGood);
  const progress = dailyTarget > 0 ? Math.min(100, (todayGood / dailyTarget) * 100) : 100;
  const isComplete = remaining <= 0;

  return (
    <Card className="p-5 bg-gradient-hero border border-primary/10 overflow-hidden relative shadow-card">
      {/* Decorative elements */}
      <div className="absolute -top-16 -right-16 w-40 h-40 bg-primary/[0.03] rounded-full blur-2xl" />
      <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-success/[0.03] rounded-full blur-2xl" />
      
      <div className="relative grid grid-cols-3 gap-4">
        {/* Today's Ratings */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-success/8">
            <Zap className="h-3 w-3 text-success" />
            <span className="text-[10px] font-bold text-success uppercase tracking-wider">Today</span>
          </div>
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-3xl font-extrabold text-success tabular-nums">{todayGood}</span>
            {todayBad > 0 && (
              <span className="text-sm text-destructive font-bold">-{todayBad}</span>
            )}
          </div>
        </div>

        {/* Remaining Target */}
        <div className="text-center space-y-1.5 border-x border-border/40 px-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: isComplete ? 'hsl(var(--success) / 0.08)' : 'hsl(var(--primary) / 0.08)' }}>
            {isComplete ? (
              <CheckCircle2 className="h-3 w-3 text-success" />
            ) : (
              <Target className="h-3 w-3 text-primary" />
            )}
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isComplete ? "text-success" : "text-primary"}`}>
              {isComplete ? "Done!" : "Left"}
            </span>
          </div>
          <span className={`text-3xl font-extrabold tabular-nums block ${isComplete ? "text-success" : "text-primary"}`}>
            {isComplete ? "✓" : remaining}
          </span>
        </div>

        {/* Shift Timer */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-warning/8">
            <Clock className="h-3 w-3 text-warning" />
            <span className="text-[10px] font-bold text-warning uppercase tracking-wider truncate max-w-[60px]">
              {shiftLabel || "Shift"}
            </span>
          </div>
          <span className="text-xl font-extrabold font-mono text-warning tabular-nums block">
            {shiftTimeLeft || "--:--"}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 h-2 bg-muted/60 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${isComplete ? "bg-gradient-success" : "bg-gradient-primary"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </Card>
  );
};