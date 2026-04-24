import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Plus, Trash2, Send, ListTree } from "lucide-react";
import { StatusBadge, PriorityBadge, AssigneeAvatar } from "@/components/TaskBadges";
import { toast } from "sonner";
import { ChecklistPanel } from "@/components/ChecklistPanel";

type Task = Tables<"tasks">;
type Profile = Tables<"profiles">;
type Employee = Tables<"employees">;
type Comment = Tables<"task_comments">;

export function TaskDialog({
  task,
  projectKey,
  profiles,
  employees,
  subtasks,
  onClose,
  onUpdate,
  onDelete,
  onAddSubtask,
}: {
  task: Task | null;
  projectKey: string;
  profiles: Profile[];
  employees?: Employee[];
  subtasks: Task[];
  onClose: () => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddSubtask: (parentId: string) => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      loadComments();
    }
  }, [task?.id]);

  const loadComments = async () => {
    if (!task) return;
    const { data } = await supabase.from("task_comments").select("*").eq("task_id", task.id).order("created_at");
    setComments(data ?? []);
  };

  const saveTitle = async () => {
    if (!task || title === task.title) return;
    await onUpdate(task.id, { title });
  };
  const saveDescription = async () => {
    if (!task || description === (task.description ?? "")) return;
    await onUpdate(task.id, { description });
  };

  const addComment = async () => {
    if (!task || !user || !newComment.trim()) return;
    const { data, error } = await supabase
      .from("task_comments")
      .insert({ task_id: task.id, user_id: user.id, content: newComment.trim() })
      .select()
      .single();
    if (error) return toast.error(error.message);
    if (data) setComments((c) => [...c, data]);
    setNewComment("");
  };

  const deleteComment = async (id: string) => {
    const { error } = await supabase.from("task_comments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setComments((c) => c.filter((x) => x.id !== id));
  };

  if (!task) return null;

  return (
    <Sheet open={!!task} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            {projectKey} · {task.id.slice(0, 8)}
          </div>
          <SheetTitle className="sr-only">Task details</SheetTitle>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            className="text-lg font-semibold border-0 px-0 shadow-none focus-visible:ring-0 h-auto"
          />
        </SheetHeader>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-6 mt-4">
          <div className="space-y-6 min-w-0">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={saveDescription}
                rows={5}
                placeholder="Add a description…"
                className="mt-1.5"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ListTree className="w-3.5 h-3.5" /> Subtasks ({subtasks.length})
                </Label>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => onAddSubtask(task.id)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add subtask
                </Button>
              </div>
              {subtasks.length === 0 ? (
                <div className="text-xs text-muted-foreground py-2">No subtasks.</div>
              ) : (
                <div className="space-y-1 border border-border rounded">
                  {subtasks.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 p-2 text-sm hover:bg-accent/40">
                      <StatusBadge status={s.status} />
                      <span className="flex-1 truncate">{s.title}</span>
                      <PriorityBadge priority={s.priority} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            <ChecklistPanel scope="task" scopeId={task.id} profiles={profiles} />

            <Separator />

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Comments ({comments.length})</Label>
              <div className="space-y-3 mt-2">
                {comments.map((c) => {
                  const author = profiles.find((p) => p.id === c.user_id);
                  return (
                    <div key={c.id} className="flex gap-2.5">
                      <AssigneeAvatar profile={author} />
                      <div className="flex-1 min-w-0 bg-muted/50 rounded p-2.5">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium">{author?.display_name ?? "Unknown"}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</span>
                            {c.user_id === user?.id && (
                              <button onClick={() => deleteComment(c.id)} className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm whitespace-pre-wrap break-words">{c.content}</p>
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-2">
                  <Textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment…"
                    rows={2}
                    className="text-sm"
                  />
                  <Button size="icon" onClick={addComment} disabled={!newComment.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <aside className="space-y-4 text-sm">
            <Field label="Status">
              <Select value={task.status} onValueChange={(v) => onUpdate(task.id, { status: v as Enums<"task_status"> })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={task.priority} onValueChange={(v) => onUpdate(task.id, { priority: v as Enums<"task_priority"> })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Assignee">
              <Select
                value={task.assignee_id ?? "none"}
                onValueChange={(v) => onUpdate(task.id, { assignee_id: v === "none" ? null : v })}
              >
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.display_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {employees && employees.length > 0 && (
              <Field label="Project employee">
                <Select
                  value={task.employee_id ?? "none"}
                  onValueChange={(v) => onUpdate(task.id, { employee_id: v === "none" ? null : v })}
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}{e.position ? ` · ${e.position}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Field label="Due date">
              <Input
                type="date"
                className="h-8"
                value={task.due_date ? task.due_date.slice(0, 10) : ""}
                onChange={(e) => onUpdate(task.id, { due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </Field>
            <Field label="Start date">
              <Input
                type="date"
                className="h-8"
                value={task.start_date ? task.start_date.slice(0, 10) : ""}
                onChange={(e) => onUpdate(task.id, { start_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
              />
            </Field>
            <Field label="Labels">
              <Input
                className="h-8"
                defaultValue={(task.labels ?? []).join(", ")}
                onBlur={(e) => onUpdate(task.id, { labels: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                placeholder="comma, separated"
              />
              {(task.labels?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {task.labels?.map((l) => (
                    <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground">{l}</span>
                  ))}
                </div>
              )}
            </Field>
            <Separator />
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Created {new Date(task.created_at).toLocaleString()}</div>
              <div>Updated {new Date(task.updated_at).toLocaleString()}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={() => { if (confirm("Delete this task?")) { onDelete(task.id); onClose(); } }}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete task
            </Button>
          </aside>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}