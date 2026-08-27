import { useState, useEffect, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { Settings, LogOut, ChevronLeft, ChevronRight, Calendar, BarChart3, NotebookText, ListChecks, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { fetchTeamData, findMyRow, type TeamMemberRow } from "@/lib/googleSheets";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GoalsSection } from "@/components/GoalsSection";

interface SidebarProps {
  collapsed?: boolean;
  toggleCollapsed?: () => void;
}

export function Sidebar({ collapsed = false, toggleCollapsed }: SidebarProps) {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [metrics, setMetrics] = useState<{ totalGood: number; totalBad: number; karmaBad: number; kpiScore: number }>({ totalGood: 0, totalBad: 0, karmaBad: 0, kpiScore: 0 });
  const [mySheetRow, setMySheetRow] = useState<TeamMemberRow | null>(null);

  // Computed CSAT values: use sheet data when available
  const csatDisplay = useMemo(() => {
    const sheetCsat = mySheetRow && mySheetRow.csat !== null ? mySheetRow.csat : null;
    const localTotal = metrics.totalGood + metrics.totalBad;
    const localPct = localTotal > 0 ? (metrics.totalGood / localTotal) * 100 : 0;
    const pct = sheetCsat !== null ? sheetCsat : localPct;
    const good = sheetCsat !== null ? Math.round(sheetCsat) : metrics.totalGood;
    const bad = sheetCsat !== null ? Math.round(100 - sheetCsat) : metrics.totalBad;
    const isSheet = sheetCsat !== null;
    return { pct, good, bad, isSheet };
  }, [mySheetRow, metrics.totalGood, metrics.totalBad]);

  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem("ktb_active_tab") || "overview"; } catch { return "overview"; }
  });

  useEffect(() => {
    const tabHandler = (e: Event) => {
      const ce = e as CustomEvent<string>;
      if (ce.detail) setActiveTab(ce.detail);
    };
    const storageHandler = (e: StorageEvent) => {
      if (e.key === "ktb_active_tab" && e.newValue) setActiveTab(e.newValue);
    };
    window.addEventListener("ktb_tab_change", tabHandler as EventListener);
    window.addEventListener("storage", storageHandler);
    return () => {
      window.removeEventListener("ktb_tab_change", tabHandler as EventListener);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  // Fetch team data to get sheet CSAT for sidebar
  useEffect(() => {
    if (!user) return;
    fetchTeamData().then((td) => {
      if (td && td.members.length > 0) {
        const row = findMyRow(td, user.email, user.displayName);
        setMySheetRow(row);
      }
    }).catch(() => {
      // Silently fail - sheet data is supplementary
    });
  }, [user]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ totalGood: number; totalBad: number; karmaBad: number; kpiScore?: number }>;
      if (ce.detail) setMetrics(prev => ({ ...prev, ...ce.detail }));
    };
    window.addEventListener("ktb_metrics_update", handler as EventListener);
    try {
      const s = localStorage.getItem("ktb_metrics_update");
      if (s) setMetrics(JSON.parse(s));
    } catch {}
    return () => window.removeEventListener("ktb_metrics_update", handler as EventListener);
  }, []);

  const tabLinks = [
    { name: "Overview", emoji: "📊", tab: "overview", icon: BarChart3 },
    { name: "Tickets", emoji: "🎫", tab: "tickets", icon: ListChecks },
    { name: "Analytics", emoji: "📈", tab: "analytics", icon: BarChart3 },
    { name: "Notes & Log", emoji: "📝", tab: "notes", icon: NotebookText },
  ];

  const pageLinks = [
    { name: "Team Dashboard", href: "/team-dashboard", icon: Trophy },
    { name: "Work Schedule", href: "/work-schedule", icon: Calendar },
    { name: "Settings", href: "/settings", icon: Settings },
  ];

  const handleTabClick = (tab: string) => {
    try { localStorage.setItem("ktb_active_tab", tab); } catch {}
    try { window.dispatchEvent(new CustomEvent("ktb_tab_change", { detail: tab })); } catch {}
    setActiveTab(tab);
  };

  const isOnHome = location.pathname === "/";

  const SidebarContent = () => (
    <>
      <div className={cn("px-4 py-5 border-b border-sidebar-border flex items-center", collapsed ? "justify-center" : "justify-between")}>
      {!collapsed && (
          <div className="flex items-center gap-2.5">
            {/* Green Tab logo mark */}
            <div className="relative h-7 w-7 flex items-center justify-center shrink-0">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-green-500/30 to-green-500/5" />
              <svg viewBox="0 0 28 28" className="h-7 w-7" fill="none">
                <rect x="4" y="3" width="20" height="22" rx="3" stroke="hsl(142 71% 45%)" strokeWidth="1.5" />
                <line x1="9" y1="9" x2="19" y2="9" stroke="hsl(142 71% 45%)" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="9" y1="14" x2="16" y2="14" stroke="hsl(142 71% 45%)" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="9" y1="19" x2="13" y2="19" stroke="hsl(142 71% 45%)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-lg font-orbit text-green-400 whitespace-nowrap tracking-tight">
              Green Tab
            </h1>
          </div>
        )}
        <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleCollapsed} 
            className={cn("hidden md:flex rounded-xl hover:bg-sidebar-accent", collapsed && "h-8 w-8")}
        >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <div className="space-y-1">
          <div className="mb-3">
            {collapsed ? (
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col items-center gap-1 py-2">
                      {(() => {
                        const csatPct = csatDisplay.pct;
                        const kpiPct = metrics.kpiScore;
                        const getColor = (pct: number) => pct >= 95 ? 'text-success stroke-success' : pct >= 75 ? 'text-primary stroke-primary' : 'text-warning stroke-warning';
                        const circumference = 2 * Math.PI * 8;
                        return [
                          { pct: csatPct, label: 'C' },
                          { pct: kpiPct, label: 'K' },
                        ].map((item, i) => (
                          <div key={i} className="relative w-9 h-9 flex items-center justify-center">
                            <svg width="36" height="36" viewBox="0 0 20 20" className="-rotate-90">
                              <circle cx="10" cy="10" r="8" fill="none" stroke="hsl(var(--muted))" strokeWidth="2" />
                              <circle cx="10" cy="10" r="8" fill="none" className={getColor(item.pct)}
                                strokeWidth="2" strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={circumference - (Math.min(item.pct, 100) / 100) * circumference}
                              />
                            </svg>
                            <span className={`absolute text-[8px] font-bold ${getColor(item.pct).split(' ')[0]}`}>{item.pct.toFixed(0)}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <div className="text-xs space-y-1">
                      <div>CSAT: {csatDisplay.pct.toFixed(1)}%{csatDisplay.isSheet ? ' (Sheet)' : ''}</div>
                      <div>KPI: {metrics.kpiScore.toFixed(0)}%</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <div className="w-full space-y-1">
                <GoalsSection
                  currentValue={csatDisplay.good}
                  totalNegatives={csatDisplay.bad}
                  metricName="CSAT"
                  targets={[88, 90, 95]}
                  variant="sidebar"
                />
                <GoalsSection
                  currentValue={metrics.kpiScore}
                  totalNegatives={100 - metrics.kpiScore}
                  metricName="KPI"
                  targets={[50, 75, 100]}
                  variant="sidebar"
                />
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="h-px bg-sidebar-border mx-1 mb-2" />

          {tabLinks.map((tl) => {
            const Icon = tl.icon;
            const isActive = isOnHome && activeTab === tl.tab;
            return (
              <div key={tl.tab}>
                {collapsed ? (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link to="/" onClick={() => handleTabClick(tl.tab)}>
                          <Button variant="ghost" className={cn(
                            "w-full px-2 justify-center rounded-xl transition-all duration-200",
                            isActive 
                              ? "bg-primary/10 text-primary shadow-sm" 
                              : "text-sidebar-foreground hover:bg-sidebar-accent"
                          )}>
                            <Icon className="h-5 w-5" />
                          </Button>
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="right">{tl.name}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ) : (
                  <Link to="/" onClick={() => handleTabClick(tl.tab)}>
                    <Button variant="ghost" className={cn(
                      "w-full justify-start gap-3 rounded-xl transition-all duration-200 h-10",
                      isActive 
                        ? "bg-primary/10 text-primary font-semibold shadow-sm" 
                        : "text-sidebar-foreground hover:bg-sidebar-accent font-medium"
                    )}>
                      <Icon className="h-4.5 w-4.5" />
                      <span className="text-sm">{tl.name}</span>
                      <span className="text-sm ml-auto">{tl.emoji}</span>
                    </Button>
                  </Link>
                )}
              </div>
            );
          })}
        </div>

        {/* Divider */}
        <div className="h-px bg-sidebar-border mx-1 my-2" />

        {pageLinks.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.href;
          
          const LinkButton = (
            <Button
                variant="ghost"
                className={cn(
                  "w-full justify-start mb-0.5 rounded-xl transition-all duration-200 h-10",
                  isActive 
                    ? "bg-primary/10 text-primary font-semibold shadow-sm" 
                    : "text-sidebar-foreground hover:bg-sidebar-accent font-medium",
                  collapsed ? "px-2 justify-center" : "gap-3"
                )}
            >
                <Icon className="h-4.5 w-4.5" />
                {!collapsed && <span className="text-sm">{link.name}</span>}
            </Button>
          );

          return (
            <div key={link.href}>
                {collapsed ? (
                    <TooltipProvider delayDuration={0}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Link to={link.href}>{LinkButton}</Link>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                {link.name}
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                ) : (
                    <Link to={link.href}>{LinkButton}</Link>
                )}
            </div>
          );
        })}
      </div>

      <div className="p-3 border-t border-sidebar-border">
        {collapsed ? (
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="w-full rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={signOut}>
                            <LogOut className="h-4.5 w-4.5" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right">Sign Out</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ) : (
            <Button variant="ghost" className="w-full justify-start gap-3 rounded-xl text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={signOut}>
            <LogOut className="h-4.5 w-4.5" />
            Sign Out
            </Button>
        )}
      </div>
    </>
  );

  return (
    <div 
        className={cn(
            "hidden md:flex h-screen flex-col border-r border-sidebar-border bg-sidebar fixed left-0 top-0 z-50 transition-all duration-300",
            collapsed ? "w-16" : "w-64"
        )}
    >
        <SidebarContent />
    </div>
  );
}