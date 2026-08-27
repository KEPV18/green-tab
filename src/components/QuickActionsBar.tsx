import { Button } from "@/components/ui/button";
import { Download, NotebookText, Eye, EyeOff } from "lucide-react";

interface QuickActionsBarProps {
  onExport: () => void;
  onOpenNotes: () => void;
  focusMode: boolean;
  onToggleFocus: () => void;
}

export const QuickActionsBar = ({
  onExport,
  onOpenNotes,
  focusMode,
  onToggleFocus,
}: QuickActionsBarProps) => {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-lg hover:bg-accent"
        onClick={onOpenNotes}
        title="Notes"
      >
        <NotebookText className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 rounded-lg hover:bg-accent"
        onClick={onExport}
        title="Export CSV"
      >
        <Download className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className={`h-8 w-8 rounded-lg ${focusMode ? "bg-primary/15 text-primary" : "hover:bg-accent"}`}
        onClick={onToggleFocus}
        title={focusMode ? "Exit Focus Mode" : "Focus Mode"}
      >
        {focusMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
};
