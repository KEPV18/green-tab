import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Coffee, Play, Pause, Square, SkipForward } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getMonthData } from "@/lib/store";

interface BreakEvent {
  id: string;
  type: 'break' | 'lunch' | 'meeting' | 'training' | 'other';
  start: string;
  end?: string;
  duration?: number;
  performanceId?: string;
}

const PREFIX = "gt_breaks_";

function readBreaks(userId: string, performanceId: string | null): BreakEvent[] {
  try {
    const key = performanceId ? `${PREFIX}${userId}_${performanceId}` : `${PREFIX}${userId}_active`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function writeBreaks(userId: string, performanceId: string | null, breaks: BreakEvent[]): void {
  try {
    const key = performanceId ? `${PREFIX}${userId}_${performanceId}` : `${PREFIX}${userId}_active`;
    localStorage.setItem(key, JSON.stringify(breaks));
  } catch {}
}

const BREAK_TYPES = [
  { type: 'break' as const, label: '☕ Break', emoji: '☕', defaultMin: 15 },
  { type: 'lunch' as const, label: '🍽️ Lunch', emoji: '🍽️', defaultMin: 30 },
  { type: 'meeting' as const, label: '📋 Meeting', emoji: '📋', defaultMin: 30 },
  { type: 'training' as const, label: '🎓 Training', emoji: '🎓', defaultMin: 60 },
  { type: 'other' as const, label: '⏸️ Other', emoji: '⏸️', defaultMin: 15 },
];

interface BreakSchedulerProps {
  performanceId: string | null;
}

export const BreakScheduler = ({ performanceId }: BreakSchedulerProps) => {
  const { user } = useAuth();
  const userId = user?.id || "local";
  const [breaks, setBreaks] = useState<BreakEvent[]>([]);
  const [activeBreak, setActiveBreak] = useState<BreakEvent | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const loaded = readBreaks(userId, performanceId);
    setBreaks(loaded);
    const active = loaded.find(b => !b.end);
    if (active) setActiveBreak(active);
  }, [userId, performanceId]);

  useEffect(() => {
    if (!activeBreak) { setElapsed(0); return; }
    const start = new Date(activeBreak.start).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeBreak]);

  // Broadcast next event for daily summary card
  useEffect(() => {
    if (!activeBreak) {
      const shiftStart = localStorage.getItem("gt_shift_start_time");
      if (shiftStart) {
        window.dispatchEvent(new CustomEvent("ktb_next_event", {
          detail: { countdown: "", label: "On shift" }
        }));
      }
      return;
    }
    const typeLabel = BREAK_TYPES.find(t => t.type === activeBreak.type)?.label || "Break";
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const countdown = `${mins}:${secs.toString().padStart(2, '0')}`;
    window.dispatchEvent(new CustomEvent("ktb_next_event", {
      detail: { countdown, label: typeLabel }
    }));
  }, [activeBreak, elapsed]);

  const startBreak = (type: BreakEvent['type']) => {
    const newBreak: BreakEvent = {
      id: crypto.randomUUID(),
      type,
      start: new Date().toISOString(),
      performanceId: performanceId || undefined,
    };
    const updated = [...breaks, newBreak];
    setBreaks(updated);
    setActiveBreak(newBreak);
    writeBreaks(userId, performanceId, updated);
  };

  const endBreak = () => {
    if (!activeBreak) return;
    const ended = {
      ...activeBreak,
      end: new Date().toISOString(),
      duration: Math.round((Date.now() - new Date(activeBreak.start).getTime()) / 60000),
    };
    const updated = breaks.map(b => b.id === ended.id ? ended : b);
    setBreaks(updated);
    setActiveBreak(null);
    setElapsed(0);
    writeBreaks(userId, performanceId, updated);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const todayBreaks = breaks.filter(b => {
    const today = new Date().toISOString().split('T')[0];
    return b.start.startsWith(today);
  });

  const totalBreakMinutes = todayBreaks.reduce((sum, b) => {
    if (b.duration) return sum + b.duration;
    if (b.end) return sum + Math.round((new Date(b.end).getTime() - new Date(b.start).getTime()) / 60000);
    return sum;
  }, 0);

  return (
    <Card className="p-4 border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-3">
        <Coffee className="h-4 w-4 text-warning" />
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          Break Tracker
        </h3>
        {totalBreakMinutes > 0 && (
          <Badge variant="outline" className="ml-auto text-[10px]">
            {totalBreakMinutes}m today
          </Badge>
        )}
      </div>

      {activeBreak ? (
        <div className="space-y-3">
          <div className="text-center">
            <p className="text-2xl font-bold tabular-nums">{formatTime(elapsed)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {BREAK_TYPES.find(t => t.type === activeBreak.type)?.label || "Break"} in progress
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={endBreak} variant="destructive" className="flex-1">
              <Square className="h-4 w-4 mr-2" /> End Break
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-2">
          {BREAK_TYPES.map((bt) => (
            <Button key={bt.type} variant="outline" size="sm" onClick={() => startBreak(bt.type)} className="flex flex-col gap-0.5 h-auto py-2">
              <span className="text-base">{bt.emoji}</span>
              <span className="text-[10px]">{bt.type === 'break' ? '15m' : bt.type === 'lunch' ? '30m' : '30m+'}</span>
            </Button>
          ))}
        </div>
      )}

      {todayBreaks.length > 0 && (
        <div className="mt-3 space-y-1 max-h-[100px] overflow-y-auto">
          {todayBreaks.map(b => (
            <div key={b.id} className="flex items-center justify-between text-xs p-1.5 bg-muted/30 rounded">
              <span>{BREAK_TYPES.find(t => t.type === b.type)?.label || b.type}</span>
              <span className="text-muted-foreground">
                {b.end ? `${b.duration || '?'}m` : 'active'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};