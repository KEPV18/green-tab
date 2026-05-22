import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { MonthSelector } from "@/components/MonthSelector";
import { DailyShiftSchedule } from "@/components/DailyShiftSchedule";
import { ExpectedSalary } from "@/components/ExpectedSalary";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarOff, Briefcase, ShieldAlert, Building } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getStaticShift } from "@/lib/staticSchedule";
import { WFMSyncButton } from "@/components/schedule/WFMSyncButton";

export default function WorkSchedule() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [performanceId, setPerformanceId] = useState<string | null>(null);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [absenceDate, setAbsenceDate] = useState(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  });
  const [absenceType, setAbsenceType] = useState<string>("sick_leave");
  const [absenceNotes, setAbsenceNotes] = useState("");
  const [absenceSaving, setAbsenceSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [absenceStats, setAbsenceStats] = useState({ casual: 0, sick: 0, annual: 0, noShow: 0 });

  // New Site Period State
  const [sitePeriodDialogOpen, setSitePeriodDialogOpen] = useState(false);
  const [siteStartDate, setSiteStartDate] = useState("");
  const [siteEndDate, setSiteEndDate] = useState("");
  const [siteSaving, setSiteSaving] = useState(false);

  useEffect(() => {
    const loadPerformance = async () => {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from("performance_data")
          .select("id")
          .eq("year", selectedYear)
          .eq("month", selectedMonth)
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        setPerformanceId(data?.id || null);
      } catch {
        setPerformanceId(null);
      }
    };
    loadPerformance();
  }, [user?.id, selectedMonth, selectedYear]);

  useEffect(() => {
    const loadAbsenceStats = async () => {
      if (!user?.id) return;
      const startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${lastDay}`;

      const { data } = await supabase
        .from('daily_shifts')
        .select('absence_type')
        .eq('user_id', user.id)
        .eq('is_off_day', true)
        .gte('shift_date', startDate)
        .lte('shift_date', endDate);

      const aData = data || [];
      setAbsenceStats({
        casual: aData.filter(a => a.absence_type === 'casual_leave').length,
        sick: aData.filter(a => a.absence_type === 'sick_leave').length,
        annual: aData.filter(a => a.absence_type === 'annual_leave').length,
        noShow: aData.filter(a => a.absence_type === 'no_show').length,
      });
    };
    loadAbsenceStats();
  }, [user?.id, selectedMonth, selectedYear, refreshKey]);

  const handleRecordAbsence = async () => {
    if (!user?.id) return;
    setAbsenceSaving(true);
    try {
      const { data: existing } = await supabase
        .from('daily_shifts')
        .select('id')
        .eq('user_id', user.id)
        .eq('shift_date', absenceDate)
        .maybeSingle();

      const shiftData = {
        user_id: user.id,
        shift_date: absenceDate,
        is_off_day: true,
        absence_type: absenceType,
        shift_start: null,
        shift_end: null,
        break1_time: null,
        break2_time: null,
        break3_time: null,
        notes: absenceNotes || null,
      };

      if (existing) {
        await supabase.from('daily_shifts').update(shiftData).eq('id', existing.id);
      } else {
        await supabase.from('daily_shifts').insert(shiftData);
      }

      toast.success("Absence recorded successfully");
      setAbsenceDialogOpen(false);
      setAbsenceNotes("");
      setRefreshKey(k => k + 1);
    } catch (error) {
      console.error(error);
      toast.error("Failed to record absence");
    } finally {
      setAbsenceSaving(false);
    }
  };

  const handleSitePeriodSave = async () => {
    if (!user?.id || !siteStartDate) {
      toast.error("Please select a start date.");
      return;
    }
    
    setSiteSaving(true);
    try {
      const start = new Date(siteStartDate);
      const end = siteEndDate ? new Date(siteEndDate) : new Date(); // Defaults to today if missing
      
      const datesToUpdate: string[] = [];
      // Collect dates
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        datesToUpdate.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }

      if (datesToUpdate.length === 0) {
        toast.error("Invalid date range.");
        return;
      }

      const { data: existingShifts } = await supabase
        .from('daily_shifts')
        .select('*')
        .eq('user_id', user.id)
        .in('shift_date', datesToUpdate);
        
      const existingMap = new Map((existingShifts || []).map(s => [s.shift_date, s]));
      
      const upsertPayload = datesToUpdate.map(date => {
        const existing = existingMap.get(date);
        if (existing) {
           return { ...existing, is_site_day: true };
        }
        
        const staticShift = getStaticShift(date);
        return {
            user_id: user.id,
            shift_date: date,
            shift_start: staticShift?.shift_start || null,
            shift_end: staticShift?.shift_end || null,
            break1_time: staticShift?.break1_time || null,
            break1_duration: staticShift?.break1_duration || 15,
            break2_time: staticShift?.break2_time || null,
            break2_duration: staticShift?.break2_duration || 30,
            break3_time: staticShift?.break3_time || null,
            break3_duration: staticShift?.break3_duration || 15,
            is_off_day: staticShift?.is_off_day || false,
            is_site_day: true,
        };
      });

      const toUpdate = upsertPayload.filter(p => 'id' in p);
      const toInsert = upsertPayload.filter(p => !('id' in p));

      if (toUpdate.length > 0) {
        const { error } = await supabase.from('daily_shifts').upsert(toUpdate, { onConflict: 'id' });
        if (error) throw error;
      }
      
      if (toInsert.length > 0) {
        const { error } = await supabase.from('daily_shifts').insert(toInsert);
        if (error) throw error;
      }
      
      toast.success("Site period saved successfully!");
      setSitePeriodDialogOpen(false);
      setRefreshKey(k => k + 1);
    } catch (error: any) {
      console.error("Site Bulk Save Error:", error);
      toast.error(error.message || "Failed to save site period");
    } finally {
      setSiteSaving(false);
    }
  };

  const totalAbsence = absenceStats.casual + absenceStats.sick + absenceStats.annual + absenceStats.noShow;
  const absenceGateScore = totalAbsence <= 1 ? 100 : totalAbsence === 2 ? 75 : 0;



  const monthName = new Date(selectedYear, selectedMonth).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Work Schedule
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage shifts, off days & absences for <span className="font-medium text-foreground">{monthName}</span>
          </p>
        </div>
        <div className="flex gap-2 self-start flex-wrap">
          <WFMSyncButton onSyncComplete={() => setRefreshKey(k => k + 1)} />
          <Button onClick={() => setSitePeriodDialogOpen(true)} variant="outline" size="sm" className="gap-2">
            <Building className="h-4 w-4 text-indigo-500" />
            Set Site Period
          </Button>
          <Button onClick={() => setAbsenceDialogOpen(true)} variant="destructive" size="sm" className="gap-2">
            <CalendarOff className="h-4 w-4" />
            Record Absence
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className={`p-4 border-l-4 ${absenceGateScore === 100 ? 'border-l-success' : absenceGateScore === 75 ? 'border-l-warning' : 'border-l-destructive'}`}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">KPI Gate</span>
          </div>
          <p className={`text-2xl font-bold font-mono ${absenceGateScore === 100 ? 'text-success' : absenceGateScore === 75 ? 'text-warning' : 'text-destructive'}`}>
            {absenceGateScore}%
          </p>
        </Card>
        <Card className="p-4">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">👕 Casual</span>
          <p className={`text-2xl font-bold font-mono ${absenceStats.casual > 0 ? 'text-destructive' : 'text-foreground'}`}>{absenceStats.casual}</p>
          <p className="text-[10px] text-muted-foreground">-1 Day & -25% KPI</p>
        </Card>
        <Card className="p-4">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">🤒 Sick</span>
          <p className="text-2xl font-bold font-mono text-foreground">{absenceStats.sick}</p>
          <p className="text-[10px] text-muted-foreground">-25% KPI</p>
        </Card>
        <Card className="p-4">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">📅 Annual</span>
          <p className="text-2xl font-bold font-mono text-foreground">{absenceStats.annual}</p>
          <p className="text-[10px] text-muted-foreground">-25% KPI</p>
        </Card>
        <Card className="p-4">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">❌ No Show</span>
          <p className={`text-2xl font-bold font-mono ${absenceStats.noShow > 0 ? 'text-destructive' : 'text-foreground'}`}>{absenceStats.noShow}</p>
          <p className="text-[10px] text-muted-foreground">-3 Days & -25% KPI</p>
        </Card>
      </div>

      {/* Expected Salary */}
      {user?.id && <ExpectedSalary userId={user.id} selectedMonth={selectedMonth} selectedYear={selectedYear} />}

      {/* Month Selector */}
      <MonthSelector
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        onMonthChange={setSelectedMonth}
        onYearChange={setSelectedYear}
      />

      {/* Unified Daily Shift Schedule */}
      <DailyShiftSchedule
        key={refreshKey}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        performanceId={performanceId}
        onShiftChanged={() => setRefreshKey(k => k + 1)}
      />

      {/* Record Absence Dialog */}
      <Dialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff className="h-5 w-5 text-destructive" />
              Record Absence
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={absenceDate} onChange={(e) => setAbsenceDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Absence Type</Label>
              <Select value={absenceType} onValueChange={setAbsenceType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="casual_leave">Casual Leave (-1 Day & -25% KPI)</SelectItem>
                  <SelectItem value="sick_leave">Sick Leave (-25% KPI)</SelectItem>
                  <SelectItem value="annual_leave">Annual Leave (-25% KPI)</SelectItem>
                  <SelectItem value="no_show">No Show No Call (-3 Days & -25% KPI)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {absenceType === 'scheduled_off' 
                  ? '⚡ Requested leave does not affect the Absence Gate'
                  : '⚠️ This absence type affects the Absence Gate score'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={absenceNotes} onChange={(e) => setAbsenceNotes(e.target.value)} placeholder="Reason for absence..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbsenceDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRecordAbsence} disabled={absenceSaving}>
              {absenceSaving ? "Saving..." : "Record Absence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Site Period Dialog */}
      <Dialog open={sitePeriodDialogOpen} onOpenChange={setSitePeriodDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5 text-indigo-500" />
              Batch Set Site Period
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Automatically sets 'Worked from Site' for the specified period. Leave the End Date blank to apply from the Start Date up until today.
            </p>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={siteStartDate} onChange={(e) => setSiteStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Date <span className="text-xs font-normal text-muted-foreground">(Optional)</span></Label>
                <Input type="date" value={siteEndDate} onChange={(e) => setSiteEndDate(e.target.value)} placeholder="Defaults to today" />
              </div>
            </div>
            <div className="pt-2 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSitePeriodDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSitePeriodSave} disabled={siteSaving || !siteStartDate}>
                Apply Site Days
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
