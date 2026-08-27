import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";

interface MonthComparisonProps {
  currentMonth: {
    good: number;
    bad: number;
    genesysGood: number;
    genesysBad: number;
    karmaBad: number;
    fcr: number;
  };
  previousMonth: {
    good: number;
    bad: number;
    genesysGood: number;
    genesysBad: number;
    karmaBad: number;
    fcr: number;
  } | null;
  currentMonthName: string;
  previousMonthName: string;
}

export const MonthComparison = ({ 
  currentMonth, 
  previousMonth, 
  currentMonthName,
  previousMonthName 
}: MonthComparisonProps) => {
  if (!previousMonth) {
    return (
      <Card className="p-6 border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">Month Comparison</h3>
        <p className="text-sm text-muted-foreground">No previous month data available for comparison.</p>
      </Card>
    );
  }

  const calculateCSAT = (good: number, genesysGood: number, bad: number, genesysBad: number) => {
    const totalGood = good + genesysGood;
    const totalBad = bad + genesysBad;
    const total = totalGood + totalBad;
    return total > 0 ? (totalGood / total) * 100 : 0;
  };

  const calculateKarma = (good: number, genesysGood: number, bad: number, genesysBad: number, karmaBad: number) => {
    const totalGood = good + genesysGood;
    const totalBad = bad + genesysBad;
    const total = totalGood + totalBad + karmaBad;
    return total > 0 ? (totalGood / total) * 100 : 0;
  };

  const currentCSAT = calculateCSAT(currentMonth.good, currentMonth.genesysGood, currentMonth.bad, currentMonth.genesysBad);
  const previousCSAT = calculateCSAT(previousMonth.good, previousMonth.genesysGood, previousMonth.bad, previousMonth.genesysBad);
  const csatDiff = currentCSAT - previousCSAT;

  const currentKarma = calculateKarma(currentMonth.good, currentMonth.genesysGood, currentMonth.bad, currentMonth.genesysBad, currentMonth.karmaBad);
  const previousKarma = calculateKarma(previousMonth.good, previousMonth.genesysGood, previousMonth.bad, previousMonth.genesysBad, previousMonth.karmaBad);
  const karmaDiff = currentKarma - previousKarma;

  const currentTotalGood = currentMonth.good + currentMonth.genesysGood;
  const previousTotalGood = previousMonth.good + previousMonth.genesysGood;
  const goodDiff = currentTotalGood - previousTotalGood;

  const currentTotalBad = currentMonth.bad + currentMonth.genesysBad;
  const previousTotalBad = previousMonth.bad + previousMonth.genesysBad;
  const badDiff = currentTotalBad - previousTotalBad;

  const fcrDiff = currentMonth.fcr - previousMonth.fcr;

  const MetricComparison = ({ 
    label, 
    current, 
    previous, 
    diff, 
    isPercentage = false,
    invert = false
  }: { 
    label: string; 
    current: number; 
    previous: number; 
    diff: number; 
    isPercentage?: boolean;
    invert?: boolean;
  }) => (
    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
      <div className="flex-1">
        <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-foreground">
            {isPercentage ? `${current.toFixed(1)}%` : current}
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {isPercentage ? `${previous.toFixed(1)}%` : previous}
          </span>
        </div>
      </div>
      <div className={`flex items-center gap-1 ${
        invert
          ? (diff < 0 ? 'text-success' : diff > 0 ? 'text-destructive' : 'text-muted-foreground')
          : (diff > 0 ? 'text-success' : diff < 0 ? 'text-destructive' : 'text-muted-foreground')
      }`}>
        {diff > 0 ? <TrendingUp className="h-4 w-4" /> : diff < 0 ? <TrendingDown className="h-4 w-4" /> : null}
        <span className="text-sm font-medium">
          {diff > 0 ? '+' : ''}{isPercentage ? diff.toFixed(1) : diff}{isPercentage ? '%' : ''}
        </span>
      </div>
    </div>
  );

  return (
    <Card className="p-6 border-border">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-foreground">Month-over-Month Comparison</h3>
        <p className="text-sm text-muted-foreground">
          Comparing <span className="font-semibold text-primary">{currentMonthName}</span> with{" "}
          <span className="font-semibold text-primary">{previousMonthName}</span>
        </p>
      </div>
      <div className="space-y-3">
        <MetricComparison 
          label="CSAT" 
          current={currentCSAT} 
          previous={previousCSAT} 
          diff={csatDiff} 
          isPercentage 
        />
        <MetricComparison 
          label="Karma" 
          current={currentKarma} 
          previous={previousKarma} 
          diff={karmaDiff} 
          isPercentage 
        />
        <MetricComparison 
          label="Total Good Ratings" 
          current={currentTotalGood} 
          previous={previousTotalGood} 
          diff={goodDiff} 
        />
        <MetricComparison 
          label="Total Bad Ratings (DSAT)" 
          current={currentTotalBad} 
          previous={previousTotalBad} 
          diff={badDiff}
          invert
        />
        <MetricComparison 
          label="FCR Score" 
          current={currentMonth.fcr} 
          previous={previousMonth.fcr} 
          diff={fcrDiff} 
          isPercentage 
        />
      </div>
    </Card>
  );
};
