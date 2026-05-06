import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Note = Tables<"project_notes">;
type Profile = Tables<"profiles">;

export function NotesPanel({ projectId, profiles }: { projectId: string; profiles: Profile[] }) {
  const { user, isAdmin } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const p = profileMap.get(id);
    return p?.display_name || p?.email?.split("@")[0] || "User";
  };

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("project_notes")
      .select("*")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false });
    setNotes(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const create = async () => {
    if (!user || !title.trim()) return;
    const { data, error } = await supabase
      .from("project_notes")
      .insert({ project_id: projectId, title: title.trim(), content, created_by: user.id })
      .select()
      .single();
    if (error) return toast.error(error.message);
    if (data) setNotes((prev) => [data, ...prev]);
    setTitle("");
    setContent("");
    setCreating(false);
    toast.success("Note added");
  };

  const startEdit = (n: Note) => {
    setEditingId(n.id);
    setEditTitle(n.title);
    setEditContent(n.content);
  };

  const saveEdit = async (id: string) => {
    const { error } = await supabase
      .from("project_notes")
      .update({ title: editTitle, content: editContent })
      .eq("id", id);
    if (error) return toast.error(error.message);
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, title: editTitle, content: editContent, updated_at: new Date().toISOString() } : n)),
    );
    setEditingId(null);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("project_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const canEdit = (n: Note) => !!user && (isAdmin || n.created_by === user.id);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{notes.length} note{notes.length === 1 ? "" : "s"}</div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> New note
          </Button>
        )}
      </div>

      {creating && (
        <Card className="p-3 space-y-2">
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <Textarea
            placeholder="Write a note…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setTitle(""); setContent(""); }}>
              Cancel
            </Button>
            <Button size="sm" onClick={create} disabled={!title.trim()}>Save</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : notes.length === 0 && !creating ? (
        <div className="text-sm text-muted-foreground py-6 text-center">No notes yet.</div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {notes.map((n) => (
            <Card key={n.id} className="p-3 space-y-2">
              {editingId === n.id ? (
                <>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={4} />
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="w-4 h-4" />
                    </Button>
                    <Button size="sm" onClick={() => saveEdit(n.id)}>
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-semibold text-sm">{n.title}</h4>
                    {canEdit(n) && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(n)}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => remove(n.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {n.content && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{n.content}</p>}
                  <div className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                    {nameOf(n.created_by)} · {formatDistanceToNow(new Date(n.updated_at), { addSuffix: true })}
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}