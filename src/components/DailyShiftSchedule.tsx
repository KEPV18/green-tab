import { safeId } from "@/lib/utils";
import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PREFIX = "gt_daily_shifts_";

interface Shift {
  id: string;
  date: string;
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
  isOffDay: boolean;
  absenceType: string;
  notes: string;
}

function readShifts(userId: string, date: string): Shift | null {
  try {
    const key = `${PREFIX}${userId}_${date}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function writeShift(userId: string, date: string, shift: Shift): void {
  try {
    const key = `${PREFIX}${userId}_${date}`;
    localStorage.setItem(key, JSON.stringify(shift));
  } catch {}
}

function removeShift(userId: string, date: string): void {
  try {
    const key = `${PREFIX}${userId}_${date}`;
    localStorage.removeItem(key);
  } catch {}
}

interface DailyShiftScheduleProps {
  userId: string;
  selectedMonth: number;
  selectedYear: number;
}

const SHIFT_TEMPLATES = [
  { label: "09:00–18:00", start: "09:00", end: "18:00", break: 60 },
  { label: "10:00–19:00", start: "10:00", end: "19:00", break: 60 },
  { label: "14:00–23:00", start: "14:00", end: "23:00", break: 60 },
  { label: "15:00–00:00", start: "15:00", end: "00:00", break: 60 },
  { label: "16:00–01:00", start: "16:00", end: "01:00", break: 60 },
  { label: "09:00–17:00", start: "09:00", end: "17:00", break: 30 },
  { label: "10:00–18:00", start: "10:00", end: "18:00", break: 30 },
  { label: "Custom", start: "", end: "", break: 60 },
];

export const DailyShiftSchedule = ({ userId, selectedMonth, selectedYear }: DailyShiftScheduleProps) => {
  const [shifts, setShifts] = useState<Record<string, Shift>>({});
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [templateIdx, setTemplateIdx] = useState(0);

  const daysInMonth = useMemo(() => {
    return new Date(selectedYear, selectedMonth + 1, 0).getDate();
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    const loaded: Record<string, Shift> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const shift = readShifts(userId, dateStr);
      if (shift) loaded[dateStr] = shift;
    }
    setShifts(loaded);
  }, [userId, selectedMonth, selectedYear, daysInMonth]);

  const addShift = () => {
    if (!selectedDate) {
      toast.error("Select a date first");
      return;
    }
    const template = SHIFT_TEMPLATES[templateIdx];
    if (template.label === "Custom" && (!shifts[selectedDate]?.shiftStart)) {
      toast.error("Enter custom shift times");
      return;
    }
    const shift: Shift = {
      id: safeId(),
      date: selectedDate,
      shiftStart: template.label === "Custom" ? (shifts[selectedDate]?.shiftStart || "09:00") : template.start,
      shiftEnd: template.label === "Custom" ? (shifts[selectedDate]?.shiftEnd || "18:00") : template.end,
      breakMinutes: template.label === "Custom" ? (shifts[selectedDate]?.breakMinutes || 60) : template.break,
      isOffDay: false,
      absenceType: "",
      notes: "",
    };
    writeShift(userId, selectedDate, shift);
    setShifts(prev => ({ ...prev, [selectedDate]: shift }));
    toast.success(`Shift added for ${selectedDate}`);
  };

  const markOffDay = (date: string) => {
    const existing = shifts[date];
    const shift: Shift = {
      id: existing?.id || safeId(),
      date,
      shiftStart: "",
      shiftEnd: "",
      breakMinutes: 0,
      isOffDay: true,
      absenceType: existing?.absenceType || "",
      notes: existing?.notes || "",
    };
    writeShift(userId, date, shift);
    setShifts(prev => ({ ...prev, [date]: shift }));
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
    <Card className="p-4 border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          Daily Shifts
        </h3>
      </div>

      <div className="flex gap-2 mb-4">
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="flex-1"
        />
        <Select value={String(templateIdx)} onValueChange={(v) => setTemplateIdx(Number(v))}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Shift template" />
          </SelectTrigger>
          <SelectContent>
            {SHIFT_TEMPLATES.map((t, i) => (
              <SelectItem key={i} value={String(i)}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={addShift} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      </div>

      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {Object.entries(shifts)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, shift]) => (
            <div key={date} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg border border-border/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{date}</span>
                {shift.isOffDay ? (
                  <span className="text-xs text-warning">OFF</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {shift.shiftStart}–{shift.shiftEnd}
                  </span>
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
          <p className="text-xs text-muted-foreground text-center py-4">No shifts scheduled yet</p>
        )}
      </div>
    </Card>
  );
};