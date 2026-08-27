import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ThumbsUp, ThumbsDown, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CelebrationAnimation } from "@/components/CelebrationAnimation";
import { useMotivationalAlerts } from "@/hooks/useMotivationalAlerts";
import { DailySummaryCard } from "@/components/DailySummaryCard";
import { QuickActionsBar } from "@/components/QuickActionsBar";

import { MetricCard } from "@/components/MetricCard";
import { PercentageDisplay } from "@/components/PercentageDisplay";
import { TicketsTable, Ticket } from "@/components/TicketsTable";
import { ChannelAnalytics } from "@/components/ChannelAnalytics";
import { MonthSelector } from "@/components/MonthSelector";
import { WeeklyProgress } from "@/components/WeeklyProgress";
import { DailyChangeLog } from "@/components/DailyChangeLog";
import { MonthComparison } from "@/components/MonthComparison";
import { GenesysTicketForm } from "@/components/GenesysTicketForm";
import { FCRMetric } from "@/components/FCRMetric";
import { DailyTarget } from "@/components/DailyTarget";
import { SmartRatingDialog } from "@/components/SmartRatingDialog";
import { HoldTicketsSection } from "@/components/HoldTicketsSection";
import { DailyNotesSection } from "@/components/DailyNotesSection";
import { BreakScheduler } from "@/components/BreakScheduler";
import { TodayShiftCard } from "@/components/TodayShiftCard";
import { BestProductiveTime } from "@/components/BestProductiveTime";
import { MonthEndForecast } from "@/components/MonthEndForecast";
import { PhoneBonusKPI } from "@/components/PhoneBonusKPI";
import { SmartKPITips } from "@/components/SmartKPITips";
import { StreaksMilestones } from "@/components/StreaksMilestones";
import { DailyKPITarget } from "@/components/DailyKPITarget";
import { ManualProductivityCard } from "@/components/ManualProductivityCard";
import { useAuth } from "@/hooks/useAuth";
import { ThreeMonthPerformance, MonthMetrics } from "@/components/ThreeMonthPerformance";
import {
  getMonthData,
  updateMonthData,
  getTickets,
  addTicket,
  removeTicket,
  getGenesysTickets,
  addGenesysTicket,
  removeGenesysTicket,
  getDailyChanges,
  addDailyChange,
  getUserSettings,
  updateUserSettings,
  calculateFloorAverages,
  listMonthData,
  type MonthData,
  type GenesysTicket as StoreGenesysTicket,
  type DailyChange,
  type FloorAverageData,
} from "@/lib/store";
import { STATIC_SCHEDULE } from "@/lib/staticSchedule";

interface WeeklyData {
  week: number;
  csat: number;
  dsat: number;
}

interface GenesysTicket {
  id?: string;
  ticketLink: string;
  ratingScore: number;
  customerPhone: string;
  ticketDate: string;
  ticketId?: string;
  channel?: "Phone" | "Chat" | "Email";
  note?: string;
}

interface MonthlyData {
  good: number;
  bad: number;
  karmaBad: number;
  genesysGood: number;
  genesysBad: number;
  fcr: number;
  tickets: Ticket[];
  goodByChannel: {
    phone: number;
    chat: number;
    email: number;
  };
  badByChannel?: {
    phone: number;
    chat: number;
    email: number;
  };
}

interface TodayStats {
  good: number;
  bad: number;
}

interface FloorAvgDisplay {
  yourValue: number;
  floorAvg: number;
  diff: number;
  status: "above" | "below" | "at";
}

const CSAT_TARGET_START = 75; // Changed from 88% to 75%

