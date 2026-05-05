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
import { Plus, ClipboardList, Trash2, CheckCircle2, XCircle, ArrowLeft, Search, Briefcase, X, Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";

type DTR = Tables<"daily_time_records">;
type Employee = Tables<"employees">;
type Project = Tables<"projects">;
type Task = Tables<"tasks">;
type DStatus = Enums<"dtr_status">;

export const Route = createFileRoute("/dtr")({
  head: () => ({ meta: [{ title: "Daily Job Records — Trackr" }, { name: "description", content: "Per-person daily job log: time-in/out, breaks, overtime, projects, tasks and approval." }] }),
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
  const [filterProj, setFilterProj] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [selectedEmp, setSelectedEmp] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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

  const projName = (id: string | null) => id ? projects.find((p) => p.id === id)?.name ?? "—" : "—";
  const taskName = (id: string | null) => id ? tasks.find((t) => t.id === id)?.title ?? "—" : "—";
  const selectedEmployee = employees.find((e) => e.id === selectedEmp) ?? null;

  const empStats = useMemo(() => {
    const map = new Map<string, { count: number; hours: number; lastDate: string | null; pending: number }>();
    for (const r of records) {
      const m = map.get(r.employee_id) ?? { count: 0, hours: 0, lastDate: null, pending: 0 };
      m.count += 1;
      m.hours += Number(r.total_hours ?? 0);
      if (!m.lastDate || r.work_date > m.lastDate) m.lastDate = r.work_date;
      if (r.status === "pending") m.pending += 1;
      map.set(r.employee_id, m);
    }
    return map;
  }, [records]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((e) => !q || e.full_name.toLowerCase().includes(q) || (e.position ?? "").toLowerCase().includes(q));
  }, [employees, search]);

  const personRecords = useMemo(() =>
    records.filter((r) =>
      r.employee_id === selectedEmp &&
      (filterProj === "all" || r.project_id === filterProj),
    ), [records, selectedEmp, filterProj]);

  const personSummary = useMemo(() => {
    const totalHrs = personRecords.reduce((s, r) => s + Number(r.total_hours ?? 0), 0);
    const totalOt = personRecords.reduce((s, r) => s + Number(r.overtime_hours ?? 0), 0);
    const approved = personRecords.filter((r) => r.status === "approved").length;
    const pending = personRecords.filter((r) => r.status === "pending").length;
    return { totalHrs, totalOt, approved, pending, count: personRecords.length };
  }, [personRecords]);

  const create = async (inputs: Array<Partial<DTR> & { employee_id: string; work_date: string }>) => {
    if (!user || inputs.length === 0) return;
    const rows = inputs.map((i) => ({ ...i, total_hours: computeHours(i), created_by: user.id }));
    const { data, error } = await supabase
      .from("daily_time_records")
      .insert(rows)
      .select();
    if (error) { toast.error(error.message); return; }
    if (data) setRecords((rs) => [...data, ...rs]);
    setOpen(false);
    toast.success(`${data?.length ?? 0} job record${(data?.length ?? 0) === 1 ? "" : "s"} added`);
  };

  const setStatus = async (id: string, status: DStatus) => {
    const patch: Partial<DTR> = { status };
    if (status === "approved") { patch.approved_by = user?.id ?? null; patch.approved_at = new Date().toISOString(); }
    const { error } = await supabase.from("daily_time_records").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRecords((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } as DTR : r));
  };

  const del = async (id: string) => {
    if (!confirm("Delete this job record?")) return;
    const { error } = await supabase.from("daily_time_records").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRecords((rs) => rs.filter((r) => r.id !== id));
  };

  // ── PERSON LIST VIEW ──
  if (!selectedEmp) {
    return (
      <>
        <header className="h-14 border-b border-border px-6 flex items-center justify-between bg-card">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            <h1 className="text-base font-semibold tracking-tight">Daily Job Records</h1>
            <span className="text-xs text-muted-foreground ml-2">— pick a person to open their log</span>
          </div>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search person…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 pl-8 w-[240px] text-xs" />
          </div>
        </header>
        <div className="p-6">
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : employees.length === 0 ? (
            <Card className="p-12 text-center">
              <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
              <h2 className="text-base font-semibold">No employees yet</h2>
              <p className="text-sm text-muted-foreground">Add employees first to start logging daily jobs.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredEmployees.map((emp) => {
                const s = empStats.get(emp.id) ?? { count: 0, hours: 0, lastDate: null, pending: 0 };
                const initials = emp.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <Card key={emp.id} onClick={() => setSelectedEmp(emp.id)} className="group p-5 cursor-pointer hover:border-primary/60 hover:-translate-y-0.5 hover:shadow-lg transition-all">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground font-semibold flex items-center justify-center text-sm shrink-0">{initials || "?"}</div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{emp.full_name}</div>
                        <div className="text-xs text-muted-foreground truncate">{emp.position ?? "—"}</div>
                      </div>
                      {s.pending > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600">{s.pending} pending</span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-border/60 text-center">
                      <div>
                        <div className="text-base font-semibold tabular-nums">{s.count}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Logs</div>
                      </div>
                      <div>
                        <div className="text-base font-semibold tabular-nums">{s.hours.toFixed(1)}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hours</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium tabular-nums">{s.lastDate ?? "—"}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Last</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
              {filteredEmployees.length === 0 && (
                <div className="col-span-full text-center text-sm text-muted-foreground py-12">No employees match "{search}".</div>
              )}
            </div>
          )}
        </div>
      </>
    );
  }

  // ── PERSON DETAIL VIEW ──
  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center justify-between bg-card">
        <div className="flex items-center gap-2 min-w-0">
          <Button size="sm" variant="ghost" onClick={() => setSelectedEmp(null)} className="h-8 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-1" /> All people
          </Button>
          <span className="text-muted-foreground/40">/</span>
          <ClipboardList className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-base font-semibold tracking-tight truncate">{selectedEmployee?.full_name}</h1>
          {selectedEmployee?.position && (
            <span className="text-xs text-muted-foreground truncate">— {selectedEmployee.position}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterProj} onValueChange={setFilterProj}>
            <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> New job entry
          </Button>
        </div>
      </header>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryStat label="Total entries" value={String(personSummary.count)} />
          <SummaryStat label="Total hours" value={personSummary.totalHrs.toFixed(1)} />
          <SummaryStat label="Overtime" value={personSummary.totalOt.toFixed(1)} />
          <SummaryStat label="Pending approval" value={String(personSummary.pending)} accent={personSummary.pending > 0 ? "#f59e0b" : undefined} />
        </div>
        <Card>
          {loading ? (
            <div className="p-8 text-sm text-muted-foreground text-center">Loading…</div>
          ) : personRecords.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No job records for {selectedEmployee?.full_name} yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Task</TableHead>
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
                {personRecords.map((r) => {
                  const m = STATUS_META[r.status];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.work_date}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{projName(r.project_id)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{taskName(r.task_id)}</TableCell>
                      <TableCell className="text-xs">{fmtTime(r.time_in)}</TableCell>
                      <TableCell className="text-xs">{fmtTime(r.break_out)}–{fmtTime(r.break_in)}</TableCell>
                      <TableCell className="text-xs">{fmtTime(r.time_out)}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.total_hours ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{Number(r.overtime_hours)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: `${m.color}1f`, color: m.color }}>{m.label}</span>
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

      <DTRDialog open={open} onOpenChange={setOpen} employees={employees} lockedEmployeeId={selectedEmp} projects={projects} tasks={tasks} onSave={create} />
    </>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-0.5" style={accent ? { color: accent } : undefined}>{value}</div>
    </Card>
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

function DTRDialog({ open, onOpenChange, employees, lockedEmployeeId, projects, tasks, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: Employee[];
  lockedEmployeeId?: string | null;
  projects: Project[];
  tasks: Task[];
  onSave: (inputs: Array<Partial<DTR> & { employee_id: string; work_date: string }>) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(today);
  type EntryRow = {
    projectId: string; taskId: string;
    tIn: string; bOut: string; bIn: string; tOut: string;
    ot: string; notes: string;
  };
  const blankEntry = (): EntryRow => ({
    projectId: "none", taskId: "none",
    tIn: "08:00", bOut: "12:00", bIn: "13:00", tOut: "17:00",
    ot: "0", notes: "",
  });
  const [entries, setEntries] = useState<EntryRow[]>([blankEntry()]);

  useEffect(() => {
    if (open) {
      setEmployeeId(lockedEmployeeId ?? "");
      setDate(today);
      setEntries([blankEntry()]);
    }
  }, [open, lockedEmployeeId, today]);

  const toIso = (t: string) => t ? new Date(`${date}T${t}:00`).toISOString() : null;
  const lockedEmployee = employees.find((e) => e.id === lockedEmployeeId);
  const updateEntry = (i: number, patch: Partial<EntryRow>) =>
    setEntries((es) => es.map((e, idx) => idx === i ? { ...e, ...patch } : e));
  const removeEntry = (i: number) =>
    setEntries((es) => es.length > 1 ? es.filter((_, idx) => idx !== i) : es);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New job entries{lockedEmployee ? ` — ${lockedEmployee.full_name}` : ""}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Employee *</Label>
              <Select value={employeeId} onValueChange={setEmployeeId} disabled={!!lockedEmployeeId}>
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

          <div className="space-y-3">
            {entries.map((entry, i) => {
              const projTasks = tasks.filter((t) => entry.projectId !== "none" && t.project_id === entry.projectId);
              return (
                <Card key={i} className="p-3 space-y-3 relative bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Entry #{i + 1}</span>
                    {entries.length > 1 && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeEntry(i)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Project</Label>
                      <Select value={entry.projectId} onValueChange={(v) => updateEntry(i, { projectId: v, taskId: "none" })}>
                        <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Job / Task</Label>
                      <Select value={entry.taskId} onValueChange={(v) => updateEntry(i, { taskId: v })} disabled={entry.projectId === "none"}>
                        <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {projTasks.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div><Label className="text-xs">Time in</Label><Input type="time" value={entry.tIn} onChange={(e) => updateEntry(i, { tIn: e.target.value })} /></div>
                    <div><Label className="text-xs">Break out</Label><Input type="time" value={entry.bOut} onChange={(e) => updateEntry(i, { bOut: e.target.value })} /></div>
                    <div><Label className="text-xs">Break in</Label><Input type="time" value={entry.bIn} onChange={(e) => updateEntry(i, { bIn: e.target.value })} /></div>
                    <div><Label className="text-xs">Time out</Label><Input type="time" value={entry.tOut} onChange={(e) => updateEntry(i, { tOut: e.target.value })} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Overtime hrs</Label>
                      <Input type="number" step="0.25" value={entry.ot} onChange={(e) => updateEntry(i, { ot: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={1} value={entry.notes} onChange={(e) => updateEntry(i, { notes: e.target.value })} placeholder="What was accomplished?" />
                    </div>
                  </div>
                </Card>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => setEntries((es) => [...es, blankEntry()])}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Add another project entry
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!employeeId} onClick={() => onSave(entries.map((entry) => ({
            employee_id: employeeId,
            work_date: date,
            project_id: entry.projectId === "none" ? null : entry.projectId,
            task_id: entry.taskId === "none" ? null : entry.taskId,
            time_in: toIso(entry.tIn),
            break_out: toIso(entry.bOut),
            break_in: toIso(entry.bIn),
            time_out: toIso(entry.tOut),
            overtime_hours: parseFloat(entry.ot) || 0,
            notes: entry.notes.trim() || null,
          })))}>Save {entries.length > 1 ? `(${entries.length})` : ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
