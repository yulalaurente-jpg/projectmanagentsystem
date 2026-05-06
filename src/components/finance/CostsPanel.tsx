import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney, loadProjectFinance, type ProjectFinance } from "./financeUtils";
import type { Tables } from "@/integrations/supabase/types";

type CostEntry = Tables<"cost_entries">;

export function CostsPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [fin, setFin] = useState<ProjectFinance | null>(null);
  const [entries, setEntries] = useState<CostEntry[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const [f, { data: e }] = await Promise.all([
      loadProjectFinance(projectId),
      supabase.from("cost_entries").select("*").eq("project_id", projectId).order("cost_date", { ascending: false }),
    ]);
    setFin(f);
    setEntries(e ?? []);
  };
  useEffect(() => { void load(); }, [projectId]);

  if (!fin) return <div className="text-muted-foreground text-sm py-6">Loading…</div>;

  const breakdown = [
    { label: "Labor (DTR × hourly rate)", value: fin.laborCost, color: "bg-blue-500" },
    { label: "Materials (received)", value: fin.materialsCost, color: "bg-amber-500" },
    { label: "Vendor Bills (paid)", value: fin.apPaid, color: "bg-purple-500" },
    { label: "Manual Entries", value: fin.manualCost, color: "bg-emerald-500" },
  ];
  const totalActual = fin.totalActual;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Actual Cost</div><div className="text-2xl font-semibold">{fmtMoney(totalActual, fin.currency)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Budget</div><div className="text-2xl font-semibold">{fmtMoney(fin.budget, fin.currency)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Variance</div><div className={`text-2xl font-semibold ${fin.budget - totalActual < 0 ? "text-destructive" : "text-emerald-600"}`}>{fmtMoney(fin.budget - totalActual, fin.currency)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">% Used</div><div className="text-2xl font-semibold">{fin.budget ? ((totalActual / fin.budget) * 100).toFixed(1) + "%" : "—"}</div></Card>
      </div>

      <Card className="p-4">
        <div className="font-semibold mb-3">Cost Breakdown</div>
        <div className="space-y-3">
          {breakdown.map((b) => {
            const p = totalActual ? (b.value / totalActual) * 100 : 0;
            return (
              <div key={b.label}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{b.label}</span>
                  <span className="font-medium">{fmtMoney(b.value, fin.currency)} <span className="text-muted-foreground">({p.toFixed(1)}%)</span></span>
                </div>
                <div className="h-2 bg-muted rounded overflow-hidden"><div className={`h-full ${b.color}`} style={{ width: `${p}%` }} /></div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Manual Cost Entries</div>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Add Entry</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className="w-12"></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No manual entries</TableCell></TableRow>}
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell>{e.cost_date}</TableCell>
                <TableCell className="font-medium">{e.description}</TableCell>
                <TableCell className="capitalize text-muted-foreground">{e.entry_type}</TableCell>
                <TableCell className="text-right">{fmtMoney(Number(e.amount), fin.currency)}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => {
                    if (!confirm("Delete?")) return;
                    const { error } = await supabase.from("cost_entries").delete().eq("id", e.id);
                    if (error) return toast.error(error.message);
                    void load();
                  }}><Trash2 className="w-3.5 h-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CostDialog open={open} onClose={() => setOpen(false)} projectId={projectId} userId={user?.id ?? ""} onSaved={() => { setOpen(false); void load(); }} />
    </div>
  );
}

function CostDialog({ open, onClose, projectId, userId, onSaved }: { open: boolean; onClose: () => void; projectId: string; userId: string; onSaved: () => void }) {
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<"manual" | "adjustment">("manual");
  const [notes, setNotes] = useState("");

  useEffect(() => { if (open) { setDesc(""); setAmount("0"); setDate(new Date().toISOString().slice(0, 10)); setType("manual"); setNotes(""); } }, [open]);

  const save = async () => {
    if (!desc.trim()) return toast.error("Description required");
    const { error } = await supabase.from("cost_entries").insert({
      project_id: projectId, description: desc.trim(), amount: Number(amount) || 0, cost_date: date, entry_type: type, notes: notes || null, created_by: userId,
    });
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Cost Entry</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Description</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div>
            <Label>Type</Label>
            <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={type} onChange={(e) => setType(e.target.value as "manual" | "adjustment")}>
              <option value="manual">Manual</option><option value="adjustment">Adjustment</option>
            </select>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}