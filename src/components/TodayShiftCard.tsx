import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Clock, MapPin, Building } from "lucide-react";
import { getUserSettings } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";

const SHIFT_PREFIX = "gt_shifts_";

interface ShiftData {
  shiftStart: string;
  shiftEnd: string;
  isSiteDay: boolean;
  isOffDay: boolean;
}

function readTodayShift(userId: string): ShiftData | null {
  try {
    const today = new Date().toISOString().split('T')[0];
    const key = `${SHIFT_PREFIX}${userId}_${today}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export const TodayShiftCard = () => {
  const { user } = useAuth();
  const userId = user?.id || "local";
  const [shift, setShift] = useState<ShiftData | null>(null);
  const [shiftStartTime, setShiftStartTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    try {
      const todayShift = readTodayShift(userId);
      setShift(todayShift);

      const settings = getUserSettings(userId) as any;
      if (settings?.shiftStartTime) {
        setShiftStartTime(settings.shiftStartTime);
      }
    } catch (e) {
      console.error('Error loading shift data:', e);
    } finally {
      setLoading(false);
    }
  }, [user, userId]);

  if (loading) return null;

  const now = new Date();
  const isToday = shift && !shift.isOffDay;

  let timeToShiftEnd = "";
  let shiftLabel = "No shift today";

  if (isToday && shift!.shiftStart && shift!.shiftEnd) {
    const [startH, startM] = shift!.shiftStart.split(':').map(Number);
    const [endH, endM] = shift!.shiftEnd.split(':').map(Number);
    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startH, startM);
    let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), endH, endM);
    if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1); // overnight shift

    const diff = endDate.getTime() - now.getTime();
    if (diff > 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      timeToShiftEnd = `${hours}h ${minutes}m left`;
      shiftLabel = shift!.isSiteDay ? "On-site shift" : "Remote shift";
    } else {
      shiftLabel = "Shift ended";
    }
  } else if (shift?.isOffDay) {
    shiftLabel = "Day off 🏖️";
  } else if (shiftStartTime) {
    shiftLabel = `Shift at ${shiftStartTime}`;
  }

  return (
    <Card className="p-3 border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Today</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{shiftLabel}</p>
          {isToday && shift!.shiftStart && (
            <p className="text-xs text-muted-foreground">{shift!.shiftStart} – {shift!.shiftEnd}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {shift?.isSiteDay && (
            <span className="flex items-center gap-1 text-xs text-primary">
              <MapPin className="h-3 w-3" /> Site
            </span>
          )}
          {timeToShiftEnd && (
            <span className="text-xs font-mono font-bold text-primary">{timeToShiftEnd}</span>
          )}
        </div>
      </div>
    </Card>
  );
};