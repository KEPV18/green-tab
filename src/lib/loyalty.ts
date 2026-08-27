export interface LoyaltyBonusResult {
  hasBonus: boolean;
  percentage: number;
}

export const getLoyaltyBonusForMonth = (
  employeeType: string | null | undefined, 
  startMonthStr: string | null | undefined, 
  targetYear: number, 
  targetMonth: number // 0-indexed (Jan = 0)
): LoyaltyBonusResult => {
  if (employeeType === 'old') {
    // Old Employee Rules
    // First bonus: April 2026
    const targetDate = new Date(targetYear, targetMonth, 1);
    const firstBonusDate = new Date(2026, 3, 1); // 3 = April
    
    if (targetDate.getTime() === firstBonusDate.getTime()) {
      return { hasBonus: true, percentage: 100 };
    }
    
    if (targetDate > firstBonusDate) {
      // difference in months
      const diffMonths = (targetYear - 2026) * 12 + (targetMonth - 3);
      if (diffMonths > 0 && diffMonths % 6 === 0) {
        return { hasBonus: true, percentage: 100 };
      }
    }
    return { hasBonus: false, percentage: 0 };
  }

  if (employeeType === 'new') {
    if (!startMonthStr) return { hasBonus: false, percentage: 0 };
    
    const [startYearStr, startMonthNumStr] = startMonthStr.split('-');
    if (!startYearStr || !startMonthNumStr) return { hasBonus: false, percentage: 0 };
    
    const startY = parseInt(startYearStr, 10);
    const startM = parseInt(startMonthNumStr, 10) - 1; // 0-indexed
    
    const diffMonths = (targetYear - startY) * 12 + (targetMonth - startM);
    
    if (diffMonths === 5) return { hasBonus: true, percentage: 50 };
    if (diffMonths === 8) return { hasBonus: true, percentage: 50 };
    if (diffMonths === 12) return { hasBonus: true, percentage: 100 };
    
    if (diffMonths > 12 && (diffMonths - 12) % 6 === 0) {
      return { hasBonus: true, percentage: 100 };
    }
    
    return { hasBonus: false, percentage: 0 };
  }

  return { hasBonus: false, percentage: 0 };
};

export const getNextLoyaltyBonus = (
  employeeType: string | null | undefined,
  startMonthStr: string | null | undefined,
  currentYear: number,
  currentMonth: number
) => {
  // Check up to 36 months in the future to find the next bonus
  for (let offset = 0; offset <= 36; offset++) {
    const d = new Date(currentYear, currentMonth + offset, 1);
    const result = getLoyaltyBonusForMonth(employeeType, startMonthStr, d.getFullYear(), d.getMonth());
    if (result.hasBonus) {
      return {
        dateStr: `${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`,
        percentage: result.percentage,
        monthsAway: offset
      };
    }
  }
  return null;
};
