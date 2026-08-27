import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronDown, Search, Filter } from "lucide-react";

export interface Ticket {
  id: string;
  ticketId: string;
  type: "DSAT" | "Karma";
  channel: "Phone" | "Chat" | "Email";
  note: string;
}

interface TicketsTableProps {
  tickets: Ticket[];
  onTicketsChange: (tickets: Ticket[]) => void;
}

export const TicketsTable = ({ tickets, onTicketsChange }: TicketsTableProps) => {
  const [isOpen, setIsOpen] = useState(tickets.length > 0);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "DSAT" | "Karma">("ALL");
  const [showAll, setShowAll] = useState(false); // show all tickets toggle
  
  const addTicket = () => {
    const newTicket: Ticket = {
      id: Date.now().toString(),
      ticketId: "",
      type: "DSAT",
      channel: "Chat",
      note: "",
    };
    onTicketsChange([...tickets, newTicket]);
    setIsOpen(true);
  };

  const updateTicket = (id: string, field: keyof Ticket, value: string) => {
    onTicketsChange(
      tickets.map((ticket) =>
        ticket.id === id ? { ...ticket, [field]: value } : ticket
      )
    );
  };

  const deleteTicket = (id: string) => {
    onTicketsChange(tickets.filter((ticket) => ticket.id !== id));
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter(ticket => {
      const matchesSearch = ticket.ticketId.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           ticket.note.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === "ALL" || ticket.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [tickets, searchQuery, filterType]);

  const visibleTickets = showAll ? filteredTickets : filteredTickets.slice(0, 2); // show 2 by default

  const channelStats = () => {
    const total = tickets.length;
    if (total === 0) return null;

    const counts = tickets.reduce((acc, ticket) => {
      acc[ticket.channel] = (acc[ticket.channel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return (
      <div className="mt-4 p-4 bg-muted/50 rounded-xl border border-border">
        <h4 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Filter className="h-4 w-4" /> Channel Distribution
        </h4>
        <div className="grid grid-cols-3 gap-4">
          {(["Phone", "Chat", "Email"] as const).map((channel) => {
            const count = counts[channel] || 0;
            const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
            return (
              <div key={channel} className="text-center p-3 bg-background rounded-lg border shadow-sm">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{channel}</p>
                <p className="text-xl font-bold text-foreground">{percentage}%</p>
                <p className="text-xs text-muted-foreground">({count} tickets)</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card className="p-6 border-border shadow-sm">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="p-0 hover:bg-transparent group">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2 group-hover:text-primary transition-colors">
                Negative Tickets (DSAT & Karma)
                <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
              </h3>
            </Button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2 w-full sm:w-auto">
             <div className="relative flex-1 sm:w-48">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Button onClick={addTicket} size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm">
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
        </div>

        <CollapsibleContent className="space-y-4 animate-slide-down">
          {tickets.length > 0 && (
             <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
               <Badge 
                 variant={filterType === "ALL" ? "default" : "outline"} 
                 className="cursor-pointer"
                 onClick={() => setFilterType("ALL")}
               >
                 All ({tickets.length})
               </Badge>
               <Badge 
                 variant={filterType === "DSAT" ? "destructive" : "outline"} 
                 className="cursor-pointer"
                 onClick={() => setFilterType("DSAT")}
               >
                 DSAT ({tickets.filter(t => t.type === "DSAT").length})
               </Badge>
               <Badge 
                 variant={filterType === "Karma" ? "secondary" : "outline"} 
                 className="cursor-pointer"
                 onClick={() => setFilterType("Karma")}
               >
                 Karma ({tickets.filter(t => t.type === "Karma").length})
               </Badge>
             </div>
          )}

          <div className="space-y-3">
        {visibleTickets.map((ticket) => (
          <div key={ticket.id} className="p-4 bg-muted/30 hover:bg-muted/50 transition-colors rounded-xl border border-border/50 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Ticket ID
                </label>
                <Input
                  placeholder="Enter ticket ID..."
                  value={ticket.ticketId}
                  onChange={(e) => updateTicket(ticket.id, "ticketId", e.target.value)}
                  className="bg-background h-9"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Type</label>
                <Select
                  value={ticket.type}
                  onValueChange={(value) => updateTicket(ticket.id, "type", value)}
                >
                  <SelectTrigger className="bg-background h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DSAT">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-destructive" />
                        DSAT
                      </span>
                    </SelectItem>
                    <SelectItem value="Karma">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-warning" />
                        Karma
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Channel</label>
                <Select
                  value={ticket.channel}
                  onValueChange={(value) => updateTicket(ticket.id, "channel", value)}
                >
                  <SelectTrigger className="bg-background h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Phone">Phone 📞</SelectItem>
                    <SelectItem value="Chat">Chat 💬</SelectItem>
                    <SelectItem value="Email">Email 📧</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-end">
                <Input
                  placeholder="Optional note..."
                  value={ticket.note}
                  onChange={(e) => updateTicket(ticket.id, "note", e.target.value)}
                  className="bg-background h-9"
                />
              </div>
            </div>

            <div className="flex items-center justify-end mt-2">
              <Button
                onClick={() => deleteTicket(ticket.id)}
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 px-3"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        ))}

        {filteredTickets.length > 2 && (
          <div className="text-center mt-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>
              {showAll ? `Show less` : `Show all (${filteredTickets.length})`}
            </Button>
          </div>
        )}
      </div>

      {tickets.length === 0 && (
        <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border">
          <p className="text-lg font-medium mb-1">No tickets recorded</p>
          <p className="text-sm opacity-70">Click "Add" to start tracking negative tickets.</p>
        </div>
      )}
      
      {tickets.length > 0 && filteredTickets.length === 0 && (
         <div className="text-center py-12 text-muted-foreground">
          <p>No tickets match your search.</p>
        </div>
      )}

          {channelStats()}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
