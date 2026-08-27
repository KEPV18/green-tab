import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Clock, Save, Plus, Trash2 } from "lucide-react";
import { getUserSettings, updateUserSettings } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const SHIFT_PREFIX = "gt_shifts_";

interface ShiftEntry {
  id: string;
  date: string;
  shift_start: string;
  shift_end: string;
  break_minutes: number;
  is_off_day: boolean;
  absence_type: string;
  is_site_day: boolean;
  notes: string;
}

interface WorkScheduleSettingsProps {
  userId?: string;
  selectedMonth?: number;
  selectedYear?: number;
}

export const WorkScheduleSettings = ({ userId: propUserId, selectedMonth: propMonth, selectedYear: propYear }: WorkScheduleSettingsProps) => {
  const { user } = useAuth();
  const userId = propUserId || user?.id || "local";
  const selectedMonth = propMonth ?? new Date().getMonth();
  const selectedYear = propYear ?? new Date().getFullYear();

  const [shiftStartTime, setShiftStartTime] = useState("09:00");
  const [shiftEndTime, setShiftEndTime] = useState("18:00");
  const [breakMinutes, setBreakMinutes] = useState(60);
  const [isSiteDay, setIsSiteDay] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    try {
      const settings = getUserSettings(userId) as any;
      if (settings) {
        setShiftStartTime(settings.shiftStartTime || settings.shift_start_time || "09:00");
        setShiftEndTime(settings.shiftEndTime || settings.shift_end_time || "18:00");
        setBreakMinutes(settings.breakMinutes || settings.break_minutes || 60);
        setIsSiteDay(settings.isSiteDay ?? settings.is_site_day ?? true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [user, userId]);

  const handleSave = () => {
    setSaving(true);
    try {
      updateUserSettings(userId, {
        shiftStartTime,
        shiftEndTime,
        breakMinutes,
        isSiteDay,
      } as any);
      toast.success("Shift settings saved");
    } catch (e) {
      console.error(e);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="p-4 border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          Shift Settings
        </h3>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Start Time</Label>
            <Input
              type="time"
              value={shiftStartTime}
              onChange={(e) => setShiftStartTime(e.target.value)}
              className="h-9"
            />
          </div>
          <div>
            <Label className="text-xs">End Time</Label>
            <Input
              type="time"
              value={shiftEndTime}
              onChange={(e) => setShiftEndTime(e.target.value)}
              className="h-9"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Break (minutes)</Label>
            <Input
              type="number"
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(parseInt(e.target.value) || 60)}
              className="h-9"
            />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch
              checked={isSiteDay}
              onCheckedChange={setIsSiteDay}
            />
            <Label className="text-xs">On-site day</Label>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? "Saving..." : "Save Shift Settings"}
        </Button>
      </div>
    </Card>
  );
};