import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Users, Trash2, Pencil, Clock } from "lucide-react";
import { toast } from "sonner";

type Employee = Tables<"employees">;

export const Route = createFileRoute("/employees")({
  head: () => ({ meta: [{ title: "Employees — Trackr" }, { name: "description", content: "Global employee directory and project assignments." }] }),
  component: () => (<RequireAuth><AppLayout><EmployeesPage /></AppLayout></RequireAuth>),
});

function EmployeesPage() {
  const { user, isAdmin } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("employees").select("*").order("full_name");
    setEmployees(data ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (input: Partial<Employee> & { full_name: string }) => {
    if (!user) return;
    if (editing) {
      const { error } = await supabase.from("employees").update(input).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      setEmployees((es) => es.map((e) => (e.id === editing.id ? { ...e, ...input } as Employee : e)));
    } else {
      const { data, error } = await supabase.from("employees").insert({ ...input, full_name: input.full_name, created_by: user.id }).select().single();
      if (error) { toast.error(error.message); return; }
      if (data) setEmployees((es) => [...es, data].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    }
    setOpen(false);
    setEditing(null);
    toast.success("Saved");
  };

  const del = async (id: string) => {
    if (!confirm("Delete this employee?")) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEmployees((es) => es.filter((e) => e.id !== id));
  };

  const filtered = employees.filter((e) =>
    !search || e.full_name.toLowerCase().includes(search.toLowerCase()) || (e.position ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center justify-between bg-card">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4" />
          <h1 className="text-base font-semibold tracking-tight">Employees</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/dtr" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> Daily Time Records
          </Link>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 w-48 text-sm" />
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> New employee
          </Button>
        </div>
      </header>
      <div className="p-6">
        <Card>
          {loading ? (
            <div className="p-8 text-sm text-muted-foreground text-center">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">No employees yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Rate/hr</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => {
                  const canEdit = isAdmin || e.created_by === user?.id;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{e.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{e.position ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{e.email ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{e.phone ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {e.hourly_rate ? `$${Number(e.hourly_rate).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(e); setOpen(true); }} disabled={!canEdit}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => del(e.id)} disabled={!canEdit}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <EmployeeDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }} editing={editing} onSave={save} />
    </>
  );
}

function EmployeeDialog({ open, onOpenChange, editing, onSave }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Employee | null;
  onSave: (input: Partial<Employee> & { full_name: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editing) {
      setName(editing.full_name); setPosition(editing.position ?? ""); setEmail(editing.email ?? "");
      setPhone(editing.phone ?? ""); setRate(editing.hourly_rate ? String(editing.hourly_rate) : ""); setNotes(editing.notes ?? "");
    } else {
      setName(""); setPosition(""); setEmail(""); setPhone(""); setRate(""); setNotes("");
    }
  }, [editing, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{editing ? "Edit employee" : "New employee"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Full name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Position</Label><Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Carpenter" /></div>
            <div><Label>Hourly rate</Label><Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!name.trim()} onClick={() => onSave({
            full_name: name.trim(),
            position: position.trim() || null,
            email: email.trim() || null,
            phone: phone.trim() || null,
            hourly_rate: rate ? parseFloat(rate) : null,
            notes: notes.trim() || null,
          })}>{editing ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}