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
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "./financeUtils";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Funding = Tables<"funding_sources">;
type SrcType = Enums<"funding_source_type">;
type Status = Enums<"funding_status">;

const TYPES: SrcType[] = ["client_payment", "loan", "grant", "internal", "investor", "other"];
const STATUSES: Status[] = ["pledged", "partial", "received"];

export function FundingPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Funding[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Funding | null>(null);

  const load = async () => {
    const { data } = await supabase.from("funding_sources").select("*").eq("project_id", projectId).order("created_at");
    setItems(data ?? []);
  };
  useEffect(() => { void load(); }, [projectId]);

  const pledged = items.reduce((s, i) => s + Number(i.amount), 0);
  const received = items.reduce(
    (s, i) => s + Number(i.received_amount) + (i.status === "received" ? Number(i.amount) - Number(i.received_amount) : 0),
    0,
  );
  const remaining = pledged - received;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Pledged</div><div className="text-2xl font-semibold">{fmtMoney(pledged)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Received</div><div className="text-2xl font-semibold text-emerald-600">{fmtMoney(received)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-2xl font-semibold">{fmtMoney(remaining)}</div></Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Funding Sources</div>
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1" /> Add Source</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead className="text-right">Received</TableHead>
              <TableHead>Date</TableHead><TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No funding sources yet</TableCell></TableRow>}
            {items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.name}</TableCell>
                <TableCell className="capitalize text-muted-foreground">{i.source_type.replace("_", " ")}</TableCell>
                <TableCell><Badge variant={i.status === "received" ? "default" : i.status === "partial" ? "secondary" : "outline"}>{i.status}</Badge></TableCell>
                <TableCell className="text-right">{fmtMoney(Number(i.amount))}</TableCell>
                <TableCell className="text-right">{fmtMoney(Number(i.received_amount))}</TableCell>
                <TableCell className="text-muted-foreground">{i.received_date ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(i); setOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => {
                    if (!confirm("Delete?")) return;
                    const { error } = await supabase.from("funding_sources").delete().eq("id", i.id);
                    if (error) return toast.error(error.message);
                    void load();
                  }}><Trash2 className="w-3.5 h-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <FundingDialog open={open} onClose={() => setOpen(false)} item={editing} projectId={projectId} userId={user?.id ?? ""} onSaved={() => { setOpen(false); void load(); }} />
    </div>
  );
}

function FundingDialog({ open, onClose, item, projectId, userId, onSaved }: {
  open: boolean; onClose: () => void; item: Funding | null; projectId: string; userId: string; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SrcType>("client_payment");
  const [amount, setAmount] = useState("0");
  const [received, setReceived] = useState("0");
  const [status, setStatus] = useState<Status>("pledged");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setName(item?.name ?? "");
      setType((item?.source_type as SrcType) ?? "client_payment");
      setAmount(String(item?.amount ?? 0));
      setReceived(String(item?.received_amount ?? 0));
      setStatus((item?.status as Status) ?? "pledged");
      setDate(item?.received_date ?? "");
      setNotes(item?.notes ?? "");
    }
  }, [open, item]);

  const save = async () => {
    if (!name.trim()) return toast.error("Name required");
    const payload = {
      project_id: projectId, name: name.trim(), source_type: type, amount: Number(amount) || 0,
      received_amount: Number(received) || 0, status, received_date: date || null, notes: notes || null, created_by: userId,
    };
    const { error } = item
      ? await supabase.from("funding_sources").update(payload).eq("id", item.id)
      : await supabase.from("funding_sources").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{item ? "Edit" : "Add"} Funding Source</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as SrcType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Received Amount</Label><Input type="number" value={received} onChange={(e) => setReceived(e.target.value)} /></div>
          </div>
          <div><Label>Received Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}