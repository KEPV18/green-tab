

# Phone Bonus KPI Calculator - Implementation Plan

## What We're Building

A new **Phone Bonus KPI** section that calculates the monthly phone bonus based on three components:

1. **Productivity (50%)** - Based on average daily tasks/calls
2. **CSAT (50%)** - Based on existing CSAT percentage
3. **Absence Gate** - Multiplier based on absence days

Plus adding an **absence type** field to the daily shifts table to distinguish between off days (scheduled), sick leave, and unexcused absence.

---

## Database Changes

### 1. Add `absence_type` column to `daily_shifts`
```sql
ALTER TABLE daily_shifts ADD COLUMN absence_type text DEFAULT null;
-- Values: null (not absent), 'scheduled_off' (normal day off), 'sick_leave', 'unexcused'
```

This lets us track which off days count as "absence" for the gate calculation. Scheduled off days (regular days off / holidays) don't count. Only `sick_leave` and `unexcused` count toward the absence gate.

---

## Component: `PhoneBonusKPI`

New component at `src/components/PhoneBonusKPI.tsx` that:

### Data Sources
- **Productivity**: Gets total monthly calls from `daily_survey_calls` (total_calls sum), divides by actual work days (from `daily_shifts` where `is_off_day = false`) to get average daily productivity
- **CSAT**: Uses existing CSAT calculation (totalGood / totalSurveys × 100) already available in the app
- **Absence**: Counts days in `daily_shifts` where `absence_type` is `sick_leave` or `unexcused`

### Scoring Logic
```text
Productivity Score (50%):
  avg >= 30 → 100%
  28 <= avg < 30 → 75%
  26 <= avg < 28 → 50%
  avg < 26 → 0%

CSAT Score (50%):
  csat >= 93% → 100%
  90% <= csat < 93% → 75%
  87% <= csat < 90% → 50%
  csat < 87% → 0%

Absence Gate:
  0-1 days → 100%
  2 days → 75%
  3+ days → 0%

Final = (Productivity×50% + CSAT×50%) × Absence Gate
```

### UI
- Card with three gauges/progress bars for each component
- Shows the raw values (avg calls, CSAT%, absence days)
- Shows the score for each tier
- Shows final bonus percentage prominently
- Color-coded: green (100%), yellow (75%), orange (50%), red (0%)

---

## Changes to `DailyShiftSchedule`

Update the edit dialog to include an **Absence Type** selector when `is_off_day` is checked:
- "Scheduled Off" (default for off days - doesn't count as absence)
- "Sick Leave" (counts as absence)
- "Unexcused Absence" (counts as absence)

Show absence type as a badge in the table row for off days.

---

## Integration

- Add the `PhoneBonusKPI` component to the main dashboard (Index.tsx) in the "overview" or "analytics" tab
- Props: `userId`, `selectedMonth`, `selectedYear`, `csatPercentage` (passed from existing calculations)

---

## File Changes Summary

| File | Change |
|------|--------|
| Migration SQL | Add `absence_type` column to `daily_shifts` |
| `src/lib/types.ts` | Add `absence_type` to `DailyShift` interface |
| `src/components/PhoneBonusKPI.tsx` | New KPI calculator component |
| `src/components/DailyShiftSchedule.tsx` | Add absence type selector in edit dialog |
| `src/pages/Index.tsx` | Add PhoneBonusKPI to dashboard |

