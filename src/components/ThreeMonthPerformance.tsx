import { Card } from "@/components/ui/card";
import { ComposedChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, Line } from "recharts";
import { useMemo, useState, useEffect } from "react";
import { PercentageDisplay } from "@/components/PercentageDisplay";
import { Label } from "@/components/ui/label";
import { getDailyChanges, getMonthData } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";

export interface MonthMetrics {
  month: number;
  year: number;
  csat: number;
  karma: number;
  fcr: number;
  totalGood: number;
  totalSurveys: number;
  totalKarmaBase: number;
  phoneGood: number;
  phoneBad: number;
  phoneKarma: number;
  chatGood: number;
  chatBad: number;
  emailGood: number;
  emailBad: number;
}

interface KpiData {
  productivity: number;
  absenceGate: number;
  kpi: number;
  avgCalls: number;
  absenceDays: number;
}

interface ThreeMonthPerformanceProps {
  metrics: MonthMetrics[];
  availableMonths: Array<{ month: number; year: number; label: string }>;
  selectedMonths: Array<{ month: number; year: number }>;
  onMonthsChange: (months: Array<{ month: number; year: number }>) => void;
}

type MetricType = "csat" | "karma" | "fcr" | "phone" | "kpi" | "productivity" | "absence";

const getProductivityScore = (avg: number) => {
  if (avg >= 30) return 100;
  if (avg >= 28) return 75;
  if (avg >= 26) return 50;
  return 0;
};

const getCsatScore = (csat: number) => {
  if (csat >= 93) return 100;
  if (csat >= 90) return 75;
  if (csat >= 87) return 50;
  return 0;
};

const getAbsenceGate = (days: number) => {
  if (days <= 1) return 100;
  if (days === 2) return 75;
  return 0;
};

const metricLabels: Record<MetricType, string> = {
  csat: "CSAT",
  karma: "KARMA",
  fcr: "FCR",
  phone: "Phone Channel",
  kpi: "KPI Score",
  productivity: "Productivity",
  absence: "Absence Gate",
};

