import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CreditCard, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "./financeUtils";
import type { Tables, Enums } from "@/integrations/supabase/types";

type Invoice = Tables<"invoices">;
type Payment = Tables<"invoice_payments">;
type Direction = Enums<"invoice_direction">;
type Status = Enums<"invoice_status">;
type PayMethod = Enums<"payment_method">;

const STATUSES: Status[] = ["draft", "sent", "partial", "paid", "overdue", "cancelled"];
const METHODS: PayMethod[] = ["cash", "bank_transfer", "check", "card", "other"];

export function InvoicesPanel({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("outgoing");
  const [payOpen, setPayOpen] = useState<Invoice | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    const { data: inv } = await supabase.from("invoices").select("*").eq("project_id", projectId).order("issue_date", { ascending: false });
    setInvoices(inv ?? []);
    const ids = (inv ?? []).map((i) => i.id);
    if (ids.length) {
      const { data: p } = await supabase.from("invoice_payments").select("*").in("invoice_id", ids);
      setPayments(p ?? []);
    } else setPayments([]);
  };
  useEffect(() => { void load(); }, [projectId]);

  const paidOf = (id: string) => payments.filter((p) => p.invoice_id === id).reduce((s, p) => s + Number(p.amount), 0);

  const renderTable = (dir: Direction) => {
    const list = invoices.filter((i) => i.direction === dir);
    const total = list.reduce((s, i) => s + Number(i.total), 0);
    const paid = list.reduce((s, i) => s + paidOf(i.id), 0);
    const outstanding = list.filter((i) => i.status !== "cancelled").reduce((s, i) => s + Math.max(Number(i.total) - paidOf(i.id), 0), 0);

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3"><div className="text-xs text-muted-foreground">Total Billed</div><div className="text-lg font-semibold">{fmtMoney(total)}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">{dir === "outgoing" ? "Collected" : "Paid"}</div><div className="text-lg font-semibold text-emerald-600">{fmtMoney(paid)}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-lg font-semibold">{fmtMoney(outstanding)}</div></Card>
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { setDirection(dir); setOpen(true); }}><Plus className="w-3.5 h-3.5 mr-1" /> New {dir === "outgoing" ? "Invoice" : "Bill"}</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>#</TableHead>
              <TableHead>{dir === "outgoing" ? "Client" : "Vendor"}</TableHead>
              <TableHead>Issued</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">None yet</TableCell></TableRow>}
            {list.map((i) => {
              const p = paidOf(i.id);
              const bal = Number(i.total) - p;
              const isExp = expanded.has(i.id);
              const itemPays = payments.filter((x) => x.invoice_id === i.id);
              return (
                <Fragment key={i.id}>
                  <TableRow>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
                        const s = new Set(expanded); s.has(i.id) ? s.delete(i.id) : s.add(i.id); setExpanded(s);
                      }}>{isExp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</Button>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                    <TableCell className="font-medium">{i.party_name}</TableCell>
                    <TableCell>{i.issue_date}</TableCell>
                    <TableCell>{i.due_date ?? "—"}</TableCell>
                    <TableCell><Badge variant={i.status === "paid" ? "default" : i.status === "overdue" ? "destructive" : "secondary"}>{i.status}</Badge></TableCell>
                    <TableCell className="text-right">{fmtMoney(Number(i.total))}</TableCell>
                    <TableCell className="text-right text-emerald-600">{fmtMoney(p)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(bal)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPayOpen(i)}><CreditCard className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => {
                        if (!confirm("Delete?")) return;
                        const { error } = await supabase.from("invoices").delete().eq("id", i.id);
                        if (error) return toast.error(error.message);
                        void load();
                      }}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </TableCell>
                  </TableRow>
                  {isExp && (
                    <TableRow>
                      <TableCell colSpan={10} className="bg-muted/30">
                        <div className="text-xs font-semibold mb-2">Payments</div>
                        {itemPays.length === 0 ? <div className="text-xs text-muted-foreground">No payments recorded</div> : (
                          <div className="space-y-1 text-sm">
                            {itemPays.map((pp) => (
                              <div key={pp.id} className="flex items-center gap-3">
                                <span>{pp.payment_date}</span>
                                <span className="capitalize text-muted-foreground">{pp.payment_method.replace("_", " ")}</span>
                                {pp.reference && <span className="text-muted-foreground">#{pp.reference}</span>}
                                <span className="ml-auto font-medium">{fmtMoney(Number(pp.amount))}</span>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={async () => {
                                  if (!confirm("Delete payment?")) return;
                                  const { error } = await supabase.from("invoice_payments").delete().eq("id", pp.id);
                                  if (error) return toast.error(error.message);
                                  void load();
                                }}><Trash2 className="w-3 h-3" /></Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div>
      <Tabs defaultValue="outgoing">
        <TabsList>
          <TabsTrigger value="outgoing">Outgoing (AR)</TabsTrigger>
          <TabsTrigger value="incoming">Incoming (AP)</TabsTrigger>
        </TabsList>
        <TabsContent value="outgoing" className="pt-3">{renderTable("outgoing")}</TabsContent>
        <TabsContent value="incoming" className="pt-3">{renderTable("incoming")}</TabsContent>
      </Tabs>
      <InvoiceDialog open={open} onClose={() => setOpen(false)} direction={direction} projectId={projectId} userId={user?.id ?? ""} onSaved={() => { setOpen(false); void load(); }} />
      <PaymentDialog invoice={payOpen} onClose={() => setPayOpen(null)} userId={user?.id ?? ""} onSaved={() => { setPayOpen(null); void load(); }} />
    </div>
  );
}

function InvoiceDialog({ open, onClose, direction, projectId, userId, onSaved }: {
  open: boolean; onClose: () => void; direction: Direction; projectId: string; userId: string; onSaved: () => void;
}) {
  const [num, setNum] = useState("");
  const [party, setParty] = useState("");
  const [issue, setIssue] = useState(new Date().toISOString().slice(0, 10));
  const [due, setDue] = useState("");
  const [subtotal, setSubtotal] = useState("0");
  const [tax, setTax] = useState("0");
  const [status, setStatus] = useState<Status>("draft");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setNum(`INV-${Date.now().toString().slice(-6)}`); setParty(""); setIssue(new Date().toISOString().slice(0, 10));
      setDue(""); setSubtotal("0"); setTax("0"); setStatus("draft"); setNotes("");
    }
  }, [open]);

  const total = (Number(subtotal) || 0) + (Number(tax) || 0);

  const save = async () => {
    if (!party.trim()) return toast.error("Party name required");
    const { error } = await supabase.from("invoices").insert({
      project_id: projectId, invoice_number: num, direction, party_name: party.trim(),
      issue_date: issue, due_date: due || null, subtotal: Number(subtotal) || 0,
      tax: Number(tax) || 0, total, status, notes: notes || null, created_by: userId,
    });
    if (error) return toast.error(error.message);
    toast.success("Saved");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New {direction === "outgoing" ? "Invoice" : "Vendor Bill"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Number</Label><Input value={num} onChange={(e) => setNum(e.target.value)} /></div>
            <div><Label>{direction === "outgoing" ? "Client" : "Vendor"}</Label><Input value={party} onChange={(e) => setParty(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Issue Date</Label><Input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} /></div>
            <div><Label>Due Date</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Subtotal</Label><Input type="number" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} /></div>
            <div><Label>Tax</Label><Input type="number" value={tax} onChange={(e) => setTax(e.target.value)} /></div>
            <div><Label>Total</Label><Input value={fmtMoney(total)} disabled /></div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentDialog({ invoice, onClose, userId, onSaved }: { invoice: Invoice | null; onClose: () => void; userId: string; onSaved: () => void }) {
  const [amount, setAmount] = useState("0");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<PayMethod>("bank_transfer");
  const [ref, setRef] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (invoice) { setAmount(String(invoice.total)); setDate(new Date().toISOString().slice(0, 10)); setMethod("bank_transfer"); setRef(""); setNotes(""); }
  }, [invoice]);

  const save = async () => {
    if (!invoice) return;
    const { error } = await supabase.from("invoice_payments").insert({
      invoice_id: invoice.id, amount: Number(amount) || 0, payment_date: date, payment_method: method, reference: ref || null, notes: notes || null, created_by: userId,
    });
    if (error) return toast.error(error.message);
    // auto-update invoice status
    const { data: existing } = await supabase.from("invoice_payments").select("amount").eq("invoice_id", invoice.id);
    const totalPaid = (existing ?? []).reduce((s, p) => s + Number(p.amount), 0);
    let newStatus: Status = invoice.status;
    if (totalPaid >= Number(invoice.total)) newStatus = "paid";
    else if (totalPaid > 0) newStatus = "partial";
    if (newStatus !== invoice.status) await supabase.from("invoices").update({ status: newStatus }).eq("id", invoice.id);
    toast.success("Payment recorded");
    onSaved();
  };

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        {invoice && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">{invoice.invoice_number} — {invoice.party_name} — {fmtMoney(Number(invoice.total))}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
              <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            </div>
            <div>
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METHODS.map((m) => <SelectItem key={m} value={m} className="capitalize">{m.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Reference</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} /></div>
            <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></div>
          </div>
        )}
        <DialogFooter><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}