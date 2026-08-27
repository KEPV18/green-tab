import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface GenesysTicket {
  id?: string;
  ticketLink: string;
  ratingScore: number;
  customerPhone: string;
  ticketDate: string;
  ticketId?: string;
  channel?: "Phone" | "Chat" | "Email";
  note?: string;
}

interface GenesysTicketFormProps {
  tickets: GenesysTicket[];
  onTicketsChange: (tickets: GenesysTicket[]) => void;
  totalGood?: number;
}

export const GenesysTicketForm = ({ 
  tickets, 
  onTicketsChange, 
  totalGood = 0,
}: GenesysTicketFormProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTicket, setNewTicket] = useState<GenesysTicket>({
    ticketLink: "",
    ratingScore: 7,
    customerPhone: "",
    ticketDate: new Date().toISOString().split('T')[0],
    ticketId: "",
    channel: "Phone",
    note: "",
  });

  const updateTicketInline = (id: string, field: keyof GenesysTicket, value: string | number) => {
    onTicketsChange(
      tickets.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const addTicket = () => {
    if (!newTicket.ticketLink || !newTicket.customerPhone || !newTicket.ratingScore) {
      toast.error("Please fill in all fields");
      return;
    }
    
    if (newTicket.ratingScore < 1 || newTicket.ratingScore > 10) {
      toast.error("Rating score must be between 1 and 10");
      return;
    }
    
    onTicketsChange([...tickets, { ...newTicket, id: crypto.randomUUID() }]);
    setNewTicket({
      ticketLink: "",
      ratingScore: 7,
      customerPhone: "",
      ticketDate: new Date().toISOString().split('T')[0],
      ticketId: "",
      channel: "Phone",
      note: "",
    });
    setDialogOpen(false);
    toast.success("Genesys ticket added successfully!");
  };

  const removeTicket = (id: string) => {
    onTicketsChange(tickets.filter(t => t.id !== id));
    toast.success("Ticket removed");
  };

  

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add Rating Ticket
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Rating Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Ticket Date</label>
              <Input
                type="date"
                value={newTicket.ticketDate}
                onChange={(e) => setNewTicket({ ...newTicket, ticketDate: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Ticket Link</label>
              <Input
                type="url"
                placeholder="https://... (optional)"
                value={newTicket.ticketLink}
                onChange={(e) => setNewTicket({ ...newTicket, ticketLink: e.target.value })}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Rating Score (1-10)</label>
              <Input
                type="number"
                min="1"
                max="10"
                placeholder="7-9 = Good, Others = Bad"
                value={newTicket.ratingScore}
                onChange={(e) => setNewTicket({ ...newTicket, ratingScore: parseInt(e.target.value) || 1 })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Scores 7-9 are considered Good (CSAT), others are Bad (DSAT)
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Customer Phone</label>
              <Input
                type="tel"
                placeholder="Phone number from survey"
                value={newTicket.customerPhone}
                onChange={(e) => setNewTicket({ ...newTicket, customerPhone: e.target.value })}
              />
            </div>
            
            <Button onClick={addTicket} className="w-full">
              <Plus className="mr-2 h-4 w-4" /> Add Rating Ticket
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Genesys Tickets Detail */}
      {tickets.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Genesys Ticket Details</span>
              <Badge variant="secondary" className="text-sm">
                {totalGood} total good
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {tickets.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2">
                  📋 Genesys Ticket Details ({tickets.length} tickets)
                </h4>
                {Object.entries(
                  tickets.reduce((acc, ticket) => {
                    const date = ticket.ticketDate;
                    if (!acc[date]) {
                      acc[date] = { good: 0, bad: 0, tickets: [] };
                    }
                    const isGood = ticket.ratingScore >= 7 && ticket.ratingScore <= 9;
                    if (isGood) acc[date].good++;
                    else acc[date].bad++;
                    acc[date].tickets.push(ticket);
                    return acc;
                  }, {} as Record<string, { good: number; bad: number; tickets: typeof tickets }>)
                )
                  .sort(([dateA], [dateB]) => new Date(dateB).getTime() - new Date(dateA).getTime())
                  .map(([date, data]) => (
                    <Accordion key={date} type="single" collapsible className="mb-2">
                      <AccordionItem value={date}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center justify-between w-full pr-4">
                            <span className="font-medium">
                              {new Date(date).toLocaleDateString('en-US', { 
                                month: 'long', 
                                day: 'numeric', 
                                year: 'numeric' 
                              })}
                            </span>
                            <div className="flex gap-4 text-sm">
                              <span className="text-success font-medium">
                                Good: {data.good}
                              </span>
                              <span className="text-destructive font-medium">
                                Bad: {data.bad}
                              </span>
                              <span className="text-muted-foreground">
                                Total: {data.tickets.length}
                              </span>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-3 pt-2">
                            {data.tickets.map((ticket) => {
                              const isGood = ticket.ratingScore >= 7 && ticket.ratingScore <= 9;
                              return (
                                <div key={ticket.id} className="p-4 border rounded-lg bg-muted/30 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm font-medium px-2 py-1 rounded ${
                                        isGood ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                                      }`}>
                                        Score: {ticket.ratingScore} ({isGood ? "CSAT" : "DSAT"})
                                      </span>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeTicket(ticket.id!)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Genesys Link</label>
                                      <Input
                                        value={ticket.ticketLink}
                                        onChange={(e) => updateTicketInline(ticket.id!, "ticketLink", e.target.value)}
                                        placeholder="https://..."
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Rating Score</label>
                                      <Input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={ticket.ratingScore}
                                        onChange={(e) => updateTicketInline(ticket.id!, "ratingScore", parseInt(e.target.value) || 1)}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Customer Phone</label>
                                      <Input
                                        value={ticket.customerPhone}
                                        onChange={(e) => updateTicketInline(ticket.id!, "customerPhone", e.target.value)}
                                        placeholder="+1234567890"
                                      />
                                    </div>
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ticket ID</label>
                                      <Input
                                        value={ticket.ticketId || ""}
                                        onChange={(e) => updateTicketInline(ticket.id!, "ticketId", e.target.value)}
                                        placeholder="Enter ticket ID..."
                                      />
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Channel</label>
                                      <Select
                                        value={(ticket.channel || "Phone")}
                                        onValueChange={(value) => updateTicketInline(ticket.id!, "channel", value)}
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
                                    <div>
                                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Note</label>
                                      <Input
                                        value={ticket.note || ""}
                                        onChange={(e) => updateTicketInline(ticket.id!, "note", e.target.value)}
                                        placeholder="Optional note..."
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  ))
                }
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
};
