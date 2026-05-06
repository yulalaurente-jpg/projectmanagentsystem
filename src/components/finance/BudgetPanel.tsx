import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney, pct } from "./financeUtils";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Budget = Tables<"project_budgets">;
type Category = Tables<"budget_categories">;
type CatType = Enums<"budget_category_type">;

const CAT_TYPES: CatType[] = ["labor", "materials", "equipment", "subcontractor", "overhead", "other"];

export function BudgetPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [budget, setBudget] = useState<Budget | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);

  const load = async () => {
    const [{ data: b }, { data: c }] = await Promise.all([
      supabase.from("project_budgets").select("*").eq("project_id", projectId).maybeSingle(),
      supabase.from("budget_categories").select("*").eq("project_id", projectId).order("created_at"),
    ]);
    setBudget(b);
    setCats(c ?? []);
  };
  useEffect(() => { void load(); }, [projectId]);

  const allocated = cats.reduce((s, c) => s + Number(c.allocated_amount), 0);
  const total = Number(budget?.total_budget ?? 0);
  const unallocated = total - allocated;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Budget</div>
          <div className="text-2xl font-semibold">{fmtMoney(total, budget?.currency ?? "USD")}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Allocated</div>
          <div className="text-2xl font-semibold">{fmtMoney(allocated, budget?.currency ?? "USD")}</div>
          <div className="text-xs text-muted-foreground">{total ? pct((allocated / total) * 100) : "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Unallocated</div>
          <div className={`text-2xl font-semibold ${unallocated < 0 ? "text-destructive" : ""}`}>{fmtMoney(unallocated, budget?.currency ?? "USD")}</div>
        </Card>
        <Card className="p-4 flex items-center justify-center">
          <Button size="sm" variant="outline" onClick={() => setBudgetOpen(true)}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> {budget ? "Edit Budget" : "Set Budget"}
          </Button>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Budget Categories</div>
          <Button size="sm" onClick={() => { setEditingCat(null); setCatOpen(true); }}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Add Category
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Allocated</TableHead>
              <TableHead className="text-right">% of Budget</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cats.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No categories yet</TableCell></TableRow>
            )}
            {cats.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="capitalize text-muted-foreground">{c.category_type}</TableCell>
                <TableCell className="text-right">{fmtMoney(Number(c.allocated_amount), budget?.currency ?? "USD")}</TableCell>
                <TableCell className="text-right text-muted-foreground">{total ? pct((Number(c.allocated_amount) / total) * 100) : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingCat(c); setCatOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => {
                    if (!confirm("Delete category?")) return;
                    const { error } = await supabase.from("budget_categories").delete().eq("id", c.id);
                    if (error) return toast.error(error.message);
                    toast.success("Deleted");
                    void load();
                  }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <BudgetDialog
        open={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        budget={budget}
        projectId={projectId}
        userId={user?.id ?? ""}
        onSaved={() => { setBudgetOpen(false); void load(); }}
      />
      <CategoryDialog
        open={catOpen}
        onClose={() => setCatOpen(false)}
        category={editingCat}
        projectId={projectId}
        userId={user?.id ?? ""}
        onSaved={() => { setCatOpen(false); void load(); }}
      />
    </div>
  );
}

function BudgetDialog({ open, onClose, budget, projectId, userId, onSaved }: {
  open: boolean; onClose: () => void; budget: Budget | null; projectId: string; userId: string; onSaved: () => void;
}) {
  const [total, setTotal] = useState("0");
  const [currency, setCurrency] = useState("USD");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setTotal(String(budget?.total_budget ?? 0));
      setCurrency(budget?.currency ?? "USD");
      setStart(budget?.start_date ?? "");
      setEnd(budget?.end_date ?? "");
      setNotes(budget?.notes ?? "");
    }
  }, [open, budget]);

  const save = async () => {
    const payload = {
      project_id: projectId,
      total_budget: Number(total) || 0,
      currency: currency || "USD",
      start_date: start || null,
      end_date: end || null,
      notes: notes || null,
      created_by: userId,
    };
    const { error } = budget
      ? await supabase.from("project_budgets").update(payload).eq("id", budget.id)
      : await supabase.from("project_budgets").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{budget ? "Edit" : "Set"} Project Budget</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Total Budget</Label><Input type="number" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
            <div><Label>Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start Date</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>End Date</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({ open, onClose, category, projectId, userId, onSaved }: {
  open: boolean; onClose: () => void; category: Category | null; projectId: string; userId: string; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CatType>("other");
  const [amount, setAmount] = useState("0");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setType((category?.category_type as CatType) ?? "other");
      setAmount(String(category?.allocated_amount ?? 0));
      setNotes(category?.notes ?? "");
    }
  }, [open, category]);

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    const payload = {
      project_id: projectId,
      name: name.trim(),
      category_type: type,
      allocated_amount: Number(amount) || 0,
      notes: notes || null,
      created_by: userId,
    };
    const { error } = category
      ? await supabase.from("budget_categories").update(payload).eq("id", category.id)
      : await supabase.from("budget_categories").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{category ? "Edit" : "Add"} Category</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CatType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CAT_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Allocated Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}