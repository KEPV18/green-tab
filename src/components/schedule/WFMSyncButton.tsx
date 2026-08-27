import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface WFMSyncButtonProps {
  userId: string;
  selectedMonth: number;
  selectedYear: number;
  onSync?: () => void;
}

export const WFMSyncButton = ({ userId, selectedMonth, selectedYear, onSync }: WFMSyncButtonProps) => {
  const [syncing, setSyncing] = useState(false);

  const handleSync = () => {
    setSyncing(true);
    toast.info("WFM sync is no longer available without Supabase backend. Use manual shift entry instead.");
    setSyncing(false);
    onSync?.();
  };

  return (
    <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} className="gap-1">
      <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
      {syncing ? "Syncing..." : "Sync WFM"}
    </Button>
  );
};