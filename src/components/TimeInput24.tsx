import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatTime12H } from "@/lib/staticSchedule";

interface TimeInput24Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const TimeInput24 = ({ value, onChange, className }: TimeInput24Props) => {
  const [rawInput, setRawInput] = React.useState(value || "");
  const [isFocused, setIsFocused] = React.useState(false);

  React.useEffect(() => {
    if (!isFocused) {
      setRawInput(value || "");
    }
  }, [value, isFocused]);

  const parseTime = (input: string): string | null => {
    const cleaned = input.replace(/[^\d:]/g, "");
    // Handle formats: "14:30", "1430", "930", "9:30"
    let hours: number, minutes: number;

    if (cleaned.includes(":")) {
      const [h, m] = cleaned.split(":");
      hours = parseInt(h, 10);
      minutes = parseInt(m || "0", 10);
    } else if (cleaned.length >= 3) {
      // "1430" -> 14:30, "930" -> 9:30
      if (cleaned.length <= 3) {
        hours = parseInt(cleaned.slice(0, 1), 10);
        minutes = parseInt(cleaned.slice(1), 10);
      } else {
        hours = parseInt(cleaned.slice(0, -2), 10);
        minutes = parseInt(cleaned.slice(-2), 10);
      }
    } else {
      return null;
    }

    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null;
    }

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!rawInput.trim()) {
      onChange("");
      return;
    }
    const parsed = parseTime(rawInput);
    if (parsed) {
      onChange(parsed);
      setRawInput(parsed);
    } else {
      // Revert to previous valid value
      setRawInput(value || "");
    }
  };

  const displayValue = isFocused
    ? rawInput
    : value
      ? `${value} (${formatTime12H(value)})`
      : "";

  return (
    <Input
      type="text"
      inputMode="numeric"
      placeholder="مثال: 14:30"
      value={displayValue}
      onChange={(e) => {
        setRawInput(e.target.value);
      }}
      onFocus={() => {
        setIsFocused(true);
        setRawInput(value || "");
      }}
      onBlur={handleBlur}
      className={className}
    />
  );
};
