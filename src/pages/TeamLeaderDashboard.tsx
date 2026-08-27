import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Users, Trophy, TrendingUp } from "lucide-react";

export default function TeamLeaderDashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-2">
        <Users className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
          Team Leaderboard
        </h1>
      </div>

      <Card className="p-8 border-border text-center">
        <div className="flex flex-col items-center gap-3">
          <div className="p-4 rounded-full bg-muted">
            <Trophy className="h-12 w-12 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-semibold text-muted-foreground">No Team Data Available</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Team leaderboard requires a backend connection. With local storage mode, your data is stored privately on your device only.
          </p>
          <p className="text-xs text-muted-foreground">
            Switch to Supabase or another backend to enable team features.
          </p>
        </div>
      </Card>

      <Card className="p-4 border-border/60 bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Your Stats Only</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          All performance data on this device is stored locally. No team comparison is available without a shared backend.
        </p>
      </Card>
    </div>
  );
}