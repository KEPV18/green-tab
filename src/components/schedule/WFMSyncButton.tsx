import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface WFMSyncResult {
  success: boolean;
  message: string;
}

interface WFMSyncButtonProps {
  onSyncComplete?: () => void;
}

type AuthMethod = "cf_authorization" | "wfm_session";

export function WFMSyncButton({ onSyncComplete }: WFMSyncButtonProps) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("wfm_session");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WFMSyncResult | null>(null);
  const { user } = useAuth();

  const handleSync = async () => {
    if (!token.trim()) {
      toast.error(authMethod === "cf_authorization"
        ? "Please paste the CF_Authorization token"
        : "Please paste the wfm_session cookie value");
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

      const body: Record<string, string> = {
        user_id: user?.id || "",
      };

      if (authMethod === "cf_authorization") {
        body.cf_token = token.trim();
      } else {
        body.wfm_session = token.trim();
        // Also extract wfm_csrf if user provides both cookies
        const csrfMatch = token.trim().match(/wfm_csrf=([^;]+)/);
        if (csrfMatch) {
          body.wfm_csrf = csrfMatch[1];
          // Clean the token to just be the session value
          body.wfm_session = token.trim().replace(/wfm_csfs=[^;]+;?\s*/g, "").trim();
        }
      }

      const response = await fetch("https://udbdvtcugpnrmtfipbzj.supabase.co/functions/v1/wfm-sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({
          success: false,
          message: data.error || data.details || `Error ${response.status}: ${data.message || "Unknown error"}`,
        });
        return;
      }

      setResult({
        success: true,
        message: `Synced ${data.synced} shift entries for ${data.start} to ${data.end}`,
      });
      toast.success(`WFM sync complete — ${data.synced} entries updated`);
      onSyncComplete?.();
      setToken("");
    } catch (err: any) {
      setResult({ success: false, message: err.message || "Network error" });
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Sync from WFM
            </DialogTitle>
            <DialogDescription>
              Pull your shift schedule from WFM (wfm.tabby.ai) into Green Tab.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Auth Method Selection */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Authentication Method</Label>
              <RadioGroup
                value={authMethod}
                onValueChange={(v) => { setAuthMethod(v as AuthMethod); setToken(""); setResult(null); }}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="wfm_session" id="wfm_session" />
                  <Label htmlFor="wfm_session" className="text-xs cursor-pointer">
                    wfm_session (Recommended)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="cf_authorization" id="cf_authorization" />
                  <Label htmlFor="cf_authorization" className="text-xs cursor-pointer">
                    CF_Authorization
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Instructions */}
            {authMethod === "cf_authorization" ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  1. Open{" "}
                  <a href="https://wfm.tabby.ai" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    wfm.tabby.ai
                  </a>{" "}
                  and log in with Google + 2FA
                </p>
                <p className="text-xs text-muted-foreground">
                  2. Open DevTools (F12) → Application → Cookies → find{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-[11px]">CF_Authorization</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  3. Copy the token value and paste it below
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  1. Open{" "}
                  <a href="https://wfm.tabby.ai" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                    wfm.tabby.ai
                  </a>{" "}
                  and log in with your company Google account
                </p>
                <p className="text-xs text-muted-foreground">
                  2. Open DevTools (F12) → Application → Cookies →{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-[11px]">wfm.tabby.ai</code>
                </p>
                <p className="text-xs text-muted-foreground">
                  3. Copy the <code className="bg-muted px-1 py-0.5 rounded text-[11px]">wfm_session</code> cookie value (the long JWT starting with <code className="bg-muted px-1 py-0.5 rounded text-[11px]">eyJ...</code>)
                </p>
                <p className="text-xs text-muted-foreground">
                  4. Also copy <code className="bg-muted px-1 py-0.5 rounded text-[11px]">wfm_csrf</code> if available. Paste both separated by a semicolon, or just the session value.
                </p>
              </div>
            )}

            {/* Token Input */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {authMethod === "cf_authorization" ? "CF_Authorization Token" : "wfm_session Cookie"}
              </Label>
              <Textarea
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={
                  authMethod === "cf_authorization"
                    ? "Paste the CF_Authorization cookie value here..."
                    : "Paste the wfm_session JWT value here... (e.g. eyJhbGci...)"
                }
                rows={3}
                className="font-mono text-xs"
              />
              {authMethod === "wfm_session" && (
                <p className="text-[10px] text-muted-foreground">
                  ⏱ The wfm_session cookie expires every ~24 hours. You'll need to re-copy it each time.
                </p>
              )}
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
            <Button onClick={handleSync} disabled={loading || !token.trim()}>
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