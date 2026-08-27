import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, ListChecks, NotebookText, MoreHorizontal, Calendar, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const HOME_TABS = [
  { tab: "overview", label: "Overview", icon: BarChart3 },
  { tab: "tickets", label: "Tickets", icon: ListChecks },
  { tab: "analytics", label: "Analytics", icon: BarChart3 },
  { tab: "notes", label: "Notes", icon: NotebookText },
];

interface MobileBottomNavProps {
  activeTab: string;
  onTabClick: (tab: string) => void;
}

export function MobileBottomNav({ activeTab, onTabClick }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const isOnHome = location.pathname === "/";

  const handleTabClick = (tab: string) => {
    if (!isOnHome) navigate("/");
    onTabClick(tab);
  };

  const moreLinks = [
    { label: "Work Schedule", icon: Calendar, href: "/work-schedule" },
    { label: "Settings", icon: Settings, href: "/settings" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around px-1 py-1.5">
        {/* Home tabs */}
        {HOME_TABS.map((item) => {
          const Icon = item.icon;
          const isActive = isOnHome && activeTab === item.tab;
          return (
            <button
              key={item.tab}
              onClick={() => handleTabClick(item.tab)}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-xl transition-all duration-200 min-w-0 flex-1 active:scale-90",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-200",
                isActive && "bg-primary/12 shadow-[0_0_12px_hsl(var(--primary)/0.15)]"
              )}>
                <Icon className={cn("h-[18px] w-[18px] transition-all", isActive && "text-primary")} />
              </div>
              <span className={cn(
                "text-[9px] font-medium truncate transition-all",
                isActive ? "text-primary font-bold" : ""
              )}>{item.label}</span>
            </button>
          );
        })}

        {/* More button */}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center gap-0.5 py-1.5 px-1 rounded-xl transition-all duration-200 min-w-0 flex-1 active:scale-90",
                !isOnHome ? "text-primary" : "text-muted-foreground"
              )}
            >
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-xl transition-all duration-200",
                !isOnHome && "bg-primary/12"
              )}>
                <MoreHorizontal className="h-[18px] w-[18px]" />
              </div>
              <span className="text-[9px] font-medium">More</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl border-t border-border bg-card px-4 pb-8 pt-3">
            <div className="w-10 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-5" />
            <div className="space-y-1.5">
              {moreLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.href;
                return (
                  <Link key={link.href} to={link.href} onClick={() => setMoreOpen(false)}>
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-3 h-12 rounded-2xl text-sm font-medium transition-all",
                        isActive
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      <div className={cn(
                        "p-2 rounded-xl",
                        isActive ? "bg-primary/15" : "bg-muted"
                      )}>
                        <Icon className="h-4 w-4" />
                      </div>
                      {link.label}
                    </Button>
                  </Link>
                );
              })}
              
              <div className="h-px bg-border my-3" />
              
              <Button
                variant="ghost"
                className="w-full justify-start gap-3 h-12 rounded-2xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-all"
                onClick={() => { setMoreOpen(false); signOut(); }}
              >
                <div className="p-2 rounded-xl bg-destructive/10">
                  <LogOut className="h-4 w-4" />
                </div>
                Sign Out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
