import { Target, Trophy, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface GoalsSectionProps {
  currentValue: number;
  totalNegatives: number;
  metricName: string;
  targets: number[];
  variant?: "sidebar" | "default";
}

export const GoalsSection = ({ currentValue, totalNegatives, metricName, targets, variant = "default" }: GoalsSectionProps) => {
  const calculateNeeded = (targetPercentage: number) => {
    const target = targetPercentage / 100;
    const totalCurrent = currentValue + totalNegatives;
    const needed = Math.ceil((target * totalCurrent - currentValue) / (1 - target));
    return Math.max(0, needed);
  };

  const total = currentValue + totalNegatives;
  const currentPercentage = total > 0 ? (currentValue / total) * 100 : 100;

  if (variant === "sidebar") {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-md">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <div className="text-sm font-semibold">{metricName}</div>
          </div>
          <div className={`text-base font-bold ${currentPercentage >= targets[0] ? 'text-success' : 'text-primary'}`}>
            {currentPercentage.toFixed(1)}%
          </div>
        </div>
        <div className="mt-2">
          <Progress value={Math.min(currentPercentage, 100)} className="h-2" />
        </div>
        <div className="mt-3 space-y-2">
          {targets.map((target) => {
            const needed = calculateNeeded(target);
            const achieved = needed === 0;
            const progressTowardsTarget = Math.min((currentPercentage / target) * 100, 100);
            return (
              <div
                key={target}
                className={`flex items-center justify-between rounded-md px-2 py-2 border ${achieved ? 'bg-success/5 border-success/30' : 'bg-muted/30 border-border'}`}
              >
                <div className="text-xs font-medium">
                  <span className="text-foreground">{target}%</span>
                  <span className="mx-1 text-muted-foreground">—</span>
                  <span className={achieved ? 'text-success font-semibold' : 'text-foreground'}>
                    {progressTowardsTarget.toFixed(1)}%
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {achieved ? (
                    <Trophy className="h-4 w-4 text-success" />
                  ) : (
                    <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">+{needed}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">{metricName} Progress</h3>
            <p className="text-sm text-muted-foreground">Current Score</p>
          </div>
        </div>
        <div className={`text-3xl font-bold ${currentPercentage >= targets[0] ? 'text-success' : 'text-primary'}`}>
          {currentPercentage.toFixed(2)}%
        </div>
      </div>
      <div className="mt-3">
        <Progress value={Math.min(currentPercentage, 100)} className="h-3" />
      </div>
      <div className="mt-6 space-y-3">
        {targets.map((target) => {
          const needed = calculateNeeded(target);
          const achieved = needed === 0;
          const progressTowardsTarget = Math.min((currentPercentage / target) * 100, 100);

          return (
            <div
              key={target}
              className={`relative overflow-hidden p-4 rounded-xl border transition-all duration-300 hover:shadow-md ${
                achieved ? 'bg-success/5 border-success/30' : 'bg-card border-border hover:border-primary/50'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-lg font-bold">{target}% Target</span>
                {achieved ? (
                  <Trophy className="h-5 w-5 text-success" />
                ) : (
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className={achieved ? "text-success font-medium" : "text-foreground"}>
                    {progressTowardsTarget.toFixed(1)}%
                  </span>
                </div>
                <Progress value={progressTowardsTarget} className={`h-1.5 ${achieved ? '[&>div]:bg-success' : ''}`} />
                <p className={`text-xs mt-2 font-medium ${achieved ? 'text-success' : 'text-primary'}`}>
                  {achieved ? "🎉 Goal Achieved!" : `Need +${needed} more positive ratings`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
