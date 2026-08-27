import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Play, Pause, RotateCcw, Coffee, Brain } from "lucide-react";
import { toast } from "sonner";

export const PomodoroTimer = () => {
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsActive(false);
      if (mode === 'focus') {
        toast.success("Focus session complete! Time for a break. ☕");
        setMode('break');
        setTimeLeft(5 * 60);
      } else {
        toast.success("Break over! Ready to focus? 🧠");
        setMode('focus');
        setTimeLeft(25 * 60);
      }
    }

    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    setIsActive(false);
    setMode('focus');
    setTimeLeft(25 * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="p-6 border-border/50 bg-card/50 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 mb-2">
          {mode === 'focus' ? (
            <Brain className="h-5 w-5 text-primary" />
          ) : (
            <Coffee className="h-5 w-5 text-success" />
          )}
          <h3 className="font-semibold text-lg">
            {mode === 'focus' ? 'Focus Mode' : 'Break Time'}
          </h3>
        </div>

        <div className="text-5xl font-bold font-mono tracking-wider text-foreground">
          {formatTime(timeLeft)}
        </div>

        <div className="flex items-center gap-2 mt-2">
          <Button
            onClick={toggleTimer}
            variant={isActive ? "secondary" : "default"}
            size="lg"
            className="w-32"
          >
            {isActive ? (
              <>
                <Pause className="mr-2 h-4 w-4" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Start
              </>
            )}
          </Button>
          <Button
            onClick={resetTimer}
            variant="outline"
            size="icon"
            className="h-10 w-10"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="flex gap-2 mt-4">
          <Button 
            variant={mode === 'focus' ? "default" : "ghost"} 
            size="sm"
            onClick={() => {
              setMode('focus');
              setTimeLeft(25 * 60);
              setIsActive(false);
            }}
            className="text-xs"
          >
            25m Focus
          </Button>
          <Button 
            variant={mode === 'break' ? "default" : "ghost"} 
            size="sm"
            onClick={() => {
              setMode('break');
              setTimeLeft(5 * 60);
              setIsActive(false);
            }}
            className="text-xs"
          >
            5m Break
          </Button>
        </div>
      </div>
    </Card>
  );
};
