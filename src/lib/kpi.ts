/**
 * Green Tab — KPI & Payroll Calculations (Local Store)
 *
 * Replaces Supabase queries with localStorage-based lookups.
 * Uses local store functions for performance_data, daily_shifts, etc.
 */

import { getMonthData, getDailyChanges } from "@/lib/store";

const PREFIX = "gt_shifts_";

function readShifts(userId: string, year: number, month: number): any[] {
  try {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
    // Shifts are stored with key prefix gt_shifts_{userId}_{date}
    const shifts: any[] = [];
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const key = `${PREFIX}${userId}_${dateStr}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          shifts.push(JSON.parse(raw));
        } catch {}
      }
    }
    return shifts;
  } catch { return []; }
}

export async function fetchMonthlyPayrollData(userId: string, year: number, month: number): Promise<{
  kpiScore: number,
  workDays: number,
  siteDays: number,
  casualCount: number,
  sickCount: number,
  annualCount: number,
  noShowCount: number,
  otDay: number,
  otNight: number,
  otSpecial: number
}> {
  const perfData = getMonthData(userId, year, month);
  const shiftsData = readShifts(userId, year, month);

  // Calculate auto productivity from daily changes
  const changes = getDailyChanges(perfData.id);
  let totalCalls = 0;
  const validDays = new Set<string>();
  changes.forEach(c => {
    if (c.fieldName === "good" || c.fieldName === "genesysGood" ||
        c.fieldName === "bad" || c.fieldName === "genesysBad") {
      totalCalls += Math.abs(c.changeAmount);
      validDays.add(c.changeDate);
    }
  });
  const daysWithCalls = validDays.size;
  const avg = daysWithCalls > 0 ? totalCalls / daysWithCalls : 0;
  let autoProdScore = avg >= 30 ? 100 : avg >= 28 ? 75 : avg >= 26 ? 50 : 0;

  const pData: any = perfData;
  let csatScore = 100;
  let prodScore = autoProdScore;

  // Override with manual productivity if set
  if (pData.manualProductivity != null) {
    prodScore = Math.max(0, Math.min(100, Number(pData.manualProductivity)));
  }

  // CSAT score from good/bad
  const totalGood = (perfData.good || 0) + (perfData.genesysGood || 0);
  const totalBad = (perfData.bad || 0) + (perfData.genesysBad || 0);
  const karmaBad = perfData.karmaBad || 0;
  const totalSamples = totalGood + totalBad;
  if (totalSamples > 0) {
    const csatPct = (totalGood / totalSamples) * 100;
    csatScore = csatPct >= 93 ? 100 : csatPct >= 90 ? 75 : csatPct >= 87 ? 50 : 0;
  }

  // Karma gate: KPI is 0 if karma < 73%
  const KARMA_THRESHOLD = 73;
  const karmaBase = totalGood + totalBad + karmaBad;
  const karmaPct = karmaBase > 0 ? (totalGood / karmaBase) * 100 : 0;
  const karmaGate = karmaPct >= KARMA_THRESHOLD ? 1 : 0;

  // Absence counts from shifts
  let casualCount = 0;
  let sickCount = 0;
  let annualCount = 0;
  let noShowCount = 0;
  let workDays = 0;
  let siteDays = 0;
  let otDay = 0;
  let otNight = 0;
  let otSpecial = 0;

  for (const s of shiftsData) {
    if (s.absence_type === 'casual_leave') casualCount++;
    if (s.absence_type === 'sick_leave') sickCount++;
    if (s.absence_type === 'annual_leave') annualCount++;
    if (s.absence_type === 'no_show') noShowCount++;

    if (!s.is_off_day && s.shift_start) {
      workDays++;
      if (s.is_site_day) siteDays++;
    }

    otDay += Number(s.ot_hours_day || 0);
    otNight += Number(s.ot_hours_night || 0);
    otSpecial += Number(s.ot_hours_special || 0);
  }

  const totalAbsence = casualCount + sickCount + annualCount + noShowCount;
  const gate = totalAbsence <= 1 ? 100 : totalAbsence === 2 ? 75 : 0;
  const rawPercentage = ((prodScore * 0.5 + csatScore * 0.5) * gate) / 100;
  const finalPercentage = karmaGate === 0 ? 0 : rawPercentage;

  return {
    kpiScore: finalPercentage,
    workDays,
    siteDays,
    casualCount,
    sickCount,
    annualCount,
    noShowCount,
    otDay,
    otNight,
    otSpecial,
  };
}