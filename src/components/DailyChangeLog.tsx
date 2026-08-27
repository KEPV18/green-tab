import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { History, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { getDailyChanges, removeDailyChange } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface DailyChangeLogProps {
  performanceId: string | null;
}

export const DailyChangeLog = ({ performanceId }: DailyChangeLogProps) => {
  const { user } = useAuth();
  const userId = user?.id || "local";
  const [changes, setChanges] = useState<any[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!performanceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const data = getDailyChanges(performanceId);
      setChanges(data.sort((a, b) => new Date(b.changeDate).getTime() - new Date(a.changeDate).getTime()));
    } catch (e) {
      console.error('Error loading daily changes:', e);
    } finally {
      setLoading(false);
    }
  }, [performanceId]);

  const handleDelete = (changeId: string) => {
    if (!performanceId) return;
    try {
      removeDailyChange(performanceId, changeId);
      setChanges(prev => prev.filter(c => c.id !== changeId));
      toast.success("Change removed");
    } catch (e) {
      console.error('Error removing change:', e);
      toast.error("Failed to remove change");
    }
  };

  const fieldLabels: Record<string, string> = {
    good: "Good Rating",
    bad: "DSAT",
    karmaBad: "Karma Bad",
    genesysGood: "Genesys Good",
    genesysBad: "Genesys Bad",
    fcr: "FCR",
  };

  const fieldColors: Record<string, string> = {
    good: "bg-success/10 text-success border-success/20",
    genesysGood: "bg-success/10 text-success border-success/20",
    bad: "bg-destructive/10 text-destructive border-destructive/20",
    genesysBad: "bg-destructive/10 text-destructive border-destructive/20",
    karmaBad: "bg-warning/10 text-warning border-warning/20",
    fcr: "bg-primary/10 text-primary border-primary/20",
  };

  const displayChanges = expanded ? changes : changes.slice(0, 5);

  if (loading) return <div className="animate-pulse h-32 bg-muted rounded-lg" />;
  if (!changes.length) return null;

  return (
    <Card className="p-4 border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          Site Log ({changes.length})
        </h3>
      </div>

      <ScrollArea className="max-h-[300px]">
        <div className="space-y-2">
          {displayChanges.map((change) => (
            <div key={change.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-border/50 group hover:bg-muted/50 transition-colors">
              <Badge variant="outline" className={`text-[10px] px-2 py-0 font-medium ${fieldColors[change.fieldName] || "bg-muted text-muted-foreground border-border"}`}>
                {fieldLabels[change.fieldName] || change.fieldName}
              </Badge>
              <span className="text-xs text-muted-foreground">{change.changeDate}</span>
              {change.changeTime && <span className="text-[10px] text-muted-foreground/70">{change.changeTime}</span>}
              <span className={`text-xs font-medium ${change.changeAmount > 0 ? "text-success" : "text-destructive"}`}>
                {change.changeAmount > 0 ? "+" : ""}{change.changeAmount}
              </span>
              <span className="text-[10px] text-muted-foreground/70">
                ({change.oldValue} → {change.newValue})
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleDelete(change.id)}
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      {changes.length > 5 && (
        <Button variant="ghost" size="sm" className="w-full mt-2" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
          {expanded ? "Show Less" : `Show All (${changes.length})`}
        </Button>
      )}
    </Card>
  );
};