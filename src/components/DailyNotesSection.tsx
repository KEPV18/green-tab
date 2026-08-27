import { safeId } from "@/lib/utils";
import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Save, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const PREFIX = "gt_daily_notes_";

interface DailyNote {
  id: string;
  text: string;
  createdAt: string;
}

function readNotes(userId: string, performanceId: string | null): DailyNote[] {
  try {
    const key = performanceId ? `${PREFIX}${userId}_${performanceId}` : `${PREFIX}${userId}_active`;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function writeNotes(userId: string, performanceId: string | null, notes: DailyNote[]): void {
  try {
    const key = performanceId ? `${PREFIX}${userId}_${performanceId}` : `${PREFIX}${userId}_active`;
    localStorage.setItem(key, JSON.stringify(notes));
  } catch {}
}

interface DailyNotesSectionProps {
  performanceId: string | null;
}

export const DailyNotesSection = ({ performanceId }: DailyNotesSectionProps) => {
  const { user } = useAuth();
  const userId = user?.id || "local";
  const [notes, setNotes] = useState<DailyNote[]>([]);
  const [newNote, setNewNote] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setNotes(readNotes(userId, performanceId));
  }, [userId, performanceId]);

  const addNote = () => {
    if (!newNote.trim()) return;
    const note: DailyNote = {
      id: safeId(),
      text: newNote.trim(),
      createdAt: new Date().toISOString(),
    };
    const updated = [note, ...notes];
    setNotes(updated);
    writeNotes(userId, performanceId, updated);
    setNewNote("");
    toast.success("Note added");
  };

  const deleteNote = (id: string) => {
    const updated = notes.filter(n => n.id !== id);
    setNotes(updated);
    writeNotes(userId, performanceId, updated);
    toast.success("Note deleted");
  };

  const startEdit = (note: DailyNote) => {
    setEditingId(note.id);
    setEditText(note.text);
  };

  const saveEdit = (id: string) => {
    if (!editText.trim()) return;
    const updated = notes.map(n => n.id === id ? { ...n, text: editText.trim() } : n);
    setNotes(updated);
    writeNotes(userId, performanceId, updated);
    setEditingId(null);
    setEditText("");
    toast.success("Note updated");
  };

  return (
    <Card className="p-4 border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="flex items-center gap-2 mb-3">
        <StickyNote className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          Daily Notes
        </h3>
      </div>

      <div className="flex gap-2 mb-3">
        <Textarea
          ref={textareaRef}
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note..."
          className="min-h-[60px] resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              addNote();
            }
          }}
        />
        <Button onClick={addNote} size="sm" className="h-auto">
          <Save className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2 max-h-[200px] overflow-y-auto">
        {notes.map((note) => (
          <div key={note.id} className="p-2 bg-muted/30 rounded-lg border border-border/50 group">
            {editingId === note.id ? (
              <div className="flex gap-2">
                <Textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="min-h-[40px] resize-none text-xs"
                />
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveEdit(note.id)}>
                    <Save className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <p className="text-xs flex-1 whitespace-pre-wrap">{note.text}</p>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {new Date(note.createdAt).toLocaleDateString()}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => startEdit(note)}>
                    <StickyNote className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => deleteNote(note.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {notes.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">No notes yet</p>
        )}
      </div>
    </Card>
  );
};