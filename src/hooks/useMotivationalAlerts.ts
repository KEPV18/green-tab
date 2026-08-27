import { useRef, useCallback } from "react";
import { toast } from "sonner";

interface MotivationalAlert {
  type: "approaching" | "achieved" | "milestone" | "streak";
  message: string;
  emoji: string;
}

/**
 * Hook for motivational notifications with vibration and browser notifications
 */
export const useMotivationalAlerts = () => {
  const lastAlertRef = useRef<string>("");
  const celebrationTriggerRef = useRef<(() => void) | null>(null);

  const sendAlert = useCallback((alert: MotivationalAlert) => {
    const key = `${alert.type}-${alert.message}`;
    if (key === lastAlertRef.current) return;
    lastAlertRef.current = key;

    // Vibration pattern based on type
    try {
      if (navigator.vibrate) {
        switch (alert.type) {
          case "approaching":
            navigator.vibrate([50, 30, 50]);
            break;
          case "achieved":
            navigator.vibrate([100, 50, 100, 50, 200]);
            break;
          case "milestone":
            navigator.vibrate([200, 100, 200]);
            break;
          case "streak":
            navigator.vibrate([100, 50, 100]);
            break;
        }
      }
    } catch {}

    // Toast notification with style based on type
    const toastFn = alert.type === "achieved" || alert.type === "milestone" 
      ? toast.success 
      : toast;
    
    toastFn(`${alert.emoji} ${alert.message}`, {
      duration: alert.type === "achieved" ? 5000 : 3000,
    });

    // Browser notification (if permitted)
    try {
      if (Notification.permission === "granted") {
        new Notification("Karma Tracker", {
          body: `${alert.emoji} ${alert.message}`,
          icon: "/favicon.ico",
          tag: key,
        });
      }
    } catch {}
  }, []);

  const checkKPIAlerts = useCallback(
    (kpiScore: number, prevKpiScore: number) => {
      // KPI hit 100%
      if (kpiScore >= 100 && prevKpiScore < 100) {
        sendAlert({
          type: "achieved",
          message: "You hit 100% KPI! Perfect score! 🎉",
          emoji: "🏆",
        });
        return "confetti";
      }

      // KPI crossed 75%
      if (kpiScore >= 75 && prevKpiScore < 75) {
        sendAlert({
          type: "milestone",
          message: "KPI crossed 75%! Keep pushing!",
          emoji: "📈",
        });
        return "firework";
      }

      // KPI crossed 50%
      if (kpiScore >= 50 && prevKpiScore < 50) {
        sendAlert({
          type: "milestone",
          message: "KPI reached 50% — halfway there!",
          emoji: "💪",
        });
      }

      return null;
    },
    [sendAlert]
  );

  const checkDailyTargetAlerts = useCallback(
    (todayGood: number, dailyTarget: number) => {
      const target = Math.ceil(dailyTarget);
      if (target <= 0 || todayGood <= 0) return null;

      if (todayGood === target) {
        sendAlert({
          type: "achieved",
          message: "Daily target achieved! You're on fire!",
          emoji: "🎯",
        });
        return "firework";
      }

      if (target - todayGood === 1) {
        sendAlert({
          type: "approaching",
          message: "ONE more rating to hit your target!",
          emoji: "🔥",
        });
      } else if (target - todayGood === 2) {
        sendAlert({
          type: "approaching",
          message: "Just 2 more ratings to your target!",
          emoji: "⚡",
        });
      } else if (target - todayGood === 3) {
        sendAlert({
          type: "approaching",
          message: "3 ratings away from your daily target",
          emoji: "💫",
        });
      }

      // Exceeded target
      if (todayGood > target && todayGood === target + 1) {
        sendAlert({
          type: "milestone",
          message: "Exceeded daily target! Extra effort pays off!",
          emoji: "🚀",
        });
      }

      return null;
    },
    [sendAlert]
  );

  const checkCallsMilestone = useCallback(
    (todayCalls: number) => {
      if (todayCalls === 30) {
        sendAlert({
          type: "milestone",
          message: "30 calls today — 100% productivity tier!",
          emoji: "⭐",
        });
        return "firework";
      }
      if (todayCalls === 35) {
        sendAlert({
          type: "milestone",
          message: "35 calls! You're crushing it!",
          emoji: "🔥",
        });
      }
      if (todayCalls === 40) {
        sendAlert({
          type: "achieved",
          message: "40 calls — legendary performance!",
          emoji: "👑",
        });
        return "confetti";
      }
      return null;
    },
    [sendAlert]
  );

  const checkStreakAlert = useCallback(
    (currentStreak: number, previousBest: number) => {
      if (currentStreak > previousBest && currentStreak > 1) {
        sendAlert({
          type: "streak",
          message: `New streak record: ${currentStreak} days! 🔥`,
          emoji: "🏅",
        });
        return "confetti";
      }
      if (currentStreak === 5) {
        sendAlert({
          type: "streak",
          message: "5-day streak! Consistency is key!",
          emoji: "🔥",
        });
      }
      if (currentStreak === 10) {
        sendAlert({
          type: "streak",
          message: "10-day streak! Unstoppable!",
          emoji: "💎",
        });
        return "confetti";
      }
      return null;
    },
    [sendAlert]
  );

  return {
    checkKPIAlerts,
    checkDailyTargetAlerts,
    checkCallsMilestone,
    checkStreakAlert,
    celebrationTriggerRef,
  };
};
