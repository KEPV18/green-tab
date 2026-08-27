import { safeId } from "@/lib/utils";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, Plus, Trash2, Clock, MapPin, Building } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getUserSettings } from "@/lib/store";

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
  ot_hours_day: number;
  ot_hours_night: number;
  ot_hours_special: number;
  notes: string;
}

function readShift(userId: string, date: string): ShiftEntry | null {
  try {
    const key = `${SHIFT_PREFIX}${userId}_${date}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function writeShift(userId: string, date: string, shift: ShiftEntry): void {
  try {
    const key = `${SHIFT_PREFIX}${userId}_${date}`;
    localStorage.setItem(key, JSON.stringify(shift));
  } catch {}
}

function removeShift(userId: string, date: string): void {
  try {
    const key = `${SHIFT_PREFIX}${userId}_${date}`;
    localStorage.removeItem(key);
  } catch {}
}

export default function WorkSchedule() {
  const { user } = useAuth();
  const userId = user?.id || "local";
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [shifts, setShifts] = useState<Record<string, ShiftEntry>>({});
  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStart] = useState("09:00");
  const [newEnd, setNewEnd] = useState("18:00");
  const [newBreak, setNewBreak] = useState(60);

  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthName = new Date(selectedYear, selectedMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  useEffect(() => {
    const loaded: Record<string, ShiftEntry> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const shift = readShift(userId, dateStr);
      if (shift) loaded[dateStr] = shift;
    }
    setShifts(loaded);
  }, [userId, selectedMonth, selectedYear, daysInMonth]);

  const addShift = () => {
    if (!newDate) { toast.error("Select a date"); return; }
    const shift: ShiftEntry = {
      id: safeId(),
      date: newDate,
      shift_start: newStart,
      shift_end: newEnd,
      break_minutes: newBreak,
      is_off_day: false,
      absence_type: "",
      is_site_day: true,
      ot_hours_day: 0,
      ot_hours_night: 0,
      ot_hours_special: 0,
      notes: "",
    };
    writeShift(userId, newDate, shift);
    setShifts(prev => ({ ...prev, [newDate]: shift }));
    toast.success(`Shift added for ${newDate}`);
  };

  const markOffDay = (date: string) => {
    const existing = shifts[date];
    const shift: ShiftEntry = {
      id: existing?.id || safeId(),
      date,
      shift_start: existing?.shift_start || "",
      shift_end: existing?.shift_end || "",
      break_minutes: 0,
      is_off_day: true,
      absence_type: existing?.absence_type || "casual_leave",
      is_site_day: false,
      ot_hours_day: 0,
      ot_hours_night: 0,
      ot_hours_special: 0,
      notes: existing?.notes || "",
    };
    writeShift(userId, date, shift);
    setShifts(prev => ({ ...prev, [date]: shift }));
    toast.success(`${date} marked as off day`);
  };

  const deleteShift = (date: string) => {
    removeShift(userId, date);
    setShifts(prev => {
      const next = { ...prev };
      delete next[date];
      return next;
    });
    toast.success("Shift removed");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Work Schedule
        </h1>
      </div>

      <Card className="p-4 border-border/60 bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-2 flex-1">
            <Button variant="outline" size="sm" onClick={() => {
              if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
              else setSelectedMonth(m => m - 1);
            }}>←</Button>
            <span className="text-sm font-bold min-w-[140px] text-center">{monthName}</span>
            <Button variant="outline" size="sm" onClick={() => {
              if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
              else setSelectedMonth(m => m + 1);
            }}>→</Button>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="flex-1" />
          <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="w-28" />
          <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="w-28" />
          <Input type="number" value={newBreak} onChange={(e) => setNewBreak(parseInt(e.target.value) || 60)} className="w-20" placeholder="Break" />
          <Button onClick={addShift} size="sm"><Plus className="h-4 w-4 mr-1" /> Add</Button>
        </div>

        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {Object.entries(shifts).sort(([a], [b]) => a.localeCompare(b)).map(([date, shift]) => (
            <div key={date} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{date}</span>
                {shift.is_off_day ? (
                  <span className="text-xs text-warning">OFF</span>
                ) : (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{shift.shift_start}–{shift.shift_end}</span>
                    {shift.is_site_day && <MapPin className="h-3 w-3 text-primary" />}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => markOffDay(date)}>
                  <CalendarDays className="h-3 w-3 text-warning" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteShift(date)}>
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {Object.keys(shifts).length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No shifts scheduled for {monthName}</p>
          )}
        </div>
      </Card>
    </div>
  );
}