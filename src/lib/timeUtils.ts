/**
 * Time utilities to ensure the app stays locked to Egypt Time (Africa/Cairo)
 * and handles timer calculations accurately even if the tab is backgrounded.
 */

/**
 * Returns the current date/time adjusted to Egypt (Africa/Cairo).
 * This uses the UTC time as a base, so it's less dependent on the local device timezone setting,
 * but still depends on the device having a globally accurate UTC clock.
 */
export const getEgyptTime = (): Date => {
  const now = new Date();
  // Get string representation in Egypt timezone
  const cairoString = now.toLocaleString("en-US", { timeZone: "Africa/Cairo" });
  return new Date(cairoString);
};

/**
 * Formats a date or time string into a 12-hour format (HH:MM AM/PM)
 */
export const formatTime12H = (timeStr: string | null | undefined): string => {
  if (!timeStr) return "";
  if (!timeStr.includes(":")) return timeStr;

  try {
    const [h, m] = timeStr.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 || 12;
    return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
  } catch (e) {
    return timeStr;
  }
};

/**
 * Calculates remaining seconds between now (Egypt time) and a target time string (HH:mm)
 */
export const getSecondsUntil = (targetTimeStr: string): number => {
  const now = getEgyptTime();
  const [h, m] = targetTimeStr.split(":").map(Number);
  
  const target = new Date(now);
  target.setHours(h, m, 0, 0);

  // If target is in the past, assume it's for tomorrow (or handles overnight logic)
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
};

/**
 * Calculates remaining seconds until a specific Date object
 */
export const getSecondsUntilDate = (targetDate: Date): number => {
  const now = getEgyptTime();
  return Math.max(0, Math.floor((targetDate.getTime() - now.getTime()) / 1000));
};

/**
 * Converts a time string (HH:mm) to a Date object today in Egypt time
 */
export const timeStringToEgyptDate = (timeStr: string): Date => {
  const now = getEgyptTime();
  const [h, m] = timeStr.split(":").map(Number);
  const date = new Date(now);
  date.setHours(h, m, 0, 0);
  return date;
};
