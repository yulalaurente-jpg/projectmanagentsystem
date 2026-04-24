import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Clock, Trash2, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

type DTR = Tables<"daily_time_records">;
type Employee = Tables<"employees">;
type Project = Tables<"projects">;
type Task = Tables<"tasks">;
type DStatus = Enums<"dtr_status">;

export const Route = createFileRoute("/dtr")({
  head: () => ({ meta: [{ title: "Daily Time Records — Trackr" }, { name: "description", content: "Time-in/out, breaks, overtime and approval per employee." }] }),
  component: () => (<RequireAuth><AppLayout><DTRPage /></AppLayout></RequireAuth>),
});

const STATUS_META: Record<DStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#f59e0b" },
  approved: { label: "Approved", color: "#10b981" },
  rejected: { label: "Rejected", color: "#ef4444" },
};

function DTRPage() {
  const { user, isAdmin } = useAuth();
  const [records, setRecords] = useState<DTR[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [open, setOpen] = useState(false);
  const [filterEmp, setFilterEmp] = useState<string>("all");
  const [filterProj, setFilterProj] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: r }, { data: e }, { data: p }, { data: t }] = await Promise.all([
      supabase.from("daily_time_records").select("*").order("work_date", { ascending: false }).limit(500),
      supabase.from("employees").select("*").order("full_name"),
      supabase.from("projects").select("*"),
      supabase.from("tasks").select("*"),
    ]);
    setRecords(r ?? []); setEmployees(e ?? []); setProjects(p ?? []); setTasks(t ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const empName = (id: string) => employees.find((e) => e.id === id)?.full_name ?? "—";
  const projName = (id: string | null) => id ? projects.find((p) => p.id === id)?.name ?? "—" : "—";

  const filtered = useMemo(() =>
    records.filter((r) =>
      (filterEmp === "all" || r.employee_id === filterEmp) &&
      (filterProj === "all" || r.project_id === filterProj),
    ), [records, filterEmp, filterProj]);

  const create = async (input: Partial<DTR> & { employee_id: string; work_date: string }) => {
    if (!user) return;
    const total = computeHours(input);
    const { data, error } = await supabase
      .from("daily_time_records")
      .insert({ ...input, total_hours: total, created_by: user.id })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    if (data) setRecords((rs) => [data, ...rs]);
    setOpen(false);
    toast.success("Time record added");
  };

  const setStatus = async (id: string, status: DStatus) => {
    const patch: Partial<DTR> = { status };
    if (status === "approved") { patch.approved_by = user?.id ?? null; patch.approved_at = new Date().toISOString(); }
    const { error } = await supabase.from("daily_time_records").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRecords((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } as DTR : r));
  };

  const del = async (id: string) => {
    if (!confirm("Delete this DTR entry?")) return;
    const { error } = await supabase.from("daily_time_records").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRecords((rs) => rs.filter((r) => r.id !== id));
  };

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center justify-between bg-card">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4" />
          <h1 className="text-base font-semibold tracking-tight">Daily Time Records</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterEmp} onValueChange={setFilterEmp}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All employees</SelectItem>
              {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterProj} onValueChange={setFilterProj}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setOpen(true)} disabled={employees.length === 0}>
            <Plus className="w-4 h-4 mr-1.5" /> New entry
          </Button>
        </div>
      </header>
      <div className="p-6">
        <Card>
          {loading ? (
            <div className="p-8 text-sm text-muted-foreground text-center">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No time records yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Break</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead className="text-right">Hrs</TableHead>
                  <TableHead className="text-right">OT</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const m = STATUS_META[r.status];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.work_date}</TableCell>
                      <TableCell className="font-medium text-sm">{empName(r.employee_id)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{projName(r.project_id)}</TableCell>
                      <TableCell className="text-xs">{fmtTime(r.time_in)}</TableCell>
                      <TableCell className="text-xs">{fmtTime(r.break_out)}–{fmtTime(r.break_in)}</TableCell>
                      <TableCell className="text-xs">{fmtTime(r.time_out)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.total_hours ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{Number(r.overtime_hours)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: `${m.color}1f`, color: m.color }}>
                          {m.label}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-0.5">
                          {(isAdmin || r.created_by === user?.id) && r.status === "pending" && (
                            <>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => setStatus(r.id, "approved")}><CheckCircle2 className="w-3.5 h-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setStatus(r.id, "rejected")}><XCircle className="w-3.5 h-3.5" /></Button>
                            </>
                          )}
                          {(isAdmin || r.created_by === user?.id) && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => del(r.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <DTRDialog open={open} onOpenChange={setOpen} employees={employees} projects={projects} tasks={tasks} onSave={create} />
    </>
  );
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function computeHours(input: Partial<DTR>) {
  if (!input.time_in || !input.time_out) return null;
  const start = new Date(input.time_in).getTime();
  const end = new Date(input.time_out).getTime();
  let breakMs = 0;
  if (input.break_out && input.break_in) {
    breakMs = new Date(input.break_in).getTime() - new Date(input.break_out).getTime();
  }
  const totalMs = end - start - Math.max(0, breakMs);
  return Math.round((totalMs / 3600000) * 100) / 100;
}

function DTRDialog({ open, onOpenChange, employees, projects, tasks, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: Employee[];
  projects: Project[];
  tasks: Task[];
  onSave: (input: Partial<DTR> & { employee_id: string; work_date: string }) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState("");
  const [projectId, setProjectId] = useState<string>("none");
  const [taskId, setTaskId] = useState<string>("none");
  const [date, setDate] = useState(today);
  const [tIn, setTIn] = useState("08:00");
  const [bOut, setBOut] = useState("12:00");
  const [bIn, setBIn] = useState("13:00");
  const [tOut, setTOut] = useState("17:00");
  const [ot, setOt] = useState("0");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setEmployeeId(""); setProjectId("none"); setTaskId("none"); setDate(today);
      setTIn("08:00"); setBOut("12:00"); setBIn("13:00"); setTOut("17:00"); setOt("0"); setNotes("");
    }
  }, [open]);

  const toIso = (t: string) => t ? new Date(`${date}T${t}:00`).toISOString() : null;
  const projTasks = tasks.filter((t) => projectId !== "none" && t.project_id === projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New time record</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Employee *</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Project</Label>
              <Select value={projectId} onValueChange={(v) => { setProjectId(v); setTaskId("none"); }}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Task</Label>
              <Select value={taskId} onValueChange={setTaskId} disabled={projectId === "none"}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projTasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <div><Label>Time in</Label><Input type="time" value={tIn} onChange={(e) => setTIn(e.target.value)} /></div>
            <div><Label>Break out</Label><Input type="time" value={bOut} onChange={(e) => setBOut(e.target.value)} /></div>
            <div><Label>Break in</Label><Input type="time" value={bIn} onChange={(e) => setBIn(e.target.value)} /></div>
            <div><Label>Time out</Label><Input type="time" value={tOut} onChange={(e) => setTOut(e.target.value)} /></div>
          </div>
          <div>
            <Label>Overtime hours</Label>
            <Input type="number" step="0.25" value={ot} onChange={(e) => setOt(e.target.value)} />
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!employeeId} onClick={() => onSave({
            employee_id: employeeId,
            work_date: date,
            project_id: projectId === "none" ? null : projectId,
            task_id: taskId === "none" ? null : taskId,
            time_in: toIso(tIn),
            break_out: toIso(bOut),
            break_in: toIso(bIn),
            time_out: toIso(tOut),
            overtime_hours: parseFloat(ot) || 0,
            notes: notes.trim() || null,
          })}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}