import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface FCRMetricProps {
  value: number;
  onChange: (value: number) => void;
  previousValue?: number | null;
}

export const FCRMetric = ({ value, onChange, previousValue }: FCRMetricProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    const numValue = parseFloat(inputValue);
    
    if (inputValue === "" || isNaN(numValue)) {
      onChange(0);
    } else if (numValue >= 0 && numValue <= 100) {
      onChange(Math.round(numValue * 100) / 100); // Round to 2 decimal places
    }
  };

  const difference = previousValue !== null && previousValue !== undefined 
    ? value - previousValue 
    : null;

  const getTrendIcon = () => {
    if (difference === null || difference === 0) return <Minus className="h-4 w-4 text-muted-foreground" />;
    if (difference > 0) return <TrendingUp className="h-4 w-4 text-primary" />;
    return <TrendingDown className="h-4 w-4 text-destructive" />;
  };

  return (
    <Card className="shadow-elegant hover:shadow-glow transition-all">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          📞 FCR Score
          {difference !== null && (
            <span className={`text-sm flex items-center gap-1 ${
              difference > 0 ? "text-primary" : difference < 0 ? "text-destructive" : "text-muted-foreground"
            }`}>
              {getTrendIcon()}
              {difference !== 0 && `${difference > 0 ? "+" : ""}${difference.toFixed(2)}%`}
            </span>
          )}
        </CardTitle>
        <CardDescription>First Call Resolution Rate</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fcr-input" className="text-sm font-medium">
            Enter FCR Percentage
          </Label>
          <div className="relative">
            <Input
              id="fcr-input"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={value || ""}
              onChange={handleChange}
              className="pr-8 text-lg font-semibold"
              placeholder="0.00"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
              %
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">Current FCR</span>
          <span className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            {value.toFixed(2)}%
          </span>
        </div>

        {previousValue !== null && previousValue !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Previous Month</span>
            <span className="font-medium">{previousValue.toFixed(2)}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
