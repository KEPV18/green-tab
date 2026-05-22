import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RefreshCw, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface WFMSyncResult {
  success: boolean;
  message: string;
}

interface WFMSyncButtonProps {
  onSyncComplete?: () => void;
}

interface ShiftEntry {
  date: string;
  shift_start?: string | null;
  shift_end?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  is_off?: boolean;
  is_off_day?: boolean;
  type?: string;
  is_site?: boolean;
  is_site_day?: boolean;
  break_start?: string | null;
  first_break_start?: string | null;
  break_end?: string | null;
  first_break_end?: string | null;
  second_break_start?: string | null;
  second_break_end?: string | null;
  status?: string;
  notes?: string | null;
}

export function WFMSyncButton({ onSyncComplete }: WFMSyncButtonProps) {
  const [open, setOpen] = useState(false);
  const [jsonData, setJsonData] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WFMSyncResult | null>(null);
  const { user } = useAuth();

  const handleSync = async () => {
    if (!jsonData.trim()) {
      toast.error("Please paste the WFM schedule JSON data");
      return;
    }

    let schedules: ShiftEntry[];
    try {
      const parsed = JSON.parse(jsonData.trim());
      if (Array.isArray(parsed)) {
        schedules = parsed;
      } else if (parsed.schedules && Array.isArray(parsed.schedules)) {
        schedules = parsed.schedules;
      } else if (parsed.data && Array.isArray(parsed.data)) {
        schedules = parsed.data;
      } else {
        toast.error("Could not find schedule array in the JSON. Expected an array or {schedules: [...] }");
        return;
      }
    } catch {
      toast.error("Invalid JSON. Please copy the raw JSON response from the WFM API.");
      return;
    }

    if (schedules.length === 0) {
      toast.error("No schedule entries found in the data");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setResult({ success: false, message: "Not authenticated. Please log in first." });
        setLoading(false);
        return;
      }

      const response = await fetch("https://udbdvtcugpnrmtfipbzj.supabase.co/functions/v1/wfm-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          user_id: user?.id || "",
          schedules,
          source: "browser-paste",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({
          success: false,
          message: data.error || `Error ${response.status}: ${data.message || "Unknown error"}`,
        });
        return;
      }

      setResult({
        success: true,
        message: `Synced ${data.synced}/${data.total || schedules.length} shift entries`,
      });
      toast.success(`WFM sync complete — ${data.synced} entries updated`);
      onSyncComplete?.();
      setJsonData("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      setResult({ success: false, message: msg });
      toast.error("WFM sync failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setOpen(true)}
      >
        <RefreshCw className="h-4 w-4 text-primary" />
        Sync WFM
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Sync from WFM
            </DialogTitle>
            <DialogDescription>
              Pull your shift schedule from WFM into Green Tab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Step-by-step instructions */}
            <div className="space-y-2 p-3 bg-muted rounded-md text-sm">
              <p className="font-medium">📋 How to get WFM data:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                <li>
                  Open{" "}
                  <a href="https://wfm.tabby.ai" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
                    wfm.tabby.ai <ExternalLink className="h-3 w-3" />
                  </a>{" "}
                  and log in with your company Google account
                </li>
                <li>Open DevTools (F12) → Network tab</li>
                <li>Reload the page or navigate to your schedule</li>
                <li>Find the request to <code className="bg-background px-1 py-0.5 rounded text-[10px]">/api/schedules</code></li>
                <li>Click on it → Response tab → Copy the JSON response</li>
                <li>Paste the JSON below</li>
              </ol>
            </div>

            {/* Quick API URLs */}
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">
                Direct API links (open while logged in to WFM):
              </Label>
              <div className="flex gap-2">
                <a
                  href="https://wfm.tabby.ai/api/schedules?year=2026&month=5"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline inline-flex items-center gap-1"
                >
                  May 2026 <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href="https://wfm.tabby.ai/api/schedules?year=2026&month=6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline inline-flex items-center gap-1"
                >
                  June 2026 <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Open these links in WFM's browser tab — the JSON will appear directly.
              </p>
            </div>

            {/* JSON Input */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Schedule Data (JSON)
              </Label>
              <Textarea
                value={jsonData}
                onChange={(e) => setJsonData(e.target.value)}
                placeholder='Paste the WFM API response JSON here...&#10;&#10;Example: [{"date":"2026-05-01","start_time":"09:00","end_time":"17:00","type":"shift"},...]'
                rows={6}
                className="font-mono text-xs"
              />
            </div>

            {/* Result */}
            {result && (
              <div className={`flex items-start gap-2 p-3 rounded-md text-sm ${
                result.success
                  ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
              }`}>
                {result.success ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                )}
                <span>{result.message}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button onClick={handleSync} disabled={loading || !jsonData.trim()}>
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Syncing...
                </>
              ) : (
                "Sync Schedule"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}