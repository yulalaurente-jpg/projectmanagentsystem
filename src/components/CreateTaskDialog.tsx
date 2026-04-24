import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Tables, Enums } from "@/integrations/supabase/types";

export function CreateTaskDialog({
  open,
  onOpenChange,
  profiles,
  employees,
  parentTaskId,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: Tables<"profiles">[];
  employees?: Tables<"employees">[];
  parentTaskId: string | null;
  onCreate: (input: {
    title: string;
    description: string;
    status: Enums<"task_status">;
    priority: Enums<"task_priority">;
    assignee_id: string | null;
    employee_id: string | null;
    due_date: string | null;
    start_date: string | null;
    labels: string[];
    parent_task_id: string | null;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Enums<"task_status">>("todo");
  const [priority, setPriority] = useState<Enums<"task_priority">>("medium");
  const [assignee, setAssignee] = useState<string>("none");
  const [employee, setEmployee] = useState<string>("none");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [labelsStr, setLabelsStr] = useState("");

  useEffect(() => {
    if (open) {
      setTitle(""); setDescription(""); setStatus("todo"); setPriority("medium");
      setAssignee("none"); setEmployee("none"); setDueDate(""); setStartDate(""); setLabelsStr("");
    }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate({
      title: title.trim(),
      description,
      status,
      priority,
      assignee_id: assignee === "none" ? null : assignee,
      employee_id: employee === "none" ? null : employee,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      labels: labelsStr.split(",").map((s) => s.trim()).filter(Boolean),
      parent_task_id: parentTaskId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{parentTaskId ? "New subtask" : "New task"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Enums<"task_status">)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="in_review">In Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Enums<"task_priority">)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.display_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Due</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Labels (comma-separated)</Label>
            <Input value={labelsStr} onChange={(e) => setLabelsStr(e.target.value)} placeholder="bug, frontend" />
          </div>
          {employees && employees.length > 0 && (
            <div className="space-y-1.5">
              <Label>Project employee</Label>
              <Select value={employee} onValueChange={setEmployee}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}{e.position ? ` · ${e.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}