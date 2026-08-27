import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Phone, MessageSquare, Mail, AlertTriangle, CheckCircle } from "lucide-react";

interface SmartRatingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  ratingType: 'good' | 'bad' | null;
  onAddGoodRating: (channel: 'phone' | 'chat' | 'email', isGenesys: boolean, genesysData?: GenesysData) => void;
  onAddBadRating: (ticket: TicketData) => void;
  dailyTargetImpact?: { newTarget: number; compensation: number };
}

interface GenesysData {
  ticketLink: string;
  ratingScore: number;
  customerPhone: string;
}

interface TicketData {
  ticketId: string;
  type: 'DSAT' | 'Karma';
  channel: 'Phone' | 'Chat' | 'Email';
  note: string;
}

type Step = 'initial' | 'genesys-form' | 'channel-select' | 'ticket-form';

export const SmartRatingDialog = ({
  isOpen,
  onClose,
  ratingType,
  onAddGoodRating,
  onAddBadRating,
  dailyTargetImpact,
}: SmartRatingDialogProps) => {
  const [step, setStep] = useState<Step>('initial');
  
  // Genesys form state
  const [ticketLink, setTicketLink] = useState('');
  const [ratingScore, setRatingScore] = useState<number>(9);
  const [customerPhone, setCustomerPhone] = useState('');
  
  // Ticket form state
  const [ticketId, setTicketId] = useState('');
  const [ticketType, setTicketType] = useState<'DSAT' | 'Karma'>('DSAT');
  const [ticketChannel, setTicketChannel] = useState<'Phone' | 'Chat' | 'Email'>('Phone');
  const [ticketNote, setTicketNote] = useState('');

  const resetForm = () => {
    setStep('initial');
    setTicketLink('');
    setRatingScore(9);
    setCustomerPhone('');
    setTicketId('');
    setTicketType('DSAT');
    setTicketChannel('Phone');
    setTicketNote('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleGenesysYes = () => {
    setStep('genesys-form');
  };

  const handleGenesysNo = () => {
    setStep('channel-select');
  };

  const handleChannelSelect = (channel: 'phone' | 'chat' | 'email') => {
    onAddGoodRating(channel, false);
    handleClose();
  };

  const handleGenesysSubmit = () => {
    if (!ticketLink.trim()) return;
    
    onAddGoodRating('phone', true, {
      ticketLink,
      ratingScore,
      customerPhone,
    });
    handleClose();
  };

  const handleTicketSubmit = () => {
    if (!ticketId.trim()) return;
    
    onAddBadRating({
      ticketId,
      type: ticketType,
      channel: ticketChannel,
      note: ticketNote,
    });
    handleClose();
  };

  // For bad ratings, go directly to ticket form
  if (ratingType === 'bad' && step === 'initial') {
    setStep('ticket-form');
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {ratingType === 'good' ? (
              <>
                <CheckCircle className="h-5 w-5 text-success" />
                Add Good Rating
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Add Bad Rating
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Initial Step - Ask if Genesys */}
          {ratingType === 'good' && step === 'initial' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Is this a Genesys rating?
              </p>
              <div className="flex gap-3">
                <Button onClick={handleGenesysYes} className="flex-1">
                  Yes, Genesys
                </Button>
                <Button onClick={handleGenesysNo} variant="outline" className="flex-1">
                  No
                </Button>
              </div>
            </div>
          )}

          {/* Genesys Form */}
          {step === 'genesys-form' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ticketLink">Genesys Link *</Label>
                <Input
                  id="ticketLink"
                  value={ticketLink}
                  onChange={(e) => setTicketLink(e.target.value)}
                  placeholder="https://genesys.com/..."
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ratingScore">Rating Score (7-9 = Good)</Label>
                <Select 
                  value={ratingScore.toString()} 
                  onValueChange={(v) => setRatingScore(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5,6,7,8,9,10].map((score) => (
                      <SelectItem key={score} value={score.toString()}>
                        {score} {score >= 7 && score <= 9 ? '(Good)' : '(Bad)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="customerPhone">Customer Phone</Label>
                <Input
                  id="customerPhone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+1234567890"
                />
              </div>
              
              <div className="flex gap-3">
                <Button onClick={() => setStep('initial')} variant="outline" className="flex-1">
                  Back
                </Button>
                <Button onClick={handleGenesysSubmit} className="flex-1" disabled={!ticketLink.trim()}>
                  Add Rating
                </Button>
              </div>
            </div>
          )}

          {/* Channel Select */}
          {step === 'channel-select' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Select the channel:
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Button 
                  onClick={() => handleChannelSelect('phone')} 
                  variant="outline"
                  className="flex flex-col gap-2 h-auto py-4"
                >
                  <Phone className="h-5 w-5" />
                  <span>Phone</span>
                </Button>
                <Button 
                  onClick={() => handleChannelSelect('chat')} 
                  variant="outline"
                  className="flex flex-col gap-2 h-auto py-4"
                >
                  <MessageSquare className="h-5 w-5" />
                  <span>Chat</span>
                </Button>
                <Button 
                  onClick={() => handleChannelSelect('email')} 
                  variant="outline"
                  className="flex flex-col gap-2 h-auto py-4"
                >
                  <Mail className="h-5 w-5" />
                  <span>Email</span>
                </Button>
              </div>
              <Button onClick={() => setStep('initial')} variant="ghost" className="w-full">
                Back
              </Button>
            </div>
          )}

          {/* Ticket Form for Bad Ratings */}
          {step === 'ticket-form' && (
            <div className="space-y-4">
              {/* Daily Target Impact Warning */}
              {dailyTargetImpact && dailyTargetImpact.compensation > 0 && (
                <div className="bg-warning/10 rounded-lg p-3 border border-warning/20">
                  <div className="flex items-center gap-2 text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm font-medium">Target Impact</span>
                  </div>
                  <p className="text-xs text-warning/80 mt-1">
                    This will affect your daily target. New target: {dailyTargetImpact.newTarget} 
                    (need +{dailyTargetImpact.compensation} to compensate)
                  </p>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="ticketId">Ticket ID *</Label>
                <Input
                  id="ticketId"
                  value={ticketId}
                  onChange={(e) => setTicketId(e.target.value)}
                  placeholder="Enter ticket ID"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ticketType">Type</Label>
                <Select value={ticketType} onValueChange={(v) => setTicketType(v as 'DSAT' | 'Karma')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DSAT">DSAT (Your Bad Rating)</SelectItem>
                    <SelectItem value="Karma">Karma (Team's Bad Rating)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ticketChannel">Channel</Label>
                <Select value={ticketChannel} onValueChange={(v) => setTicketChannel(v as 'Phone' | 'Chat' | 'Email')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Phone">Phone</SelectItem>
                    <SelectItem value="Chat">Chat</SelectItem>
                    <SelectItem value="Email">Email</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="ticketNote">Note (Optional)</Label>
                <Textarea
                  id="ticketNote"
                  value={ticketNote}
                  onChange={(e) => setTicketNote(e.target.value)}
                  placeholder="Add any notes..."
                  rows={2}
                />
              </div>
              
              <Button onClick={handleTicketSubmit} className="w-full" disabled={!ticketId.trim()}>
                Add Bad Rating
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
