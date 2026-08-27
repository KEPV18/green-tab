import { ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { useSwipeNavigation } from "@/hooks/useSwipeNavigation";
import { Plus, Minus, Clock, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed');
      return saved === 'true';
    }
    return false;
  });

  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem("ktb_active_tab") || "overview"; } catch { return "overview"; }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<string>;
      if (ce.detail) setActiveTab(ce.detail);
    };
    window.addEventListener("ktb_tab_change", handler as EventListener);
    return () => window.removeEventListener("ktb_tab_change", handler as EventListener);
  }, []);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed.toString());
  }, [sidebarCollapsed]);

  const name = user?.email || "";
  const initials = name ? name.slice(0, 2).toUpperCase() : "U";

  const [initialLoading, setInitialLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setInitialLoading(false), 400);
    return () => clearTimeout(t);
  }, []);
  const showLoader = initialLoading || isLoading;

  // Next event from BreakScheduler
  const [nextEvent, setNextEvent] = useState<{ countdown: string; label: string }>({ countdown: "", label: "" });
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ countdown: string; label: string }>;
      if (ce.detail) setNextEvent(ce.detail);
    };
    window.addEventListener("ktb_next_event", handler as EventListener);
    try {
      const stored = localStorage.getItem("ktb_next_event");
      if (stored) setNextEvent(JSON.parse(stored));
    } catch {}
    return () => window.removeEventListener("ktb_next_event", handler as EventListener);
  }, []);

  const handleTabClick = (tab: string) => {
    localStorage.setItem("ktb_active_tab", tab);
    try { window.dispatchEvent(new CustomEvent("ktb_tab_change", { detail: tab })); } catch {}
    setActiveTab(tab);
    // Removed: was causing redirect loop on /settings, /work-schedule, etc.
  };

  // Swipe navigation for mobile
  useSwipeNavigation(activeTab, handleTabClick);

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} toggleCollapsed={() => setSidebarCollapsed(!sidebarCollapsed)} />

      {/* Main Content Wrapper */}
      <div 
        className={cn(
          "flex-1 flex flex-col min-w-0 transition-all duration-300",
          sidebarCollapsed ? "md:ml-16" : "md:ml-64"
        )}
      >
        {/* Mobile Top Bar */}
        <header className="md:hidden border-b border-border glass sticky top-0 z-40">
          <div className="px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {/* Compact Green Tab logo */}
              <div className="relative h-6 w-6 flex items-center justify-center">
                <div className="absolute inset-0 rounded-md bg-green-500/15" />
                <svg viewBox="0 0 28 28" className="h-6 w-6" fill="none">
                  <rect x="4" y="3" width="20" height="22" rx="3" stroke="hsl(142 71% 45%)" strokeWidth="1.5" />
                  <line x1="9" y1="9" x2="19" y2="9" stroke="hsl(142 71% 45%)" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="9" y1="14" x2="16" y2="14" stroke="hsl(142 71% 45%)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <span className="font-orbit text-sm text-green-400">
                Green Tab
              </span>
            </div>
            <div className="flex items-center gap-1">
              {nextEvent.countdown && nextEvent.label && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/8 border border-primary/10 mr-1">
                  <Clock className="h-3 w-3 text-primary" />
                  <span className="text-[10px] font-mono font-bold text-primary">{nextEvent.countdown}</span>
                </div>
              )}
              <Button 
                size="icon" 
                className="h-7 w-7 rounded-lg bg-success/10 text-success hover:bg-success/20 active:scale-90 transition-all"
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent("ktb_quick_rating", { detail: "good" })); } catch {}
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button 
                size="icon" 
                className="h-7 w-7 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-90 transition-all"
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent("ktb_quick_rating", { detail: "bad" })); } catch {}
                }}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between gap-4 px-6 py-3.5 border-b border-border glass sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border-2 border-primary/15 shadow-sm">
              <AvatarFallback className="text-xs font-bold bg-primary/10 text-primary">{initials}</AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-foreground">{name}</div>
              <div className="text-xs text-muted-foreground">{user?.email || ""}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {nextEvent.countdown && nextEvent.label && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/6 border border-primary/10">
                <Clock className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground font-medium">{nextEvent.label}</span>
                <span className="text-sm font-mono font-bold text-primary">{nextEvent.countdown}</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 shadow-sm">
              <Button 
                size="sm" 
                className="h-8 px-3.5 rounded-lg bg-success/10 text-success hover:bg-success/20 active:scale-95 transition-all font-semibold text-xs"
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent("ktb_quick_rating", { detail: "good" })); } catch {}
                }}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Good
              </Button>
              <Button 
                size="sm" 
                className="h-8 px-3.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 active:scale-95 transition-all font-semibold text-xs"
                onClick={() => {
                  try { window.dispatchEvent(new CustomEvent("ktb_quick_rating", { detail: "bad" })); } catch {}
                }}
              >
                <Minus className="mr-1.5 h-3.5 w-3.5" />
                Bad
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors" onClick={signOut}>
              <LogOut className="h-4.5 w-4.5" />
            </Button>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 px-3 py-4 md:px-8 md:py-8 pb-20 md:pb-8 animate-fade-in">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav activeTab={activeTab} onTabClick={handleTabClick} />

      {showLoader && (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-lg z-[60] flex items-center justify-center">
          <div className="flex flex-col items-center gap-6">
            {/* Green Tab Animated Logo */}
            <div className="relative h-20 w-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-xl bg-green-500/10 animate-pulse" style={{animationDuration:'2s'}} />
              <svg viewBox="0 0 56 56" className="h-20 w-20 animate-orbit-pulse" fill="none">
                <rect x="8" y="6" width="40" height="44" rx="6" stroke="hsl(142 71% 45%)" strokeWidth="2" />
                <line x1="18" y1="18" x2="38" y2="18" stroke="hsl(142 71% 45%)" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="28" x2="32" y2="28" stroke="hsl(142 71% 45%)" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="38" x2="26" y2="38" stroke="hsl(142 71% 45%)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="text-center space-y-1">
              <p className="font-orbit text-2xl text-green-400">Green Tab</p>
              <p className="text-xs text-muted-foreground">Loading your workspace…</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}