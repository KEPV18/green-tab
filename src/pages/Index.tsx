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
import CallsSurveyHub from "@/components/CallsSurveyHub";
import { PhoneBonusKPI } from "@/components/PhoneBonusKPI";
import { SmartKPITips } from "@/components/SmartKPITips";
import { StreaksMilestones } from "@/components/StreaksMilestones";
import { DailyKPITarget } from "@/components/DailyKPITarget";
import { ManualProductivityCard } from "@/components/ManualProductivityCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ThreeMonthPerformance, MonthMetrics } from "@/components/ThreeMonthPerformance";
import { PerformanceData } from "@/lib/types";
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

interface LeaderboardData {
  csat_count: number;
  dsat_count: number;
  csat_percentage: number;
  rank_in_team: number;
  team_size: number;
}

const Index = () => {
  const { user } = useAuth();
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
  
  // Team leaderboard data for current user
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  
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
  const [monthlyChangeLog, setMonthlyChangeLog] = useState<any[]>([]);
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

  // Load shift time from user_settings
  useEffect(() => {
    const loadShiftTime = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('shift_start_time')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (!error && data?.shift_start_time) {
          setShiftStartTime(data.shift_start_time);
        }
      } catch (error) {
        console.error('Error loading shift time:', error);
      }
    };
    loadShiftTime();
  }, [user]);

  // Load team leaderboard data for current user (by email)
  useEffect(() => {
    const loadLeaderboardData = async () => {
      if (!user?.email) return;
      try {
        const { data, error } = await supabase
          .from('team_leaderboard')
          .select('csat_count, dsat_count, csat_percentage, rank_in_team, team_size')
          .eq('agent_email', user.email)
          .eq('year', selectedYear)
          .eq('month', selectedMonth + 1)
          .maybeSingle();
        
        if (!error && data) {
          setLeaderboardData(data as LeaderboardData);
        } else {
          setLeaderboardData(null);
        }
      } catch (err) {
        console.error('Error loading leaderboard data:', err);
        setLeaderboardData(null);
      }
    };
    loadLeaderboardData();
  }, [user?.email, selectedYear, selectedMonth]);

  // Load data from database when month/year changes or user changes
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

  const loadMonthData = async () => {
    if (!user) return;
    
    try {
      const { data: perfDataRaw, error } = await supabase
        .from('performance_data')
        .select('*, tickets(*)')
        .eq('year', selectedYear)
        .eq('month', selectedMonth)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      
      const perfData = perfDataRaw as unknown as PerformanceData;

      if (perfData) {
        setPerformanceId(perfData.id);
        
        // Use DB off days or fallback to static schedule
        let loadedOffDays = perfData.off_days || null;
        if (!loadedOffDays || loadedOffDays.length === 0) {
          loadedOffDays = STATIC_SCHEDULE
            .filter(s => {
              const [y, m] = s.date.split('-').map(Number);
              return y === selectedYear && (m - 1) === selectedMonth && s.is_off_day;
            })
            .map(s => parseInt(s.date.split('-')[2], 10));
        }
        setOffDays(loadedOffDays);

        const loadedData = {
          good: perfData.good || 0,
          bad: perfData.bad || 0,
          karmaBad: perfData.karma_bad || 0,
          genesysGood: perfData.genesys_good || 0,
          genesysBad: perfData.genesys_bad || 0,
          fcr: perfData.fcr || 0,
          goodByChannel: {
            phone: perfData.good_phone || 0,
            chat: perfData.good_chat || 0,
            email: perfData.good_email || 0,
          },
          badByChannel: {
            phone: perfData.bad_phone || 0,
            chat: perfData.bad_chat || 0,
            email: perfData.bad_email || 0,
          },
          tickets: (perfData.tickets || []).map((t: any) => ({
            id: t.id,
            ticketId: t.ticket_id,
            type: t.type,
            channel: t.channel,
            note: t.note || "",
          })),
        };

        // Auto-generate missing DSAT/Karma ticket records
        const existingBadTickets = loadedData.tickets.length;
        const totalBadExpected = (perfData.bad || 0) + (perfData.karma_bad || 0);
        if (totalBadExpected > existingBadTickets && perfData.id) {
          const newTickets: Array<{ performance_id: string; user_id: string; ticket_id: string; type: string; channel: string; note: string }> = [];
          // Distribute: first fill DSAT, then Karma
          const existingDsat = loadedData.tickets.filter(t => t.type === 'DSAT').length;
          const existingKarma = loadedData.tickets.filter(t => t.type === 'Karma').length;
          const missingDsat = Math.max(0, (perfData.bad || 0) - existingDsat);
          const missingKarma = Math.max(0, (perfData.karma_bad || 0) - existingKarma);
          
          for (let i = 0; i < missingDsat; i++) {
            newTickets.push({
              performance_id: perfData.id,
              user_id: user.id,
              ticket_id: `DSAT-${existingDsat + i + 1}`,
              type: 'DSAT',
              channel: 'Phone',
              note: '',
            });
          }
          for (let i = 0; i < missingKarma; i++) {
            newTickets.push({
              performance_id: perfData.id,
              user_id: user.id,
              ticket_id: `KARMA-${existingKarma + i + 1}`,
              type: 'Karma',
              channel: 'Phone',
              note: '',
            });
          }
          
          if (newTickets.length > 0) {
            const { data: insertedTickets } = await supabase
              .from('tickets')
              .insert(newTickets)
              .select();
            
            if (insertedTickets) {
              const mapped = insertedTickets.map((t: any) => ({
                id: t.id,
                ticketId: t.ticket_id,
                type: t.type as "DSAT" | "Karma",
                channel: t.channel as "Phone" | "Chat" | "Email",
                note: t.note || "",
              }));
              loadedData.tickets = [...loadedData.tickets, ...mapped];
            }
          }
        }

        setData(loadedData);
        setPreviousData(loadedData);
        
        // Calculate weekly data from daily changes
        await calculateWeeklyDataFromChanges(perfData.id);
        
        // Load today's stats from daily changes
        await loadTodayStats(perfData.id);
        await loadMonthlyChangeLog(perfData.id);
        
        // Load Genesys tickets
        const { data: genesysTicketsFromDB, error: genesysError } = await supabase
          .from('genesys_tickets')
          .select('*')
          .eq('performance_id', perfData.id);
        
        if (!genesysError && genesysTicketsFromDB) {
          const loaded = genesysTicketsFromDB.map((t: any) => ({
            id: t.id,
            ticketLink: t.ticket_link,
            ratingScore: t.rating_score,
            customerPhone: t.customer_phone || "",
            ticketDate: t.ticket_date,
            ticketId: t.ticket_id || "",
            channel: (t.channel as "Phone" | "Chat" | "Email") || "Phone",
            note: t.note || "",
          }));
          
          // Auto-generate missing good ticket records for regular good ratings
          // Merge 'good' counter into genesys tickets to avoid double-counting
          const existingGoodGenesys = loaded.filter(t => t.ratingScore >= 7 && t.ratingScore <= 9).length;
          const regularGood = perfData.good || 0;
          
          if (regularGood > 0 && perfData.id) {
            // Move regular good into genesys tickets
            const newGenesysTickets = [];
            const today = new Date().toISOString().split('T')[0];
            
            for (let i = 0; i < regularGood; i++) {
              newGenesysTickets.push({
                performance_id: perfData.id,
                user_id: user.id,
                ticket_link: '',
                rating_score: 8,
                customer_phone: '',
                ticket_date: today,
              });
            }
            
            const { data: insertedGenesys } = await supabase
              .from('genesys_tickets')
              .insert(newGenesysTickets)
              .select();
            
            if (insertedGenesys) {
              const mapped = insertedGenesys.map((t: any) => ({
                id: t.id,
                ticketLink: t.ticket_link,
                ratingScore: t.rating_score,
                customerPhone: t.customer_phone || "",
                ticketDate: t.ticket_date,
                ticketId: "",
                channel: "Phone" as "Phone" | "Chat" | "Email",
                note: "",
              }));
              loaded.push(...mapped);
              
              // Reset 'good' to 0 and move to genesys_good to prevent double-counting
              await supabase
                .from('performance_data')
                .update({ good: 0, genesys_good: existingGoodGenesys + regularGood })
                .eq('id', perfData.id);
              
              // Update local state
              loadedData.good = 0;
              loadedData.genesysGood = existingGoodGenesys + regularGood;
              setData(prev => ({ ...prev, good: 0, genesysGood: existingGoodGenesys + regularGood }));
            }
          }

          // Set loaded tickets
          setGenesysTickets(loaded);

          // Recalculate good/bad by channel from the tickets themselves
          let genesysGood = 0;
          let genesysBad = 0;
          const goodByChannel = { phone: 0, chat: 0, email: 0 };
          const badByChannel = { phone: 0, chat: 0, email: 0 };

          for (const t of loaded) {
            const isGood = t.ratingScore >= 7 && t.ratingScore <= 9;
            const channel = t.channel?.toLowerCase() || 'phone';
            if (isGood) {
              genesysGood++;
              if (channel === 'phone') goodByChannel.phone++;
              else if (channel === 'chat') goodByChannel.chat++;
              else if (channel === 'email') goodByChannel.email++;
            } else {
              genesysBad++;
              if (channel === 'phone') badByChannel.phone++;
              else if (channel === 'chat') badByChannel.chat++;
              else if (channel === 'email') badByChannel.email++;
            }
          }

          // Update UI state
          setData(prev => ({
            ...prev,
            genesysGood,
            genesysBad,
            goodByChannel,
            badByChannel,
          }));

          // IMPORTANT: keep performance_data in sync with Genesys ticket truth (fixes wrong totals like 128)
          const dbGenesysGood = Number(perfData.genesys_good || 0);
          const dbGenesysBad = Number(perfData.genesys_bad || 0);
          if (dbGenesysGood !== genesysGood || dbGenesysBad !== genesysBad) {
            try {
              await supabase
                .from('performance_data')
                .update({ genesys_good: genesysGood, genesys_bad: genesysBad })
                .eq('id', perfData.id);
            } catch {
              // ignore sync errors; UI is already correct
            }
          }
        }

      } else {
        // No data for this month, reset to empty
        setPerformanceId(null);
        setOffDays(null);
        const emptyData = {
          good: 0,
          bad: 0,
          karmaBad: 0,
          genesysGood: 0,
          genesysBad: 0,
          fcr: 0,
          tickets: [],
          goodByChannel: { phone: 0, chat: 0, email: 0 },
          badByChannel: { phone: 0, chat: 0, email: 0 },
        };
        setData(emptyData);
        setPreviousData(emptyData);
        setWeeklyData([]);
        setGenesysTickets([]);
        setTodayStats({ good: 0, bad: 0 });
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    }
  };

  const loadSelectedMonthsData = async () => {
    if (!user) return;
    try {
      // Fetch all selected months
      const monthsToFetch = selectedThreeMonths;
      const failedMonths: string[] = [];
      const settled = await Promise.allSettled(
        monthsToFetch.map(async (sel) => {
          try {
            const { data: perfData, error: perfErr } = await supabase
              .from('performance_data')
              .select('*')
              .eq('year', sel.year)
              .eq('month', sel.month)
              .eq('user_id', user.id)
              .maybeSingle();
            if (perfErr) throw perfErr;
            let perfSel = perfData as any;

            // If nothing found try 1-based month (some rows might store months as 1-12)
            if (!perfSel) {
              const altMonth = sel.month + 1;
              const { data: perfDataAlt, error: perfAltErr } = await supabase
                .from('performance_data')
                .select('*')
                .eq('year', sel.year)
                .eq('month', altMonth)
                .eq('user_id', user.id)
                .maybeSingle();
              if (perfAltErr) throw perfAltErr;
              if (perfDataAlt) {
                perfSel = perfDataAlt as any;
              }
            }

            if (!perfSel) {
              failedMonths.push(`${sel.month}/${sel.year}`);
              // return zeroed object but keep month/year so the UI shows the month
              return {
                month: sel.month,
                year: sel.year,
                csat: 0,
                karma: 0,
                fcr: 0,
                totalGood: 0,
                totalSurveys: 0,
                totalKarmaBase: 0,
                phoneGood: 0,
                phoneBad: 0,
                phoneKarma: 0,
                chatGood: 0,
                chatBad: 0,
                emailGood: 0,
                emailBad: 0,
              };
            }

            const good = Number(perfSel.good || 0);
            const bad = Number(perfSel.bad || 0);
            const karmaBad = Number(perfSel.karma_bad || 0);
            const genesysGood = Number(perfSel.genesys_good || 0);
            const genesysBad = Number(perfSel.genesys_bad || 0);
            const fcrVal = typeof perfSel?.fcr === 'number' ? perfSel.fcr : Number(perfSel?.fcr || 0);

            const totalGoodSel = good + genesysGood;
            const totalBadSel = bad + genesysBad;

            // GOOD channel distribution: use performance_data (good_phone/chat/email) + remainder to Phone
            const basePhoneGood = Number(perfSel.good_phone || 0);
            const baseChatGood = Number(perfSel.good_chat || 0);
            const baseEmailGood = Number(perfSel.good_email || 0);
            const baseGoodSum = basePhoneGood + baseChatGood + baseEmailGood;
            const phoneGoodSel = basePhoneGood + Math.max(0, totalGoodSel - baseGoodSum);
            const chatGoodSel = baseChatGood;
            const emailGoodSel = baseEmailGood;

            // BAD channel distribution: use actual DSAT tickets by channel + remainder to Phone
            const dsatCounts = { phone: 0, chat: 0, email: 0 };
            if (perfSel.id) {
              const { data: dsatTickets, error: dsatErr } = await supabase
                .from('tickets')
                .select('channel')
                .eq('performance_id', perfSel.id)
                .eq('user_id', user.id)
                .eq('type', 'DSAT');
              if (dsatErr) throw dsatErr;
              (dsatTickets || []).forEach((t: any) => {
                const ch = String(t.channel || 'Phone').toLowerCase();
                if (ch === 'phone') dsatCounts.phone += 1;
                else if (ch === 'chat') dsatCounts.chat += 1;
                else if (ch === 'email') dsatCounts.email += 1;
                else dsatCounts.phone += 1;
              });
            }
            const dsatSum = dsatCounts.phone + dsatCounts.chat + dsatCounts.email;
            const phoneBadSel = dsatCounts.phone + Math.max(0, totalBadSel - dsatSum);
            const chatBadSel = dsatCounts.chat;
            const emailBadSel = dsatCounts.email;

            const phoneKarmaSel = karmaBad;

            // CSAT total should be based on surveys only (good + bad). Karma is its own metric.
            const totalSurveysSel = totalGoodSel + totalBadSel;
            const totalKarmaBaseSel = totalGoodSel + totalBadSel + karmaBad;

            const csatSel = totalSurveysSel > 0 ? (totalGoodSel / totalSurveysSel) * 100 : 0;
            const karmaSel = totalKarmaBaseSel > 0 ? (totalGoodSel / totalKarmaBaseSel) * 100 : 0;

            return {
              month: sel.month,
              year: sel.year,
              csat: csatSel,
              karma: karmaSel,
              fcr: fcrVal,
              totalGood: totalGoodSel,
              totalSurveys: totalSurveysSel,
              totalKarmaBase: totalKarmaBaseSel,
              phoneGood: phoneGoodSel,
              phoneBad: phoneBadSel,
              phoneKarma: phoneKarmaSel,
              chatGood: chatGoodSel,
              chatBad: chatBadSel,
              emailGood: emailGoodSel,
              emailBad: emailBadSel,
            };
          } catch (err) {
            console.warn('Error fetching month', sel, err);
            failedMonths.push(`${sel.month}/${sel.year}`);
            return {
              month: sel.month,
              year: sel.year,
              csat: 0,
              karma: 0,
              fcr: 0,
              totalGood: 0,
              totalSurveys: 0,
              totalKarmaBase: 0,
              phoneGood: 0,
              phoneBad: 0,
              phoneKarma: 0,
              chatGood: 0,
              chatBad: 0,
              emailGood: 0,
              emailBad: 0,
            };
          }
        })
      );

      // Extract values while preserving order
      const results: any[] = settled.map((s, i) => {
        if (s.status === 'fulfilled') return s.value;
        // Shouldn't happen because we return from catch, but handle for safety
        return {
          month: monthsToFetch[i].month,
          year: monthsToFetch[i].year,
          csat: 0,
          karma: 0,
          fcr: 0,
          totalGood: 0,
          totalSurveys: 0,
          totalKarmaBase: 0,
          phoneGood: 0,
          phoneBad: 0,
          phoneKarma: 0,
          chatGood: 0,
          chatBad: 0,
          emailGood: 0,
          emailBad: 0,
        };
      });

      setThreeMonthsMetrics(results);
    } catch (e) {
      console.error('Error loading selected months:', e);
      setThreeMonthsMetrics([]);
    }
  };

  const loadMonthlyChangeLog = async (perfId: string) => {
    try {
      const { data: changes, error } = await supabase
        .from('daily_changes')
        .select('*')
        .eq('performance_id', perfId)
        .order('created_at');
      if (error) throw error;
      setMonthlyChangeLog(changes || []);
    } catch (e) {
      setMonthlyChangeLog([]);
    }
  };

  const restoreFromDailyChanges = async () => {
    if (!user || !performanceId) return;
    try {
      const { data: changes, error } = await supabase
        .from('daily_changes')
        .select('*')
        .eq('performance_id', performanceId);
      if (error) return;
      const totals = changes.reduce(
        (acc: { good: number; bad: number; karmaBad: number; genesysGood: number; genesysBad: number }, c: any) => {
          const amt = Number(c.change_amount) || 0;
          if (c.field_name === 'good') acc.good += amt;
          else if (c.field_name === 'bad') acc.bad += amt;
          else if (c.field_name === 'karma_bad') acc.karmaBad += amt;
          else if (c.field_name === 'genesys_good') acc.genesysGood += amt;
          else if (c.field_name === 'genesys_bad') acc.genesysBad += amt;
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
      const up = {
        id: performanceId,
        year: selectedYear,
        month: selectedMonth,
        good: totals.good,
        bad: totals.bad,
        karma_bad: totals.karmaBad,
        genesys_good: totals.genesysGood,
        genesys_bad: totals.genesysBad,
        fcr: data.fcr,
        good_phone: data.goodByChannel.phone,
        good_chat: data.goodByChannel.chat,
        good_email: data.goodByChannel.email,
        user_id: user.id,
      } as any;
      await supabase.from('performance_data').upsert(up, { onConflict: 'year,month,user_id' });
      
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

  const loadTodayStats = async (perfId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data: changes, error } = await supabase
        .from('daily_changes')
        .select('*')
        .eq('performance_id', perfId)
        .eq('change_date', today);

      if (error) throw error;
      
      let todayGood = 0;
      let todayBad = 0;
      
      if (changes) {
        changes.forEach((change: any) => {
          if (change.field_name === 'good' || change.field_name === 'genesys_good') {
            todayGood += change.change_amount;
          } else if (change.field_name === 'bad' || change.field_name === 'genesys_bad' || change.field_name === 'karma_bad') {
            todayBad += change.change_amount;
          }
        });
      }
      
      setTodayStats({ good: Math.max(0, todayGood), bad: Math.max(0, todayBad) });
    } catch (error) {
      console.error('Error loading today stats:', error);
    }
  };

  const loadPreviousMonthData = async () => {
    if (!user) return;
    
    try {
      let prevMonth = selectedMonth - 1;
      let prevYear = selectedYear;
      
      if (prevMonth < 0) {
        prevMonth = 11;
        prevYear -= 1;
      }
      
      const { data: perfData, error } = await supabase
        .from('performance_data')
        .select('*')
        .eq('year', prevYear)
        .eq('month', prevMonth)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (perfData) {
        setPreviousMonthData({
          good: perfData.good || 0,
          bad: perfData.bad || 0,
          karmaBad: perfData.karma_bad || 0,
          genesysGood: perfData.genesys_good || 0,
          genesysBad: perfData.genesys_bad || 0,
          fcr: typeof (perfData as any).fcr === 'number' ? (perfData as any).fcr : 0,
          goodByChannel: {
            phone: (perfData as any).good_phone || 0,
            chat: (perfData as any).good_chat || 0,
            email: (perfData as any).good_email || 0,
          },
          tickets: [],
        });
      } else {
        setPreviousMonthData(null);
      }
    } catch (error) {
      console.error('Error loading previous month data:', error);
    }
  };

  const calculateWeeklyDataFromChanges = async (performanceId: string) => {
    try {
      // Get all daily changes for this performance period
      const { data: changes, error } = await supabase
        .from('daily_changes')
        .select('*')
        .eq('performance_id', performanceId)
        .order('change_date');

      if (error) throw error;
      if (!changes || changes.length === 0) {
        setWeeklyData([]);
        return;
      }

      // Group changes by week
      const weeklyStats: Record<number, { csat: number; dsat: number }> = {
        1: { csat: 0, dsat: 0 },
        2: { csat: 0, dsat: 0 },
        3: { csat: 0, dsat: 0 },
        4: { csat: 0, dsat: 0 },
      };

      changes.forEach((change: any) => {
        const date = new Date(change.change_date);
        const dayOfMonth = date.getDate();
        
        // Calculate week number based on day ranges
        let weekNumber;
        if (dayOfMonth <= 7) weekNumber = 1;
        else if (dayOfMonth <= 14) weekNumber = 2;
        else if (dayOfMonth <= 21) weekNumber = 3;
        else weekNumber = 4;
        
        if (change.field_name === 'good' || change.field_name === 'genesys_good') {
          weeklyStats[weekNumber].csat += change.change_amount;
        } else if (change.field_name === 'bad' || change.field_name === 'genesys_bad') {
          weeklyStats[weekNumber].dsat += change.change_amount;
        }
      });

      const calculatedWeeklyData = Object.entries(weeklyStats).map(([week, stats]) => ({
        week: parseInt(week),
        csat: stats.csat,
        dsat: stats.dsat,
      }));

      setWeeklyData(calculatedWeeklyData);
    } catch (error) {
      console.error('Error calculating weekly data:', error);
      setWeeklyData([]);
    }
  };

  const saveToDatabase = async () => {
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
    const currentPerformanceId = performanceIdRef.current;

    try {
      if (!user) return;

      // Ensure we have a performance record
      const { data: perfRow, error: perfErr } = await supabase
        .from("performance_data")
        .upsert(
          {
            id: currentPerformanceId ?? undefined,
            year: selectedYear,
            month: selectedMonth,
            good: currentData.good,
            bad: currentData.bad,
            karma_bad: currentData.karmaBad,
            genesys_good: currentData.genesysGood,
            genesys_bad: currentData.genesysBad,
            fcr: currentData.fcr,
            good_phone: currentData.goodByChannel.phone,
            good_chat: currentData.goodByChannel.chat,
            good_email: currentData.goodByChannel.email,
            user_id: user.id,
          } as any,
          { onConflict: "year,month,user_id" }
        )
        .select()
        .single();

      if (perfErr || !perfRow) throw perfErr;

      const savedPerformanceId = perfRow.id as string;
      setPerformanceId(savedPerformanceId);
      performanceIdRef.current = savedPerformanceId;

      // Log incremental daily changes based on the last in-app snapshot (NOT DB totals)
      const baseline = currentPreviousData;
      if (baseline) {
        const fieldsToTrack = [
          { field: "good", newVal: currentData.good, oldVal: baseline.good },
          { field: "bad", newVal: currentData.bad, oldVal: baseline.bad },
          { field: "karma_bad", newVal: currentData.karmaBad, oldVal: baseline.karmaBad },
          { field: "genesys_good", newVal: currentData.genesysGood, oldVal: baseline.genesysGood },
          { field: "genesys_bad", newVal: currentData.genesysBad, oldVal: baseline.genesysBad },
          { field: "fcr", newVal: currentData.fcr, oldVal: baseline.fcr },
        ];

        const changesForInsert = fieldsToTrack
          .filter((f) => f.newVal !== f.oldVal)
          .map((f) => ({
            field_name: f.field,
            old_value: f.oldVal,
            new_value: f.newVal,
            change_amount: f.newVal - f.oldVal,
          }));

        if (changesForInsert.length > 0) {
          const today = new Date().toISOString().split("T")[0];
          const now = new Date();
          const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
            .getMinutes()
            .toString()
            .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

          const changesToInsert = changesForInsert.map((change) => ({
            performance_id: savedPerformanceId,
            change_date: today,
            change_time: currentTime,
            user_id: user.id,
            ...change,
          }));

          const { error: changesError } = await supabase.from("daily_changes").insert(changesToInsert);
          if (changesError) console.error("Error saving daily changes:", changesError);
        }
      } else {
        // First save this session: ensure FCR is logged at least once
        if (currentData.fcr !== undefined) {
          const today = new Date().toISOString().split("T")[0];
          const now = new Date();
          const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
            .getMinutes()
            .toString()
            .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
          const { error: changesError } = await supabase.from("daily_changes").insert([
            {
              performance_id: savedPerformanceId,
              change_date: today,
              change_time: currentTime,
              user_id: user.id,
              field_name: "fcr",
              old_value: null,
              new_value: currentData.fcr,
              change_amount: null,
            },
          ]);
          if (changesError) console.error("Error saving initial FCR change:", changesError);
        }
      }

      // Replace tickets for this month
      const { error: deleteError } = await supabase
        .from("tickets")
        .delete()
        .eq("performance_id", savedPerformanceId);
      if (deleteError) throw deleteError;

      if (currentData.tickets.length > 0) {
        const ticketsToInsert = currentData.tickets.map((ticket) => ({
          performance_id: savedPerformanceId,
          ticket_id: ticket.ticketId,
          type: ticket.type,
          channel: ticket.channel,
          note: ticket.note,
          user_id: user.id,
        }));

        const { error: ticketsError } = await supabase.from("tickets").insert(ticketsToInsert);
        if (ticketsError) throw ticketsError;
      }

      // Replace Genesys tickets for this month
      await supabase.from("genesys_tickets").delete().eq("performance_id", savedPerformanceId);

      if (currentGenesysTickets.length > 0) {
        const genesysTicketsToInsert = currentGenesysTickets.map((ticket) => ({
          performance_id: savedPerformanceId,
          ticket_link: ticket.ticketLink,
          rating_score: ticket.ratingScore,
          customer_phone: ticket.customerPhone,
          ticket_date: ticket.ticketDate,
          channel: ticket.channel || "Phone",
          ticket_id: ticket.ticketId || "",
          note: ticket.note || "",
          user_id: user.id,
        }));

        const { error: genesysError } = await supabase.from("genesys_tickets").insert(genesysTicketsToInsert);
        if (genesysError) throw genesysError;
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

  const totalSurveys = useMemo(() => leaderboardData ? leaderboardData.csat_count + leaderboardData.dsat_count : totalGood + totalBad, [leaderboardData, totalGood, totalBad]);
  const csat = useMemo(() => leaderboardData ? leaderboardData.csat_percentage : (totalSurveys > 0 ? (totalGood / totalSurveys) * 100 : 0), [leaderboardData, totalGood, totalSurveys]);
  
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

  // Daily target for summary card (88% level)
  const dailyTargetForSummary = useMemo(() => {
    const totalKB = totalGood + totalBad + data.karmaBad;
    const needed = Math.max(0, Math.ceil((0.88 * totalKB - totalGood) / (1 - 0.88)));
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
              />
              <PercentageDisplay
                title="CSAT"
                percentage={csat}
                subtitle={leaderboardData 
                  ? `${leaderboardData.csat_count} / ${leaderboardData.csat_count + leaderboardData.dsat_count}`
                  : `${totalGood} / ${totalSurveys}`
                }
              />
            </div>

            {/* Streaks & Milestones */}
            <StreaksMilestones
              userId={user.id}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              todayGood={todayStats.good}
              dailyTarget={dailyTargetForSummary}
            />

            {/* Daily KPI Target */}
            <DailyKPITarget
              userId={user.id}
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
              userId={user.id}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
            />

            {/* Smart Tips */}
            <SmartKPITips
              userId={user.id}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              kpiScore={kpiScore}
              csatPercentage={csat}
              totalGood={totalGood}
              totalSurveys={totalSurveys}
              remainingWorkDays={remainingWorkingDays}
            />

            {/* Calls & Surveys Hub - Merged Productivity KPI + Survey Conversion */}
            <CallsSurveyHub
              userId={user.id}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
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
                  value={leaderboardData ? leaderboardData.csat_count : totalGood}
                  onIncrement={() => updateMetric("good", true)}
                  onDecrement={() => updateMetric("good", false)}
                  color="success"
                  icon={ThumbsUp}
                  showButtons={true}
                />
                <MetricCard
                  title="DSAT"
                  value={leaderboardData ? leaderboardData.dsat_count : totalBad}
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
                  userId={user.id}
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