const Index = () => {
  const { user } = useAuth();
  const userId = user?.id || "local";
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [performanceId, setPerformanceId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [focusMode, setFocusMode] = useState(false);
  const [celebrationType, setCelebrationType] = useState<"confetti" | "firework" | null>(null);
  const [celebrationTrigger, setCelebrationTrigger] = useState(false);
  const prevKpiRef = useRef(0);
  const { checkKPIAlerts, checkDailyTargetAlerts } = useMotivationalAlerts();
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ktb_active_tab") || "overview";
    }
    return "overview";
  });
  useEffect(() => {
    localStorage.setItem("ktb_active_tab", activeTab);
  }, [activeTab]);
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "ktb_active_tab" && e.newValue) {
        setActiveTab(e.newValue);
      }
    };
    const customHandler = (e: Event) => {
      const ce = e as CustomEvent<string>;
      const val = ce.detail;
      if (typeof val === "string" && val.length > 0) {
        setActiveTab(val);
      }
    };
    window.addEventListener("storage", handler);
    window.addEventListener("ktb_tab_change", customHandler as EventListener);
    return () => {
      window.removeEventListener("storage", handler);
      window.removeEventListener("ktb_tab_change", customHandler as EventListener);
    };
  }, []);

  // Smart rating dialog state
  const [smartDialogOpen, setSmartDialogOpen] = useState(false);
  const [smartDialogType, setSmartDialogType] = useState<'good' | 'bad' | null>(null);

  // Today's stats for daily target
  const [todayStats, setTodayStats] = useState<TodayStats>({ good: 0, bad: 0 });

  // Floor averages for metrics
  const [floorAverages, setFloorAverages] = useState<FloorAverageData | null>(null);

  const [data, setData] = useState<MonthlyData>({
    good: 0,
    bad: 0,
    karmaBad: 0,
    genesysGood: 0,
    genesysBad: 0,
    fcr: 0,
    tickets: [],
    goodByChannel: { phone: 0, chat: 0, email: 0 },
    badByChannel: { phone: 0, chat: 0, email: 0 },
  });

  const [previousData, setPreviousData] = useState<MonthlyData | null>(null);
  const [previousMonthData, setPreviousMonthData] = useState<MonthlyData | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [genesysTickets, setGenesysTickets] = useState<GenesysTicket[]>([]);
  const [offDays, setOffDays] = useState<number[] | null>(null);
  const [monthlyChangeLog, setMonthlyChangeLog] = useState<DailyChange[]>([]);
  const [shiftStartTime, setShiftStartTime] = useState<string | null>(null);
  const [hasRestored, setHasRestored] = useState(false);
  const [selectedThreeMonths, setSelectedThreeMonths] = useState<Array<{ month: number; year: number }>>(() => {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const prev1Month = m - 1 < 0 ? 11 : m - 1;
    const prev1Year = m - 1 < 0 ? y - 1 : y;
    const prev2Month = m - 2 < 0 ? (12 + (m - 2)) : m - 2;
    const prev2Year = m - 2 < 0 ? y - 1 : y;
    return [
      { month: m, year: y },
      { month: prev1Month, year: prev1Year },
      { month: prev2Month, year: prev2Year },
    ];
  });
  const [threeMonthsMetrics, setThreeMonthsMetrics] = useState<MonthMetrics[]>([]);

  // Refs to always have latest data for saveToDatabase
  const dataRef = useRef(data);
  dataRef.current = data;
  const genesysTicketsRef = useRef(genesysTickets);
  genesysTicketsRef.current = genesysTickets;
  const previousDataRef = useRef(previousData);
  previousDataRef.current = previousData;
  const performanceIdRef = useRef(performanceId);
  performanceIdRef.current = performanceId;

  const [includeKarmaInCSAT] = useState<boolean>(false);

  // Available months for selection (last 12 months)
  const availableMonthsForComparison = useMemo(() => {
    const result: Array<{ month: number; year: number; label: string }> = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push({
        month: d.getMonth(),
        year: d.getFullYear(),
        label: d.toLocaleString("en-US", { month: "short", year: "2-digit" }),
      });
    }
    return result;
  }, []);

  // IMPORTANT: Do NOT auto-reconcile counters from tickets/genesys lists.
  // This was causing cascaded changes (+10 then -9, etc.) and polluting the Daily Change Log.
  // Metrics should only change via explicit user actions (Smart Rating / +/- buttons).

  // Check if today should be counted based on shift time
  const shouldCountToday = useMemo(() => {
    if (!shiftStartTime) return true; // Default: count today

    const now = new Date();
    const [hours, minutes] = shiftStartTime.split(':').map(Number);

    // Create shift end time (shift start + 9 hours)
    const shiftEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours + 9, minutes);

    // If current time is before shift end, count today
    return now <= shiftEnd;
  }, [shiftStartTime]);

  const remainingWorkingDays = useMemo(() => {
    const today = new Date();
    // Only calculate for current month
    if (selectedMonth !== today.getMonth() || selectedYear !== today.getFullYear()) {
      return undefined;
    }

    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const currentDay = today.getDate();
    let working = 0;

    // Start from today or tomorrow based on shift time
    const startDay = shouldCountToday ? currentDay : currentDay + 1;

    for (let d = startDay; d <= lastDay; d++) {
      if (offDays !== null) {
        // User has defined schedule (explicit off days)
        if (!offDays.includes(d)) working++;
      } else {
        // Default: all days are work days except those marked as off
        working++;
      }
    }
    return working;
  }, [offDays, selectedMonth, selectedYear, shouldCountToday]);

  // Load shift time from user settings (localStorage)
  useEffect(() => {
    if (!user) return;
    const settings = getUserSettings(userId);
    if (settings.shiftStartTime) {
      setShiftStartTime(settings.shiftStartTime);
    }
  }, [user, userId]);

  // Load data from localStorage when month/year changes or user changes
  useEffect(() => {
    if (user) {
      loadMonthData();
      loadPreviousMonthData();
    }
  }, [selectedMonth, selectedYear, user]);

  useEffect(() => {
    if (user) {
      loadSelectedMonthsData();
    }
  }, [selectedThreeMonths, user, includeKarmaInCSAT]);

  const loadMonthData = () => {
    if (!user) return;

    const monthData = getMonthData(userId, selectedYear, selectedMonth);
    setPerformanceId(monthData.id);

    // Use off_days or fallback to static schedule
    let loadedOffDays = (monthData as any).offDays || null;
    if (!loadedOffDays || loadedOffDays.length === 0) {
      loadedOffDays = STATIC_SCHEDULE
        .filter(s => {
          const [y, m] = s.date.split('-').map(Number);
          return y === selectedYear && (m - 1) === selectedMonth && s.is_off_day;
        })
        .map(s => parseInt(s.date.split('-')[2], 10));
    }
    setOffDays(loadedOffDays);

    const loadedData: MonthlyData = {
      good: monthData.good || 0,
      bad: monthData.bad || 0,
      karmaBad: monthData.karmaBad || 0,
      genesysGood: monthData.genesysGood || 0,
      genesysBad: monthData.genesysBad || 0,
      fcr: monthData.fcr || 0,
      goodByChannel: {
        phone: (monthData as any).goodByChannel?.phone || 0,
        chat: (monthData as any).goodByChannel?.chat || 0,
        email: (monthData as any).goodByChannel?.email || 0,
      },
      badByChannel: {
        phone: (monthData as any).badByChannel?.phone || 0,
        chat: (monthData as any).badByChannel?.chat || 0,
        email: (monthData as any).badByChannel?.email || 0,
      },
      tickets: getTickets(monthData.id).map(t => ({
        id: t.id,
        ticketId: t.ticketId,
        type: t.type as "DSAT" | "Karma",
        channel: t.channel as "Phone" | "Chat" | "Email",
        note: t.note || "",
      })),
    };

    // Calculate weekly data from daily changes
    const changes = getDailyChanges(monthData.id);
    calculateWeeklyDataFromChanges(changes);
    loadTodayStats(changes);
    setMonthlyChangeLog(changes);

    // Load Genesys tickets
    const gTickets = getGenesysTickets(monthData.id);
    const loadedGenesys: GenesysTicket[] = gTickets.map(t => ({
      id: t.id,
      ticketLink: t.ticketLink,
      ratingScore: t.ratingScore,
      customerPhone: t.customerPhone || "",
      ticketDate: t.ticketDate,
      ticketId: t.ticketId || "",
      channel: (t.channel as "Phone" | "Chat" | "Email") || "Phone",
      note: t.note || "",
    }));
    setGenesysTickets(loadedGenesys);

    // Recalculate good/bad by channel from Genesys tickets
    let genesysGood = 0;
    let genesysBad = 0;
    const goodByChannel = { phone: 0, chat: 0, email: 0 };
    const badByChannel = { phone: 0, chat: 0, email: 0 };

    for (const t of loadedGenesys) {
      const isGood = t.ratingScore >= 7 && t.ratingScore <= 9;
      const channel = (t.channel || "phone").toLowerCase() as "phone" | "chat" | "email";
      if (isGood) {
        genesysGood++;
        if (channel in goodByChannel) goodByChannel[channel]++;
      } else {
        genesysBad++;
        if (channel in badByChannel) badByChannel[channel]++;
      }
    }

    // Calculate floor averages
    const floorAvgs = calculateFloorAverages(monthData);
    setFloorAverages(floorAvgs);

    setData(loadedData);
    setPreviousData(loadedData);
    setHasRestored(false);
  };

  const loadSelectedMonthsData = () => {
    if (!user) return;

    const results: MonthMetrics[] = selectedThreeMonths.map(sel => {
      const md = getMonthData(userId, sel.year, sel.month);
      const good = md.good || 0;
      const bad = md.bad || 0;
      const karmaBad = md.karmaBad || 0;
      const genesysGood = md.genesysGood || 0;
      const genesysBad = md.genesysBad || 0;
      const fcrVal = md.fcr || 0;

      const totalGoodSel = good + genesysGood;
      const totalBadSel = bad + genesysBad;
      const totalSurveysSel = totalGoodSel + totalBadSel;
      const totalKarmaBaseSel = totalGoodSel + totalBadSel + karmaBad;

      const csatSel = totalSurveysSel > 0 ? (totalGoodSel / totalSurveysSel) * 100 : 0;
      const karmaSel = totalKarmaBaseSel > 0 ? (totalGoodSel / totalKarmaBaseSel) * 100 : 0;

      // Channel distribution from store data
      const tickets = getTickets(md.id);
      const phoneGood = (md as any).goodByChannel?.phone || 0;
      const chatGood = (md as any).goodByChannel?.chat || 0;
      const emailGood = (md as any).goodByChannel?.email || 0;
      const phoneBad = tickets.filter(t => t.type === "DSAT" && t.channel === "Phone").length;
      const chatBad = tickets.filter(t => t.type === "DSAT" && t.channel === "Chat").length;
      const emailBad = tickets.filter(t => t.type === "DSAT" && t.channel === "Email").length;
      const phoneKarma = tickets.filter(t => t.type === "Karma" && t.channel === "Phone").length;

      return {
        month: sel.month,
        year: sel.year,
        csat: csatSel,
        karma: karmaSel,
        fcr: fcrVal,
        totalGood: totalGoodSel,
        totalSurveys: totalSurveysSel,
        totalKarmaBase: totalKarmaBaseSel,
        phoneGood,
        phoneBad,
        phoneKarma,
        chatGood,
        chatBad,
        emailGood,
        emailBad,
      };
    });

    setThreeMonthsMetrics(results);
  };

  const calculateWeeklyDataFromChanges = (changes: DailyChange[]) => {
    if (!changes || changes.length === 0) {
      setWeeklyData([]);
      return;
    }

    const weeklyStats: Record<number, { csat: number; dsat: number }> = {
      1: { csat: 0, dsat: 0 },
      2: { csat: 0, dsat: 0 },
      3: { csat: 0, dsat: 0 },
      4: { csat: 0, dsat: 0 },
    };

    changes.forEach((change) => {
      const date = new Date(change.changeDate);
      const dayOfMonth = date.getDate();

      let weekNumber;
      if (dayOfMonth <= 7) weekNumber = 1;
      else if (dayOfMonth <= 14) weekNumber = 2;
      else if (dayOfMonth <= 21) weekNumber = 3;
      else weekNumber = 4;

      if (change.fieldName === "good" || change.fieldName === "genesysGood") {
        weeklyStats[weekNumber].csat += change.changeAmount;
      } else if (change.fieldName === "bad" || change.fieldName === "genesysBad") {
        weeklyStats[weekNumber].dsat += change.changeAmount;
      }
    });

    const calculatedWeeklyData = Object.entries(weeklyStats).map(([week, stats]) => ({
      week: parseInt(week),
      csat: stats.csat,
      dsat: stats.dsat,
    }));

    setWeeklyData(calculatedWeeklyData);
  };

  const loadTodayStats = (changes: DailyChange[]) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      let todayGood = 0;
      let todayBad = 0;

      changes.forEach((change) => {
        if (change.changeDate === today) {
          if (change.fieldName === "good" || change.fieldName === "genesysGood") {
            todayGood += change.changeAmount;
          } else if (change.fieldName === "bad" || change.fieldName === "genesysBad" || change.fieldName === "karmaBad") {
            todayBad += change.changeAmount;
          }
        }
      });

      setTodayStats({ good: Math.max(0, todayGood), bad: Math.max(0, todayBad) });
    } catch (error) {
      console.error('Error loading today stats:', error);
    }
  };

  const loadPreviousMonthData = () => {
    if (!user) return;

    let prevMonth = selectedMonth - 1;
    let prevYear = selectedYear;

    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear -= 1;
    }

    const prevMd = getMonthData(userId, prevYear, prevMonth);
    const prevTickets = getTickets(prevMd.id);

    setPreviousMonthData({
      good: prevMd.good || 0,
      bad: prevMd.bad || 0,
      karmaBad: prevMd.karmaBad || 0,
      genesysGood: prevMd.genesysGood || 0,
      genesysBad: prevMd.genesysBad || 0,
      fcr: prevMd.fcr || 0,
      goodByChannel: {
        phone: (prevMd as any).goodByChannel?.phone || 0,
        chat: (prevMd as any).goodByChannel?.chat || 0,
        email: (prevMd as any).goodByChannel?.email || 0,
      },
      tickets: prevTickets.map(t => ({
        id: t.id,
        ticketId: t.ticketId,
        type: t.type as "DSAT" | "Karma",
        channel: t.channel as "Phone" | "Chat" | "Email",
        note: t.note || "",
      })),
    });
  };

  const restoreFromDailyChanges = () => {
    if (!user || !performanceId) return;
    try {
      const changes = getDailyChanges(performanceId);
      const totals = changes.reduce(
        (acc: { good: number; bad: number; karmaBad: number; genesysGood: number; genesysBad: number }, c: DailyChange) => {
          const amt = Number(c.changeAmount) || 0;
          if (c.fieldName === "good") acc.good += amt;
          else if (c.fieldName === "bad") acc.bad += amt;
          else if (c.fieldName === "karmaBad") acc.karmaBad += amt;
          else if (c.fieldName === "genesysGood") acc.genesysGood += amt;
          else if (c.fieldName === "genesysBad") acc.genesysBad += amt;
          return acc;
        },
        { good: 0, bad: 0, karmaBad: 0, genesysGood: 0, genesysBad: 0 }
      );
      setData(prev => ({
        ...prev,
        good: totals.good,
        bad: totals.bad,
        karmaBad: totals.karmaBad,
        genesysGood: totals.genesysGood,
        genesysBad: totals.genesysBad,
      }));

      // Also update the store
      updateMonthData(userId, selectedYear, selectedMonth, {
        good: totals.good,
        bad: totals.bad,
        karmaBad: totals.karmaBad,
        genesysGood: totals.genesysGood,
        genesysBad: totals.genesysBad,
        fcr: data.fcr,
      } as any);

      // Update previousData to prevent double-counting changes on next save
      setPreviousData(prev => ({
        ...prev!,
        good: totals.good,
        bad: totals.bad,
        karmaBad: totals.karmaBad,
        genesysGood: totals.genesysGood,
        genesysBad: totals.genesysBad,
      }));

      setHasRestored(true);
      toast.success('Restored month totals from history');
    } catch {}
  };

  useEffect(() => {
    if (
      performanceId &&
      !hasRestored &&
      monthlyChangeLog &&
      monthlyChangeLog.length > 0 &&
      data.good === 0 &&
      data.bad === 0 &&
      data.karmaBad === 0 &&
      data.genesysGood === 0 &&
      data.genesysBad === 0
    ) {
      restoreFromDailyChanges();
    }
  }, [performanceId, monthlyChangeLog, data, hasRestored]);

  const saveToDatabase = () => {
    if (!user) {
      toast.error('You must be logged in first');
      return;
    }

    if (savingRef.current) {
      return;
    }
    savingRef.current = true;
    setIsSaving(true);

    // Snapshot latest values from refs
    const currentData = dataRef.current;
    const currentGenesysTickets = genesysTicketsRef.current;
    const currentPreviousData = previousDataRef.current;

    try {
      // Save month data to localStorage
      updateMonthData(userId, selectedYear, selectedMonth, {
        good: currentData.good,
        bad: currentData.bad,
        karmaBad: currentData.karmaBad,
        genesysGood: currentData.genesysGood,
        genesysBad: currentData.genesysBad,
        fcr: currentData.fcr,
      } as any);

      // Log incremental daily changes
      const currentPerformanceId = performanceIdRef.current;
      const baseline = currentPreviousData;
      if (baseline && currentPerformanceId) {
        const fieldsToTrack = [
          { field: "good" as const, newVal: currentData.good, oldVal: baseline.good },
          { field: "bad" as const, newVal: currentData.bad, oldVal: baseline.bad },
          { field: "karmaBad" as const, newVal: currentData.karmaBad, oldVal: baseline.karmaBad },
          { field: "genesysGood" as const, newVal: currentData.genesysGood, oldVal: baseline.genesysGood },
          { field: "genesysBad" as const, newVal: currentData.genesysBad, oldVal: baseline.genesysBad },
          { field: "fcr" as const, newVal: currentData.fcr, oldVal: baseline.fcr },
        ];

        const today = new Date().toISOString().split("T")[0];
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

        for (const f of fieldsToTrack) {
          if (f.newVal !== f.oldVal) {
            addDailyChange(currentPerformanceId, userId, {
              fieldName: f.field,
              oldValue: f.oldVal,
              newValue: f.newVal,
              changeAmount: f.newVal - f.oldVal,
              changeDate: today,
              changeTime: currentTime,
            });
          }
        }

        // Refresh change log
        const changes = getDailyChanges(currentPerformanceId);
        setMonthlyChangeLog(changes);
        calculateWeeklyDataFromChanges(changes);
        loadTodayStats(changes);
      } else if (currentPerformanceId && currentData.fcr !== undefined) {
        // First save this session: ensure FCR is logged at least once
        const today = new Date().toISOString().split("T")[0];
        const now = new Date();
        const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
        addDailyChange(currentPerformanceId, userId, {
          fieldName: "fcr",
          oldValue: 0,
          newValue: currentData.fcr,
          changeAmount: currentData.fcr,
          changeDate: today,
          changeTime: currentTime,
        });
      }

      // Save tickets
      // Clear existing tickets and re-save
      if (currentPerformanceId) {
        // Remove all existing tickets for this month and re-add
        const existingTickets = getTickets(currentPerformanceId);
        for (const t of existingTickets) {
          removeTicket(currentPerformanceId, t.id);
        }
        for (const ticket of currentData.tickets) {
          addTicket(currentPerformanceId, userId, {
            ticketId: ticket.ticketId,
            type: ticket.type,
            channel: ticket.channel,
            note: ticket.note || "",
          });
        }

        // Save Genesys tickets
        const existingGenesys = getGenesysTickets(currentPerformanceId);
        for (const t of existingGenesys) {
          removeGenesysTicket(currentPerformanceId, t.id);
        }
        for (const ticket of currentGenesysTickets) {
          addGenesysTicket(currentPerformanceId, userId, {
            ticketLink: ticket.ticketLink,
            ratingScore: ticket.ratingScore,
            customerPhone: ticket.customerPhone || "",
            ticketDate: ticket.ticketDate,
            ticketId: ticket.ticketId || "",
            channel: ticket.channel || "Phone",
            note: ticket.note || "",
          });
        }
      }

      // Snapshot after successful save
      setPreviousData({ ...currentData });
      previousDataRef.current = { ...currentData };
      toast.success("Data saved successfully!");
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Failed to save data");
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  };

  // Auto-save is ALWAYS enabled - save automatically after any data change
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    // Mark initialized once initial data load completes
    if (previousData) {
      setInitialized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousData]);

  // Auto-save after changes (debounced) - ALWAYS active
  useEffect(() => {
    if (!initialized) return;
    const timeout = setTimeout(() => {
      if (!savingRef.current) {
        saveToDatabase();
      }
    }, 800);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, data, genesysTickets]);

  const updateMetric = useCallback(
    (field: keyof Pick<MonthlyData, "good" | "bad" | "karmaBad">, increment: boolean) => {
      setData((prev) => {
        // Special case: the UI shows totalGood (good + genesysGood), so decrement should affect
        // regular good first, then genesys good if regular is already 0.
        if (field === "good" && !increment) {
          if (prev.good > 0) {
            return { ...prev, good: prev.good - 1 };
          }
          if (prev.genesysGood > 0) {
            return { ...prev, genesysGood: prev.genesysGood - 1 };
          }
          return prev;
        }

        const updatedValue = Math.max(0, prev[field] + (increment ? 1 : -1));
        let updatedTickets = prev.tickets;

        if (field === "bad") {
          if (increment) {
            const newTicket: Ticket = {
              id: crypto.randomUUID(),
              ticketId: "",
              type: "DSAT",
              channel: "Phone",
              note: "",
            };
            updatedTickets = [...prev.tickets, newTicket];
          } else {
            const idx = prev.tickets.findIndex((t) => t.type === "DSAT");
            if (idx !== -1) {
              updatedTickets = [...prev.tickets.slice(0, idx), ...prev.tickets.slice(idx + 1)];
            }
          }
        } else if (field === "karmaBad") {
          if (increment) {
            const newTicket: Ticket = {
              id: crypto.randomUUID(),
              ticketId: "",
              type: "Karma",
              channel: "Chat",
              note: "",
            };
            updatedTickets = [...prev.tickets, newTicket];
          } else {
            const idx = prev.tickets.findIndex((t) => t.type === "Karma");
            if (idx !== -1) {
              updatedTickets = [...prev.tickets.slice(0, idx), ...prev.tickets.slice(idx + 1)];
            }
          }
        }

        return {
          ...prev,
          [field]: updatedValue,
          tickets: updatedTickets,
        };
      });
    },
    []
  );

  const totalGood = useMemo(() => data.good + data.genesysGood, [data.good, data.genesysGood]);
  const totalBad = useMemo(() => data.bad + data.genesysBad, [data.bad, data.genesysBad]);

  // Smart rating handlers
  const openSmartDialog = useCallback((type: 'good' | 'bad') => {
    setSmartDialogType(type);
    setSmartDialogOpen(true);
  }, []);

  const handleSmartGoodRating = useCallback((
    channel: 'phone' | 'chat' | 'email',
    isGenesys: boolean,
    genesysData?: { ticketLink: string; ratingScore: number; customerPhone: string }
  ) => {
    if (isGenesys && genesysData) {
      const isGoodRating = genesysData.ratingScore >= 7 && genesysData.ratingScore <= 9;
      setGenesysTickets(prev => [...prev, {
        id: crypto.randomUUID(),
        ticketLink: genesysData.ticketLink,
        ratingScore: genesysData.ratingScore,
        customerPhone: genesysData.customerPhone,
        ticketDate: new Date().toISOString().split('T')[0],
        channel: "Phone",
        note: "",
        ticketId: "",
      }]);
      if (isGoodRating) {
        setData(prev => ({ ...prev, genesysGood: prev.genesysGood + 1 }));
        setTodayStats(prev => ({ ...prev, good: prev.good + 1 }));
        toast.success('Genesys good rating added! 📞');
      } else {
        setData(prev => ({ ...prev, genesysBad: prev.genesysBad + 1, bad: prev.bad + 1, tickets: [...prev.tickets, {
          id: crypto.randomUUID(),
          ticketId: "",
          type: "DSAT",
          channel: "Phone",
          note: "Auto from Genesys bad rating",
        }] }));
        setTodayStats(prev => ({ ...prev, bad: prev.bad + 1 }));
        toast.error('Genesys bad rating added');
      }
      setTimeout(() => {
        if (!isSaving) {
          saveToDatabase();
        }
      }, 0);
    } else {
      setData(prev => ({
        ...prev,
        good: prev.good + 1,
        goodByChannel: {
          ...prev.goodByChannel,
          [channel]: prev.goodByChannel[channel] + 1,
        },
      }));
      setTodayStats(prev => ({ ...prev, good: prev.good + 1 }));
      toast.success(`Good rating added to ${channel.charAt(0).toUpperCase() + channel.slice(1)}! ✨`);
      setTimeout(() => {
        if (!isSaving) {
          saveToDatabase();
        }
      }, 0);
    }
  }, [isSaving, saveToDatabase]);

  const handleSmartBadRating = useCallback((ticket: {
    ticketId: string;
    type: 'DSAT' | 'Karma';
    channel: 'Phone' | 'Chat' | 'Email';
    note: string;
  }) => {
    // Add ticket
    setData(prev => ({
      ...prev,
      tickets: [...prev.tickets, {
        id: crypto.randomUUID(),
        ticketId: ticket.ticketId,
        type: ticket.type,
        channel: ticket.channel,
        note: ticket.note,
      }],
      bad: ticket.type === 'DSAT' ? prev.bad + 1 : prev.bad,
      karmaBad: ticket.type === 'Karma' ? prev.karmaBad + 1 : prev.karmaBad,
    }));

    setTodayStats(prev => ({ ...prev, bad: prev.bad + 1 }));
    toast.error(`${ticket.type} ticket added - target affected ⚠️`);
    setTimeout(() => {
      if (!isSaving) {
        saveToDatabase();
      }
    }, 0);
  }, []);

  useEffect(() => {
    try {
      const overrides: Record<string, Partial<GenesysTicket>> = {};
      genesysTickets.forEach(t => {
        const key = t.id || `${t.ticketLink}-${t.ticketDate}`;
        overrides[key] = {
          ticketId: t.ticketId || "",
          channel: t.channel || "Phone",
          note: t.note || "",
        };
      });
      localStorage.setItem("ktb_genesys_ticket_overrides", JSON.stringify(overrides));
    } catch {}
  }, [genesysTickets]);

  useEffect(() => {
    // Support both custom events and localStorage flag for cross-route trigger
    const customHandler = (e: Event) => {
      const ce = e as CustomEvent;
      const val = ce.detail as 'good' | 'bad';
      if (val === 'good' || val === 'bad') {
        openSmartDialog(val);
      }
    };
    window.addEventListener("ktb_quick_rating", customHandler as EventListener);
    try {
      const key = localStorage.getItem("ktb_quick_rating");
      if (key === "good" || key === "bad") {
        openSmartDialog(key as 'good' | 'bad');
        localStorage.removeItem("ktb_quick_rating");
      }
    } catch {}
    const storageHandler = (e: StorageEvent) => {
      if (e.key === "ktb_quick_rating" && e.newValue) {
        const val = e.newValue;
        if (val === "good" || val === "bad") {
          openSmartDialog(val as 'good' | 'bad');
          try { localStorage.removeItem("ktb_quick_rating"); } catch {}
        }
      }
    };
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener("ktb_quick_rating", customHandler as EventListener);
      window.removeEventListener("storage", storageHandler);
    };
  }, [openSmartDialog]);

  // Calculate daily target impact
  const dailyTargetImpact = useMemo(() => {
    const today = new Date();
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const remainingDays = lastDay - today.getDate();
    const weekendDays = Math.ceil(remainingDays / 7) * 2;
    const workDays = Math.max(1, remainingDays - weekendDays);

    const totalKarma = totalGood + totalBad + data.karmaBad;
    const neededFor95 = Math.max(0, Math.ceil((0.95 * totalKarma - totalGood) / 0.05));
    const currentTarget = Math.ceil(neededFor95 / workDays);

    const newTotalKarma = totalKarma + 1;
    const newNeeded = Math.max(0, Math.ceil((0.95 * newTotalKarma - totalGood) / 0.05));
    const newTarget = Math.ceil(newNeeded / workDays);

    return {
      newTarget,
      compensation: newTarget - currentTarget,
    };
  }, [selectedMonth, selectedYear, totalGood, totalBad, data.karmaBad]);

  const totalSurveys = useMemo(() => totalGood + totalBad, [totalGood, totalBad]);
  const csat = useMemo(() => totalSurveys > 0 ? (totalGood / totalSurveys) * 100 : 0, [totalGood, totalSurveys]);

  const totalKarmaBase = useMemo(() => totalGood + totalBad + data.karmaBad, [totalGood, totalBad, data.karmaBad]);
  const karma = useMemo(() => totalKarmaBase > 0 ? (totalGood / totalKarmaBase) * 100 : 0, [totalGood, totalKarmaBase]);

  // Channel distribution for good ratings: derive from actual genesys tickets
  const goodByChannelWithGenesys = useMemo(() => {
    const counts = { phone: 0, chat: 0, email: 0 };
    genesysTickets.forEach(t => {
      const isGood = t.ratingScore >= 7 && t.ratingScore <= 9;
      if (isGood) {
        const ch = (t.channel || "Phone").toLowerCase() as "phone" | "chat" | "email";
        counts[ch]++;
      }
    });
    return counts;
  }, [genesysTickets]);

  // Channel distribution for bad ratings: get from DSAT tickets
  const badByChannel = useMemo(() => {
    const counts = { phone: 0, chat: 0, email: 0 };
    const dsatTickets = data.tickets.filter(t => t.type === "DSAT");

    if (dsatTickets.length === 0) {
      // If no DSAT tickets exist, attribute all to Phone (default workflow)
      counts.phone = totalBad;
    } else {
      // Use actual ticket distribution
      dsatTickets.forEach(t => {
        const ch = (t.channel || "Phone").toLowerCase() as keyof typeof counts;
        if (ch in counts) counts[ch]++;
      });
      // If tickets don't match totalBad, add remainder to Phone
      const ticketTotal = counts.phone + counts.chat + counts.email;
      if (ticketTotal < totalBad) {
        counts.phone += (totalBad - ticketTotal);
      }
    }
    return counts;
  }, [data.tickets, totalBad]);

  const karmaByChannel = useMemo(() => data.tickets.reduce(
    (acc, ticket) => {
      if (ticket.type === "Karma") {
        acc[ticket.channel.toLowerCase() as keyof typeof acc]++;
      }
      return acc;
    },
    { phone: 0, chat: 0, email: 0 }
  ), [data.tickets]);

  // KPI score state (from PhoneBonusKPI calculation)
  const [kpiScore, setKpiScore] = useState(0);

  // Listen for KPI score broadcasts
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<number>;
      if (typeof ce.detail === 'number') setKpiScore(ce.detail);
    };
    window.addEventListener("ktb_kpi_score", handler as EventListener);
    try {
      const stored = localStorage.getItem("ktb_kpi_score");
      if (stored) setKpiScore(parseFloat(stored));
    } catch {}
    return () => window.removeEventListener("ktb_kpi_score", handler as EventListener);
  }, []);

  useEffect(() => {
    try {
      const detail = { totalGood, totalBad, karmaBad: data.karmaBad, kpiScore };
      window.dispatchEvent(new CustomEvent("ktb_metrics_update", { detail }));
      localStorage.setItem("ktb_metrics_update", JSON.stringify(detail));
    } catch {}
  }, [totalGood, totalBad, data.karmaBad, kpiScore]);

  // Next event from BreakScheduler for daily summary
  const [nextEvent, setNextEvent] = useState<{ countdown: string; label: string }>({ countdown: "", label: "" });
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ countdown: string; label: string }>;
      if (ce.detail) setNextEvent(ce.detail);
    };
    window.addEventListener("ktb_next_event", handler as EventListener);
    try {
      const stored = localStorage.getItem("ktb_next_event");
      if (stored) setNextEvent(JSON.parse(stored));
    } catch {}
    return () => window.removeEventListener("ktb_next_event", handler as EventListener);
  }, []);

  // Daily target for summary card (75% level)
  const dailyTargetForSummary = useMemo(() => {
    const totalKB = totalGood + totalBad + data.karmaBad;
    const needed = Math.max(0, Math.ceil((0.75 * totalKB - totalGood) / (1 - 0.75)));
    const days = remainingWorkingDays ?? 1;
    return needed / Math.max(1, days);
  }, [totalGood, totalBad, data.karmaBad, remainingWorkingDays]);

  // Motivational alerts for daily target
  useEffect(() => {
    const result = checkDailyTargetAlerts(todayStats.good, dailyTargetForSummary);
    if (result) {
      setCelebrationType(result);
      setCelebrationTrigger(true);
    }
  }, [todayStats.good, dailyTargetForSummary, checkDailyTargetAlerts]);

  // KPI milestone celebrations
  useEffect(() => {
    if (kpiScore > 0 && prevKpiRef.current !== kpiScore) {
      const result = checkKPIAlerts(kpiScore, prevKpiRef.current);
      if (result) {
        setCelebrationType(result);
        setCelebrationTrigger(true);
      }
      prevKpiRef.current = kpiScore;
    }
  }, [kpiScore, checkKPIAlerts]);

  // Format floor average display for a metric
  const formatFloorAvg = (metric: FloorAvgDisplay | null, suffix: string = "%") => {
    if (!metric) return null;
    const sign = metric.diff >= 0 ? "+" : "";
    return `Your: ${metric.yourValue.toFixed(1)}${suffix} | Floor Avg: ${metric.floorAvg.toFixed(1)}${suffix} | Diff: ${sign}${metric.diff.toFixed(1)}${suffix}`;
  };

  const exportToCSV = () => {
    const monthName = new Date(selectedYear, selectedMonth).toLocaleString("en-US", { month: "long" });
    const csv = [
      ["Metric", "Value"],
      ["Month", `${monthName} ${selectedYear}`],
      ["Good Ratings", data.good],
      ["Genesys Good", data.genesysGood],
      ["Total Good (All)", totalGood],
      ["Bad Ratings (DSAT)", data.bad],
      ["Genesys Bad (DSAT)", data.genesysBad],
      ["Total Bad (All)", totalBad],
      ["Karma Bad", data.karmaBad],
      ["CSAT %", csat.toFixed(2)],
      ["Karma %", karma.toFixed(2)],
      [""],
      ["Channel", "Good", "DSAT", "Karma", "Success Rate %"],
      ["Phone", goodByChannelWithGenesys.phone, badByChannel.phone, karmaByChannel.phone,
        ((goodByChannelWithGenesys.phone / (goodByChannelWithGenesys.phone + badByChannel.phone || 1)) * 100).toFixed(1)],
      ["Chat", goodByChannelWithGenesys.chat, badByChannel.chat, karmaByChannel.chat,
        ((goodByChannelWithGenesys.chat / (goodByChannelWithGenesys.chat + badByChannel.chat || 1)) * 100).toFixed(1)],
      ["Email", goodByChannelWithGenesys.email, badByChannel.email, karmaByChannel.email,
        ((goodByChannelWithGenesys.email / (goodByChannelWithGenesys.email + badByChannel.email || 1)) * 100).toFixed(1)],
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `performance-${monthName}-${selectedYear}.csv`;
    a.click();
    toast.success("CSV exported successfully!");
  };

  return (
    <div className="relative">
      {/* Celebration Animation */}
      <CelebrationAnimation
        trigger={celebrationTrigger}
        type={celebrationType || "confetti"}
        onComplete={() => setCelebrationTrigger(false)}
      />
      {/* BreakScheduler always mounted for next-event broadcasting */}
      <div className={activeTab === "notes" ? "" : "hidden"}>
        <div className="space-y-4 mb-4">
          <h3 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">Break Time ⏱️</h3>
          <BreakScheduler performanceId={performanceId} />
        </div>
      </div>
      {/* Header: Month + Quick Actions */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <MonthSelector
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onMonthChange={setSelectedMonth}
          onYearChange={setSelectedYear}
        />
        {activeTab === "overview" && (
          <QuickActionsBar
            onExport={exportToCSV}
            onOpenNotes={() => {
              localStorage.setItem("ktb_active_tab", "notes");
              window.dispatchEvent(new CustomEvent("ktb_tab_change", { detail: "notes" }));
              setActiveTab("notes");
            }}
            focusMode={focusMode}
            onToggleFocus={() => setFocusMode(!focusMode)}
          />
        )}
        {activeTab !== "overview" && (
          <Button onClick={exportToCSV} variant="ghost" size="icon" className="h-8 w-8 shrink-0">
            <Download className="h-4 w-4" />
          </Button>
        )}
      </div>

          {activeTab === "overview" && (
          <div className="space-y-4 animate-fade-in focus-visible:outline-none">

            {/* Today's Shift & OT Focus */}
            <TodayShiftCard />

            {/* Daily Summary Card - Always visible */}
            <DailySummaryCard
              todayGood={todayStats.good}
              todayBad={todayStats.bad}
              dailyTarget={dailyTargetForSummary}
              shiftTimeLeft={nextEvent.countdown}
              shiftLabel={nextEvent.label}
            />

            {/* Hero: KPI & CSAT side by side */}
            <div className="grid grid-cols-2 gap-3">
              <PercentageDisplay
                title="KPI"
                percentage={kpiScore}
                subtitle="Phone Bonus 🎯"
                floorInfo={floorAverages ? formatFloorAvg({ yourValue: kpiScore, floorAvg: 75, diff: kpiScore - 75, status: kpiScore >= 75 ? "above" : "below" }) : undefined}
              />
              <PercentageDisplay
                title="CSAT"
                percentage={csat}
                subtitle={`${totalGood} / ${totalSurveys}`}
                floorInfo={floorAverages ? formatFloorAvg(floorAverages.csat) : undefined}
              />
            </div>

            {/* Streaks & Milestones */}
            <StreaksMilestones
              userId={userId}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              todayGood={todayStats.good}
              dailyTarget={dailyTargetForSummary}
            />

            {/* Daily KPI Target */}
            <DailyKPITarget
              userId={userId}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              csatPercentage={csat}
              totalGood={totalGood}
              totalSurveys={totalSurveys}
              remainingWorkDays={remainingWorkingDays}
              kpiScore={kpiScore}
            />

            {/* Manual Productivity Override */}
            <ManualProductivityCard
              userId={userId}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />

            {/* Smart Tips */}
            <SmartKPITips
              userId={userId}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              kpiScore={kpiScore}
              csatPercentage={csat}
              totalGood={totalGood}
              totalSurveys={totalSurveys}
              remainingWorkDays={remainingWorkingDays}
            />

            {/* Monitoring Section: Counters as compact row */}
            <div className="space-y-2">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                Monitoring
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <MetricCard
                  title="Good"
                  value={totalGood}
                  onIncrement={() => updateMetric("good", true)}
                  onDecrement={() => updateMetric("good", false)}
                  color="success"
                  icon={ThumbsUp}
                  showButtons={true}
                />
                <MetricCard
                  title="DSAT"
                  value={totalBad}
                  onIncrement={() => updateMetric("bad", true)}
                  onDecrement={() => updateMetric("bad", false)}
                  color="destructive"
                  icon={ThumbsDown}
                  showButtons={true}
                />
                <MetricCard
                  title="Karma"
                  value={data.karmaBad}
                  onIncrement={() => updateMetric("karmaBad", true)}
                  onDecrement={() => updateMetric("karmaBad", false)}
                  color="warning"
                  icon={AlertTriangle}
                  showButtons={true}
                />
              </div>
            </div>

            {/* Below here hidden in Focus Mode */}
            {!focusMode && (
              <>
                {/* Daily Target */}
                <DailyTarget
                  currentGood={totalGood}
                  totalNegatives={totalBad}
                  karmaBad={data.karmaBad}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  todayGood={todayStats.good}
                  todayBad={todayStats.bad}
                  remainingWorkingDays={remainingWorkingDays}
                />
              </>
            )}
          </div>
          )}

          {activeTab === "tickets" && (
          <div className="space-y-6 animate-fade-in focus-visible:outline-none">
             {/* Genesys & Tickets Section */}
            <div className="space-y-6">
              <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">🎫 Tickets Management</h2>

              {/* Genesys Tickets Form */}
              <GenesysTicketForm
                tickets={genesysTickets}
                onTicketsChange={setGenesysTickets}
                totalGood={totalGood}
              />

              {/* Tickets Table */}
              <TicketsTable
                tickets={data.tickets}
                onTicketsChange={(tickets) => setData((prev) => ({ ...prev, tickets }))}
              />
            </div>

             {/* Show Hold Tickets here too if needed, but keeping in Overview for priority */}
             <div className="mt-8">
               <h3 className="text-xl font-semibold mb-4">Hold Tickets Management</h3>
               <HoldTicketsSection
                  performanceId={performanceId}
                />
             </div>
          </div>
          )}

          {activeTab === "analytics" && (
          <div className="space-y-5 animate-fade-in focus-visible:outline-none">

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 gap-3">
              <PercentageDisplay
                title="CSAT"
                percentage={csat}
                subtitle={`${totalGood} / ${totalSurveys}`}
                floorInfo={floorAverages ? formatFloorAvg(floorAverages.csat) : undefined}
              />
              <PercentageDisplay
                title="Karma"
                percentage={karma}
                subtitle={`${totalGood} / ${totalKarmaBase}`}
              />
            </div>

            {/* Section: Performance Inputs */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Performance Inputs
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FCRMetric
                  value={data.fcr}
                  onChange={(value) => setData((prev) => ({ ...prev, fcr: value }))}
                  previousValue={previousMonthData?.fcr}
                />
                <PhoneBonusKPI
                  userId={userId}
                  selectedMonth={selectedMonth}
                  selectedYear={selectedYear}
                  csatPercentage={csat}
                  totalSurveys={totalSurveys}
                />
              </div>
            </div>

            {/* Section: Trends & Comparison */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                Trends & Comparison
              </h3>
              <MonthComparison
                currentMonth={{
                  good: data.good,
                  bad: data.bad,
                  genesysGood: data.genesysGood,
                  genesysBad: data.genesysBad,
                  karmaBad: data.karmaBad,
                  fcr: data.fcr,
                }}
                previousMonth={previousMonthData}
                currentMonthName={new Date(selectedYear, selectedMonth).toLocaleString("en-US", { month: "short" })}
                previousMonthName={new Date(selectedYear, selectedMonth - 1).toLocaleString("en-US", { month: "short" })}
              />
              <WeeklyProgress
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
                weeklyData={weeklyData}
                currentKarma={karma}
              />
            </div>

            {/* Section: Forecasts & Insights */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                Forecasts & Insights
              </h3>
              <MonthEndForecast
                currentGood={totalGood}
                currentBad={totalBad}
                karmaBad={data.karmaBad}
                remainingWorkDays={remainingWorkingDays}
                previousMonthData={previousMonthData}
                dailyChanges={monthlyChangeLog}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
              />
              <BestProductiveTime changes={monthlyChangeLog} />
            </div>

            {/* Section: Channel Breakdown */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-destructive" />
                Channel Breakdown
              </h3>
              <ChannelAnalytics
                goodRatings={goodByChannelWithGenesys}
                badRatings={badByChannel}
                karmaRatings={karmaByChannel}
              />
            </div>

            {/* Section: Multi-Month */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                Multi-Month Performance
              </h3>
              <ThreeMonthPerformance
                metrics={threeMonthsMetrics}
                availableMonths={availableMonthsForComparison}
                selectedMonths={selectedThreeMonths}
                onMonthsChange={setSelectedThreeMonths}
              />
            </div>
          </div>
          )}

          {activeTab === "notes" && (
          <div className="space-y-6 animate-fade-in focus-visible:outline-none">
              <DailyNotesSection performanceId={performanceId} />

              {/* Daily Change Log */}
              <div className="space-y-6">
                <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">📋 Site Log History</h2>
                <DailyChangeLog performanceId={performanceId} />
              </div>
          </div>
          )}

      {/* Smart Rating Dialog */}
      <SmartRatingDialog
        isOpen={smartDialogOpen}
        onClose={() => setSmartDialogOpen(false)}
        ratingType={smartDialogType}
        onAddGoodRating={handleSmartGoodRating}
        onAddBadRating={handleSmartBadRating}
        dailyTargetImpact={dailyTargetImpact}
      />
    </div>
  );
};

export default Index;