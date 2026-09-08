import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Minus, LucideIcon, TrendingUp, TrendingDown, Minus as MinusIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: number;
  onIncrement?: () => void;
  onDecrement?: () => void;
  color?: "primary" | "destructive" | "warning" | "success";
  icon?: LucideIcon;
  showButtons?: boolean;
  subtitle?: string;
  /** For "lower is better" metrics, set to true. Changes color logic and comparison vs floor. */
  lowerIsBetter?: boolean;
  /** Floor average value — when provided, subtitle auto-shows comparison. */
  floorValue?: number;
  /** Unit suffix for display (e.g. "%", "s", ""). Defaults to "" */
  unit?: string;
}

export const MetricCard = ({ 
  title, value, onIncrement, onDecrement, color, icon: Icon, showButtons = true, 
  subtitle, lowerIsBetter = false, floorValue, unit = ""
}: MetricCardProps) => {
  // Auto-determine color based on floor comparison when floorValue is provided
  let effectiveColor: "primary" | "destructive" | "warning" | "success" = color ?? "primary";
  let comparisonText = subtitle;

  if (floorValue != null && floorValue > 0) {
    const diff = value - floorValue;
    const absDiff = Math.abs(diff).toFixed(1);
    const isBetter = lowerIsBetter ? value <= floorValue : value >= floorValue;
    
    // Auto-determine color
    if (color === undefined) {
      // Only auto-color if no explicit color was passed
      effectiveColor = isBetter ? "success" : "destructive";
    }

    // Build comparison subtitle
    const arrow = isBetter ? "✓" : "✗";
    const direction = lowerIsBetter
      ? (value < floorValue ? `${absDiff}${unit} below floor` : value === floorValue ? "at floor" : `${absDiff}${unit} above floor`)
      : (value > floorValue ? `${absDiff}${unit} above floor` : value === floorValue ? "at floor" : `${absDiff}${unit} below floor`);
    
    comparisonText = `Floor: ${floorValue.toFixed(1)}${unit} · ${arrow} ${direction}`;
  } else if (floorValue != null && floorValue === 0 && lowerIsBetter) {
    // Floor is 0 and metric is lower-is-better — value at 0 is perfect
    if (color === undefined) {
      effectiveColor = value === 0 ? "success" : "warning";
    }
    comparisonText = `Floor: 0${unit}`;
  }

  const colorMap = {
    primary: { 
      text: "text-primary", 
      bg: "bg-primary/8", 
      border: "border-primary/15",
      iconBg: "bg-primary/10",
      btnInc: "bg-primary/10 text-primary hover:bg-primary/20 active:scale-95",
      btnDec: "bg-muted/80 text-muted-foreground hover:bg-muted active:scale-95",
    },
    destructive: { 
      text: "text-destructive", 
      bg: "bg-destructive/8", 
      border: "border-destructive/15",
      iconBg: "bg-destructive/10",
      btnInc: "bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95",
      btnDec: "bg-muted/80 text-muted-foreground hover:bg-muted active:scale-95",
    },
    warning: { 
      text: "text-warning", 
      bg: "bg-warning/8", 
      border: "border-warning/15",
      iconBg: "bg-warning/10",
      btnInc: "bg-warning/10 text-warning hover:bg-warning/20 active:scale-95",
      btnDec: "bg-muted/80 text-muted-foreground hover:bg-muted active:scale-95",
    },
    success: { 
      text: "text-success", 
      bg: "bg-success/8", 
      border: "border-success/15",
      iconBg: "bg-success/10",
      btnInc: "bg-success/10 text-success hover:bg-success/20 active:scale-95",
      btnDec: "bg-muted/80 text-muted-foreground hover:bg-muted active:scale-95",
    },
  };

  const c = colorMap[effectiveColor];

  // Determine trend icon for lower-is-better metrics
  const TrendIcon = lowerIsBetter
    ? (value < (floorValue ?? Infinity) ? TrendingDown : value > (floorValue ?? 0) ? TrendingUp : MinusIcon)
    : (value > (floorValue ?? 0) ? TrendingUp : value < (floorValue ?? Infinity) ? TrendingDown : MinusIcon);

  return (
    <Card className={`p-4 bg-card border ${c.border} shadow-card card-hover relative overflow-hidden group`}>
      {/* Subtle top accent line */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${c.bg}`} style={{ opacity: 0.6 }} />
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <div className={`p-2.5 rounded-xl ${c.iconBg} transition-transform duration-200 group-hover:scale-105`}>
              <Icon className={`w-4 h-4 ${c.text}`} />
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{title}</p>
            <div className="flex items-baseline gap-1">
              <p className={`text-2xl font-extrabold tracking-tight ${c.text} tabular-nums`}>
                {value}
              </p>
              {unit && (
                <span className={`text-xs font-semibold ${c.text} opacity-70`}>{unit}</span>
              )}
            </div>
            {(comparisonText || subtitle) && (
              <p className={`text-[9px] mt-0.5 ${effectiveColor === "success" ? "text-emerald-500/80" : effectiveColor === "destructive" ? "text-red-400/80" : "text-muted-foreground/70"}`}>
                {comparisonText || subtitle}
              </p>
            )}
          </div>
        </div>
        {showButtons && onIncrement && onDecrement ? (
          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="ghost"
              onClick={onDecrement}
              disabled={value <= 0}
              className={`h-8 w-8 rounded-xl ${c.btnDec} transition-all duration-150`}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onIncrement}
              className={`h-8 w-8 rounded-xl ${c.btnInc} transition-all duration-150`}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          floorValue != null && floorValue > 0 && (
            <div className={`p-2 rounded-xl ${c.iconBg}`}>
              <TrendIcon className={`w-4 h-4 ${c.text} opacity-80`} />
            </div>
          )
        )}
      </div>
    </Card>
  );
};