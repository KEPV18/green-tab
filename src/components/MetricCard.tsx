import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Minus, LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: number;
  onIncrement?: () => void;
  onDecrement?: () => void;
  color?: "primary" | "destructive" | "warning" | "success";
  icon?: LucideIcon;
  showButtons?: boolean;
}

export const MetricCard = ({ title, value, onIncrement, onDecrement, color = "primary", icon: Icon, showButtons = true }: MetricCardProps) => {
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

  const c = colorMap[color];

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
            <p className={`text-2xl font-extrabold tracking-tight ${c.text} tabular-nums`}>
              {value}
            </p>
          </div>
        </div>
        {showButtons && onIncrement && onDecrement && (
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
        )}
      </div>
    </Card>
  );
};