import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Plus, Users, Trash2, Clock, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

type Employee = Tables<"employees">;
type ProjEmp = Tables<"project_employees">;
type Task = Tables<"tasks">;

export function ManpowerPanel({
  projectId,
  canManage,
  tasks,
}: {
  projectId: string;
  canManage: boolean;
  tasks: Task[];
}) {
  const { user, isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<ProjEmp[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [pickedId, setPickedId] = useState<string>("");
  const [pickedRole, setPickedRole] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const [{ data: emp }, { data: pe }] = await Promise.all([
      supabase.from("employees").select("*").eq("is_active", true).order("full_name"),
      supabase.from("project_employees").select("*").eq("project_id", projectId),
    ]);
    setEmployees(emp ?? []);
    setAssignments(pe ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const assigned = assignments
    .map((a) => ({ assignment: a, employee: employees.find((e) => e.id === a.employee_id) }))
    .filter((x): x is { assignment: ProjEmp; employee: Employee } => !!x.employee);

  const available = employees.filter((e) => !assignments.some((a) => a.employee_id === e.id));

  const tasksFor = (employeeId: string) =>
    tasks.filter((t) => t.employee_id === employeeId).length;

  const addAssignment = async () => {
    if (!user || !pickedId) return;
    const { data, error } = await supabase
      .from("project_employees")
      .insert({ project_id: projectId, employee_id: pickedId, role: pickedRole || null, assigned_by: user.id })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    if (data) setAssignments((a) => [...a, data]);
    setAddOpen(false);
    setPickedId("");
    setPickedRole("");
    toast.success("Employee assigned");
  };

  const removeAssignment = async (id: string) => {
    if (!confirm("Remove this employee from the project?")) return;
    const { error } = await supabase.from("project_employees").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setAssignments((a) => a.filter((x) => x.id !== id));
  };

  const canRemove = canManage || isAdmin;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
          <Users className="w-3.5 h-3.5" /> Project Manpower ({assigned.length})
        </div>
        <div className="flex items-center gap-2">
          <Link to="/employees" className="text-xs text-muted-foreground hover:text-foreground underline">
            Manage employees
          </Link>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddOpen(true)} disabled={available.length === 0}>
            <Plus className="w-3 h-3 mr-1" /> Assign
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : assigned.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded">
          No employees assigned to this project yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {assigned.map(({ assignment, employee }) => {
            const initials = employee.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
            return (
              <Card key={assignment.id} className="p-3 flex items-center gap-3">
                <Avatar className="w-9 h-9">
                  <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{employee.full_name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {assignment.role || employee.position || "—"}
                    <span className="mx-1.5">·</span>
                    <Link2 className="inline w-2.5 h-2.5 mr-0.5" />
                    {tasksFor(employee.id)} task{tasksFor(employee.id) === 1 ? "" : "s"}
                  </div>
                </div>
                <Link
                  to="/dtr"
                  className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  title="View DTR"
                >
                  <Clock className="w-3 h-3" /> DTR
                </Link>
                {canRemove && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeAssignment(assignment.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign employee to project</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select value={pickedId} onValueChange={setPickedId}>
                <SelectTrigger><SelectValue placeholder="Choose employee" /></SelectTrigger>
                <SelectContent>
                  {available.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name} {e.position && <span className="text-muted-foreground">· {e.position}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role on project (optional)</Label>
              <Input value={pickedRole} onChange={(e) => setPickedRole(e.target.value)} placeholder="e.g. Site lead" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button disabled={!pickedId} onClick={addAssignment}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}