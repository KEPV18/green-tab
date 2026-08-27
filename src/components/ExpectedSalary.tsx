import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Wallet, Bus, Wifi, Award, Languages, Gift, CalendarOff, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { getLoyaltyBonusForMonth, getNextLoyaltyBonus } from "@/lib/loyalty";
import { fetchMonthlyPayrollData } from "@/lib/kpi";
import { getUserSettings, updateUserSettings } from "@/lib/store";
import { Button } from "@/components/ui/button";

interface ExpectedSalaryProps {
  userId: string;
  selectedMonth: number;
  selectedYear: number;
}

export const ExpectedSalary = ({ userId, selectedMonth: propMonth, selectedYear: propYear }: ExpectedSalaryProps) => {
  const [selectedMonth, setSelectedMonth] = useState(propMonth);
  const [selectedYear, setSelectedYear] = useState(propYear);
  useEffect(() => { setSelectedMonth(propMonth); setSelectedYear(propYear); }, [propMonth, propYear]);

  const goPrev = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(y => y - 1); }
    else setSelectedMonth(m => m - 1);
  };
  const goNext = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(y => y + 1); }
    else setSelectedMonth(m => m + 1);
  };
  const viewLabel = new Date(selectedYear, selectedMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const [settings, setSettings] = useState<{
    baseSalary: number | null;
    taxRate: number | null;
    kpiPercentage: number;
    transportAllowance: number;
    transportApplied: boolean;
    internetAllowance: number;
    seniorBonus: number;
    languageAllowance: number;
    salaryPaymentDay: number;
    salaryDelayMonths: number;
    kpiDelayMonths: number;
    employeeType: string | null;
    startMonth: string | null;
  }>({
    baseSalary: null,
    taxRate: null,
    kpiPercentage: 70,
    transportAllowance: 0,
    transportApplied: true,
    internetAllowance: 0,
    seniorBonus: 0,
    languageAllowance: 0,
    salaryPaymentDay: 27,
    salaryDelayMonths: 1,
    kpiDelayMonths: 2,
    employeeType: null,
    startMonth: null,
  });
  const [loading, setLoading] = useState(true);
  const [kpiScore, setKpiScore] = useState(0);
  const [workDays, setWorkDays] = useState(0);
  const [siteDays, setSiteDays] = useState(0);
  const [casualCount, setCasualCount] = useState(0);
  const [noShowCount, setNoShowCount] = useState(0);
  const [otData, setOtData] = useState({ day: 0, night: 0, special: 0 });

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    try {
      const storedSettings = getUserSettings(userId) as any;
      if (storedSettings) {
        setSettings({
          baseSalary: storedSettings.baseSalary ?? null,
          taxRate: storedSettings.taxRate ?? null,
          kpiPercentage: storedSettings.kpiPercentage ?? 70,
          transportAllowance: storedSettings.transportAllowance ?? storedSettings.transportation_allowance ?? 0,
          transportApplied: storedSettings.transportApplied ?? storedSettings.transport_applied ?? true,
          internetAllowance: storedSettings.internetAllowance ?? storedSettings.internet_allowance ?? 0,
          seniorBonus: storedSettings.seniorBonus ?? storedSettings.senior_bonus ?? 0,
          languageAllowance: storedSettings.languageAllowance ?? storedSettings.language_allowance ?? 0,
          salaryPaymentDay: storedSettings.salaryPaymentDay ?? storedSettings.salary_payment_day ?? 27,
          salaryDelayMonths: storedSettings.salaryDelayMonths ?? storedSettings.salary_delay_months ?? 1,
          kpiDelayMonths: storedSettings.kpiDelayMonths ?? storedSettings.kpi_delay_months ?? 2,
          employeeType: storedSettings.employeeType ?? storedSettings.employee_type ?? null,
          startMonth: storedSettings.startMonth ?? storedSettings.start_month ?? null,
        });

        // KPI from previous month; Transport/Absence/OT from current month
        const kpiDate = new Date(selectedYear, selectedMonth - 1, 1);
        fetchMonthlyPayrollData(userId, kpiDate.getFullYear(), kpiDate.getMonth()).then(kpiData => {
          setKpiScore(kpiData.kpiScore);
        });
        fetchMonthlyPayrollData(userId, selectedYear, selectedMonth).then(currentData => {
          setWorkDays(currentData.workDays);
          setSiteDays(currentData.siteDays);
          setCasualCount(currentData.casualCount);
          setNoShowCount(currentData.noShowCount);
          setOtData({ day: currentData.otDay, night: currentData.otNight, special: currentData.otSpecial });
        });
      }
    } catch (err) {
      console.error('Error loading salary settings:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, selectedMonth, selectedYear]);

  const salary = useMemo(() => {
    if (settings.baseSalary == null) return null;

    const base = settings.baseSalary;
    const kpiPool = base * (settings.kpiPercentage / 100);
    const kpiBonus = kpiPool * (kpiScore / 100);
    const transportMonthly = settings.transportApplied ? settings.transportAllowance : 0;
    const transport = (settings.transportApplied && workDays > 0) ? (transportMonthly / workDays) * siteDays : 0;
    const internet = settings.internetAllowance;
    const senior = settings.seniorBonus;
    const language = settings.languageAllowance;
    const dailyRate = base / 30;
    const deductionDays = (casualCount * 1) + (noShowCount * 3);
    const absenceDeduction = deductionDays * dailyRate;

    const loyaltyResult = getLoyaltyBonusForMonth(settings.employeeType, settings.startMonth, selectedYear, selectedMonth);
    const loyaltyBonus = loyaltyResult.hasBonus ? base * (loyaltyResult.percentage / 100) : 0;

    const hourlyRate = base / 30 / 8;
    const otPayoutDay = otData.day * hourlyRate * 1.35;
    const otPayoutNight = otData.night * hourlyRate * 1.70;
    const otPayoutSpecial = otData.special * hourlyRate * 3.00;
    const totalOT = otPayoutDay + otPayoutNight + otPayoutSpecial;

    const gross = base + kpiBonus + transport + internet + senior + language + loyaltyBonus + totalOT - absenceDeduction;
    const taxDeduction = settings.taxRate != null ? gross * (settings.taxRate / 100) : 0;
    const net = gross - taxDeduction;

    return { base, kpiPool, kpiBonus, transport, internet, senior, language, loyaltyBonus, loyaltyResult, absenceDeduction, deductionDays, gross, taxDeduction, net, otPayoutDay, otPayoutNight, otPayoutSpecial, totalOT, otHours: otData };
  }, [settings, kpiScore, workDays, siteDays, casualCount, noShowCount, selectedYear, selectedMonth, otData]);

  const nextLoyaltyBonus = useMemo(() => {
    return getNextLoyaltyBonus(settings.employeeType, settings.startMonth, selectedYear, selectedMonth);
  }, [settings.employeeType, settings.startMonth, selectedYear, selectedMonth]);

  const payoutDateStr = useMemo(() => {
    const payoutMonth = new Date(selectedYear, selectedMonth, settings.salaryPaymentDay);
    return `${settings.salaryPaymentDay} ${payoutMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`;
  }, [selectedYear, selectedMonth, settings.salaryPaymentDay]);

  const sourceMonths = useMemo(() => {
    const kpiDate = new Date(selectedYear, selectedMonth - 1, 1);
    const currentLabel = new Date(selectedYear, selectedMonth, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return {
      kpi: kpiDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      transport: currentLabel,
    };
  }, [selectedYear, selectedMonth]);

  if (loading) {
    return (<Card className="border-border animate-pulse"><div className="p-6 h-32 bg-muted rounded" /></Card>);
  }

  if (!salary) {
    return (
      <Card className="border-border">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground text-center">💡 Set your salary details in Settings → Salary & KPI to see your expected salary</p>
        </CardContent>
      </Card>
    );
  }

  const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <Card className="border-border animate-fade-in">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-bold">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-5 w-5 text-primary" />
            <span>Expected Salary</span>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={goPrev} className="h-7 w-7 rounded-lg"><ChevronLeft className="h-3.5 w-3.5" /></Button>
              <span className="text-xs font-semibold min-w-[90px] text-center">{viewLabel}</span>
              <Button variant="ghost" size="icon" onClick={goNext} className="h-7 w-7 rounded-lg"><ChevronRight className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
          <div className="text-sm font-normal text-muted-foreground bg-indigo-500/5 p-3 rounded-md border border-indigo-500/20 leading-relaxed">
            <p>🏦 <strong>Total payout expected on {payoutDateStr}</strong></p>
            <ul className="mt-1.5 space-y-1 text-[13px] opacity-90">
              <li>• Base Salary (Fixed)</li>
              <li>• KPI Bonus drawn from <strong>{sourceMonths.kpi}</strong></li>
              <li>• Transportation drawn from <strong>{sourceMonths.transport}</strong></li>
            </ul>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5 text-muted-foreground">
              <div className="flex items-center gap-2"><DollarSign className="h-3.5 w-3.5" /><span>Base Salary</span></div>
            </div>
            <span className="font-medium text-foreground">{fmt(salary.base)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5 text-muted-foreground">
              <div className="flex items-center gap-2"><TrendingUp className="h-3.5 w-3.5" /><span>KPI Bonus ({settings.kpiPercentage}% × {kpiScore.toFixed(1)}%)</span></div>
              <span className="text-[10px] pl-5 opacity-70">Based on: {sourceMonths.kpi}</span>
            </div>
            <span className="font-medium text-primary">{fmt(salary.kpiBonus)}</span>
          </div>
          {salary.loyaltyBonus > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5 text-muted-foreground">
                <div className="flex items-center gap-2"><Gift className="h-3.5 w-3.5 text-indigo-500" /><span className="text-indigo-600 dark:text-indigo-400 font-medium">Loyalty Bonus ({salary.loyaltyResult.percentage}%)</span></div>
                <span className="text-[10px] pl-5 opacity-70 cursor-help" title="Based on your overall active timeline">Hit milestone month!</span>
              </div>
              <span className="font-medium text-indigo-600 dark:text-indigo-400">+{fmt(salary.loyaltyBonus)}</span>
            </div>
          )}
          {settings.transportAllowance > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5 text-muted-foreground">
                <div className="flex items-center gap-2"><Bus className="h-3.5 w-3.5" /><span>Transportation</span></div>
                <span className="text-[10px] pl-5 opacity-70">{fmt(settings.transportAllowance)} ÷ {workDays} days × {siteDays} site days<br /><span className="text-[9px] opacity-80">(Based on {sourceMonths.transport})</span></span>
              </div>
              <span className="font-medium text-foreground">{fmt(salary.transport)}</span>
            </div>
          )}
          {salary.totalOT > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5 text-success">
                <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /><span>Overtime Earnings</span></div>
                <span className="text-[10px] pl-5 opacity-70">{salary.otHours.day > 0 && `${salary.otHours.day}h Day (1.35x) `}{salary.otHours.night > 0 && `${salary.otHours.night}h Night (1.70x) `}{salary.otHours.special > 0 && `${salary.otHours.special}h Spec (3x) `}</span>
              </div>
              <span className="font-medium text-success">+{fmt(salary.totalOT)}</span>
            </div>
          )}
          {salary.absenceDeduction > 0 && (
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5 text-rose-500/80">
                <div className="flex items-center gap-2"><CalendarOff className="h-3.5 w-3.5" /><span>Absence Deductions ({salary.deductionDays} days)</span></div>
                <span className="text-[10px] pl-5 opacity-70">{casualCount > 0 && `${casualCount}x Casual `}{noShowCount > 0 && `${noShowCount}x No-Show`}<br /><span className="text-[9px] opacity-80">(Based on {sourceMonths.transport})</span></span>
              </div>
              <span className="font-medium text-rose-500">-{fmt(salary.absenceDeduction)}</span>
            </div>
          )}
          {salary.internet > 0 && (<div className="flex items-center justify-between"><div className="flex items-center gap-2 text-muted-foreground"><Wifi className="h-3.5 w-3.5" /><span>Internet</span></div><span className="font-medium">{fmt(salary.internet)}</span></div>)}
          {salary.senior > 0 && (<div className="flex items-center justify-between"><div className="flex items-center gap-2 text-muted-foreground"><Award className="h-3.5 w-3.5" /><span>Senior Bonus</span></div><span className="font-medium">{fmt(salary.senior)}</span></div>)}
          {salary.language > 0 && (<div className="flex items-center justify-between"><div className="flex items-center gap-2 text-muted-foreground"><Languages className="h-3.5 w-3.5" /><span>Language Allowance</span></div><span className="font-medium">{fmt(salary.language)}</span></div>)}
        </div>
        <div className="border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm"><span className="font-medium">Gross Total</span><span className="font-bold">{fmt(salary.gross)}</span></div>
          {settings.taxRate != null && settings.taxRate > 0 && (<div className="flex items-center justify-between text-sm text-destructive mt-1"><span>Tax & Insurance ({settings.taxRate}%)</span><span>-{fmt(salary.taxDeduction)}</span></div>)}
        </div>
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <div className="flex items-center justify-between"><span className="text-sm font-semibold">Net Expected Salary</span><span className="text-2xl font-bold text-primary">{fmt(salary.net)}</span></div>
        </div>
        {nextLoyaltyBonus && (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 mt-4 flex items-start gap-3">
            <Gift className="h-5 w-5 text-indigo-500 mt-0.5 shrink-0" />
            <div className="space-y-1 relative w-full">
              <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Next Loyalty Bonus: {nextLoyaltyBonus.dateStr}</p>
              <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80">{nextLoyaltyBonus.monthsAway === 0 ? "This month! 🎉" : `${nextLoyaltyBonus.monthsAway} month(s) away`} — Expected Amount: {settings.baseSalary ? fmt(settings.baseSalary * (nextLoyaltyBonus.percentage / 100)) : 'Unknown'} ({nextLoyaltyBonus.percentage}%)</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};