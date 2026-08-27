import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MonthSelectorProps {
  selectedMonth: number;
  selectedYear: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
}

export const MonthSelector = ({ selectedMonth, selectedYear, onMonthChange, onYearChange }: MonthSelectorProps) => {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const goToPrevMonth = () => {
    if (selectedMonth === 0) {
      onMonthChange(11);
      onYearChange(selectedYear - 1);
    } else {
      onMonthChange(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      onMonthChange(0);
      onYearChange(selectedYear + 1);
    } else {
      onMonthChange(selectedMonth + 1);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={goToPrevMonth}
        className="h-7 w-7 rounded-lg hover:bg-accent"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>

      <div className="flex items-center gap-1">
        <Select value={selectedMonth.toString()} onValueChange={(v) => onMonthChange(parseInt(v))}>
          <SelectTrigger className="h-7 w-auto min-w-0 gap-1 border-0 bg-transparent px-2 text-xs font-semibold text-foreground shadow-none hover:bg-accent rounded-lg focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((month, index) => (
              <SelectItem key={index} value={index.toString()} className="text-xs">
                {month}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedYear.toString()} onValueChange={(v) => onYearChange(parseInt(v))}>
          <SelectTrigger className="h-7 w-auto min-w-0 gap-1 border-0 bg-transparent px-2 text-xs font-semibold text-foreground shadow-none hover:bg-accent rounded-lg focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((year) => (
              <SelectItem key={year} value={year.toString()} className="text-xs">
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={goToNextMonth}
        className="h-7 w-7 rounded-lg hover:bg-accent"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