export const ThreeMonthPerformance = ({
  metrics,
  availableMonths,
  selectedMonths,
  onMonthsChange,
}: ThreeMonthPerformanceProps) => {
  const { user } = useAuth();
  const [selectedMetrics, setSelectedMetrics] = useState<MetricType[]>(["csat", "karma", "fcr", "phone"]);
  const [kpiDataByMonth, setKpiDataByMonth] = useState<Record<string, KpiData>>({});

  // Fetch KPI-related data for selected months from local store
  useEffect(() => {
    if (!user) return;
    const needsKpiData = selectedMetrics.some(m => ["kpi", "productivity", "absence"].includes(m));
    if (!needsKpiData || metrics.length === 0) { setKpiDataByMonth({}); return; }

    const userId = user.id || "local";
    const results: Record<string, KpiData> = {};

    for (const m of metrics) {
      const key = `${m.year}-${m.month}`;
      try {
        const md = getMonthData(userId, m.year, m.month);
        const changes = getDailyChanges(md.id);

        // Calculate productivity from daily changes
        const dayMap = new Map<string, number>();
        changes.forEach(c => {
          if (c.fieldName === "good" || c.fieldName === "genesysGood" ||
              c.fieldName === "bad" || c.fieldName === "genesysBad") {
            const current = dayMap.get(c.changeDate) || 0;
            dayMap.set(c.changeDate, current + Math.abs(c.changeAmount));
          }
        });
        let totalCalls = 0;
        let validDays = 0;
        dayMap.forEach(v => { if (v > 0) { totalCalls += v; validDays++; } });
        const avgCalls = validDays > 0 ? totalCalls / validDays : 0;
        const productivityScore = getProductivityScore(avgCalls);

        // Count absence days from localStorage shifts
        const lastDay = new Date(m.year, m.month + 1, 0).getDate();
        let absenceDays = 0;
        for (let d = 1; d <= lastDay; d++) {
          const dateStr = `${m.year}-${String(m.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const shiftKey = `gt_shifts_${userId}_${dateStr}`;
          const raw = localStorage.getItem(shiftKey);
          if (raw) {
            try {
              const shift = JSON.parse(raw);
              if (shift.is_off_day && (shift.absence_type === 'sick_leave' || shift.absence_type === 'unexcused')) {
                absenceDays++;
              }
            } catch {}
          }
        }
        const absenceGate = getAbsenceGate(absenceDays);

        // Calculate KPI
        const csatScore = getCsatScore(m.csat);
        const base = (productivityScore * 0.5) + (csatScore * 0.5);
        const kpi = (base * absenceGate) / 100;

        results[key] = { productivity: productivityScore, absenceGate, kpi, avgCalls, absenceDays };
      } catch (e) {
        console.error('Error fetching KPI data for month:', m.month, m.year, e);
      }
    }

    setKpiDataByMonth(results);
  }, [user, metrics, selectedMetrics]);

  const toggleMetric = (metric: MetricType) => {
    setSelectedMetrics((prev) => {
      if (prev.includes(metric)) {
        if (prev.length === 1) return prev;
        return prev.filter((m) => m !== metric);
      }
      return [...prev, metric];
    });
  };

  const phoneChannelData = useMemo(() => {
    return metrics.map((m) => {
      const monthName = new Date(m.year, m.month).toLocaleString("en-US", { month: "short" });
      const good = m.phoneGood;
      const bad = m.phoneBad;
      const karma = m.phoneKarma;
      const denom = good + bad;
      const successRate = denom > 0 ? (good / denom) * 100 : 0;
      return {
        monthLabel: `${monthName} ${m.year}`,
        monthName,
        year: m.year,
        good,
        bad,
        karma,
        successRate: parseFloat(successRate.toFixed(1)),
      };
    });
  }, [metrics]);

  const toggleMonth = (month: number, year: number) => {
    const exists = selectedMonths.some((s) => s.month === month && s.year === year);
    if (exists) {
      if (selectedMonths.length === 1) return;
      onMonthsChange(selectedMonths.filter((s) => !(s.month === month && s.year === year)));
    } else {
      onMonthsChange([...selectedMonths, { month, year }].slice(-6));
    }
  };

  if (metrics.length === 0) {
    return (
      <Card className="p-6 border-border">
        <h3 className="text-lg font-semibold text-foreground mb-4">📅 3-Month Performance</h3>
        <p className="text-sm text-muted-foreground">No data available for the selected period.</p>
      </Card>
    );
  }

  const allMetricTypes: MetricType[] = ["csat", "karma", "fcr", "phone", "kpi", "productivity", "absence"];

  return (
    <div className="space-y-6">
      {/* Filters Section */}
      <Card className="p-4 border-border">
        <div className="space-y-4">
          <h4 className="font-semibold text-foreground text-sm">Filters</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Metrics Filter */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Metrics to Show</Label>
              <div className="flex flex-wrap gap-2">
                {allMetricTypes.map((m) => (
                  <button
                    key={m}
                    onClick={() => toggleMetric(m)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                      selectedMetrics.includes(m)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {metricLabels[m]}
                  </button>
                ))}
              </div>
            </div>

            {/* Month Selection */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Months to Compare (Select 1-6)</Label>
              <div className="flex flex-wrap gap-2">
                {availableMonths.map((m) => {
                  const isSelected = selectedMonths.some((s) => s.month === m.month && s.year === m.year);
                  return (
                    <button
                      key={`${m.month}-${m.year}`}
                      onClick={() => toggleMonth(m.month, m.year)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((m) => {
          const monthName = new Date(m.year, m.month).toLocaleString("en-US", { month: "long" });
          const phoneTotal = m.phoneGood + m.phoneBad;
          const phoneSuccessRate = phoneTotal > 0 ? (m.phoneGood / phoneTotal) * 100 : 0;
          const kpiKey = `${m.year}-${m.month}`;
          const kpi = kpiDataByMonth[kpiKey];

          return (
            <Card key={`${m.year}-${m.month}`} className="p-4 border-border">
              <h3 className="text-base font-semibold text-foreground mb-3">{monthName} {m.year}</h3>
              <div className="space-y-3">
                {selectedMetrics.includes("csat") && (
                  <PercentageDisplay
                    title="CSAT"
                    percentage={m.csat}
                    subtitle={`${m.totalGood} good / ${m.totalSurveys} total`}
                  />
                )}
                {selectedMetrics.includes("karma") && (
                  <PercentageDisplay
                    title="Karma"
                    percentage={m.karma}
                    subtitle={`${m.totalGood} / ${m.totalKarmaBase} interactions`}
                  />
                )}
                {selectedMetrics.includes("fcr") && (
                  <PercentageDisplay
                    title="FCR"
                    percentage={m.fcr}
                    subtitle=""
                  />
                )}
                {selectedMetrics.includes("phone") && (
                  <PercentageDisplay
                    title="Phone Channel"
                    percentage={phoneSuccessRate}
                    subtitle={`${m.phoneGood} good / ${m.phoneBad} bad`}
                  />
                )}
                {selectedMetrics.includes("kpi") && (
                  <PercentageDisplay
                    title="KPI Score"
                    percentage={kpi?.kpi ?? 0}
                    subtitle={kpi ? `Prod ${kpi.productivity}% × CSAT ${getCsatScore(m.csat)}% × Abs ${kpi.absenceGate}%` : "Loading..."}
                  />
                )}
                {selectedMetrics.includes("productivity") && (
                  <PercentageDisplay
                    title="Productivity"
                    percentage={kpi?.productivity ?? 0}
                    subtitle={kpi ? `${kpi.avgCalls.toFixed(1)} avg calls/day` : "Loading..."}
                  />
                )}
                {selectedMetrics.includes("absence") && (
                  <PercentageDisplay
                    title="Absence Gate"
                    percentage={kpi?.absenceGate ?? 0}
                    subtitle={kpi ? `${kpi.absenceDays} absence day${kpi.absenceDays !== 1 ? 's' : ''}` : "Loading..."}
                  />
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Phone Channel Analytics Chart */}
      {selectedMetrics.includes("phone") && (
        <Card className="p-6 border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-foreground">Phone Channel Analytics</h3>
            <span className="text-sm text-muted-foreground">
              {metrics.length} month{metrics.length > 1 ? "s" : ""} comparison
            </span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={phoneChannelData} margin={{ top: 20, right: 60, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="monthLabel" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis yAxisId="counts" stroke="hsl(var(--muted-foreground))" />
                <YAxis yAxisId="percent" orientation="right" stroke="hsl(var(--muted-foreground))" domain={[0, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Bar dataKey="good" name="Good" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} yAxisId="counts" />
                <Bar dataKey="bad" name="Bad" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} yAxisId="counts" />
                <Bar dataKey="karma" name="Karma" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} yAxisId="counts" />
                <Line
                  type="monotone"
                  dataKey="successRate"
                  name="Success %"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  yAxisId="percent"
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
};
