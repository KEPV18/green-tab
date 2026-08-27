import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Phone } from "lucide-react";

interface GenesysSectionProps {
  genesysGood: number;
  genesysBad: number;
  onGenesysGoodChange: (value: number) => void;
  onGenesysBadChange: (value: number) => void;
}

export const GenesysSection = ({
  genesysGood,
  genesysBad,
  onGenesysGoodChange,
  onGenesysBadChange,
}: GenesysSectionProps) => {
  return (
    <Card className="p-6 border-border">
      <div className="flex items-center gap-2 mb-4">
        <Phone className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Genesys Ratings (Phone)</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Genesys Good</p>
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="outline"
              onClick={() => onGenesysGoodChange(genesysGood + 1)}
              className="h-10 w-10 hover:bg-primary hover:text-primary-foreground"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <span className="text-3xl font-bold text-primary min-w-[60px] text-center">
              {genesysGood}
            </span>
            <Button
              size="icon"
              variant="outline"
              onClick={() => onGenesysGoodChange(Math.max(0, genesysGood - 1))}
              disabled={genesysGood <= 0}
              className="h-10 w-10 hover:bg-destructive hover:text-destructive-foreground"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Genesys Bad (DSAT)</p>
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="outline"
              onClick={() => onGenesysBadChange(genesysBad + 1)}
              className="h-10 w-10 hover:bg-destructive hover:text-destructive-foreground"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <span className="text-3xl font-bold text-destructive min-w-[60px] text-center">
              {genesysBad}
            </span>
            <Button
              size="icon"
              variant="outline"
              onClick={() => onGenesysBadChange(Math.max(0, genesysBad - 1))}
              disabled={genesysBad <= 0}
              className="h-10 w-10 hover:bg-destructive hover:text-destructive-foreground"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-4 p-3 bg-muted rounded-lg">
        <p className="text-sm text-muted-foreground">
          Note: Genesys ratings are automatically added to Phone channel totals
        </p>
      </div>
    </Card>
  );
};
