import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, CheckCircle2, Truck, PackageCheck, XCircle, Clock, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Material = Tables<"materials">;
type Request = Tables<"material_requests">;
type RequestStatus = Enums<"material_request_status">;

const STATUS_META: Record<RequestStatus, { label: string; icon: typeof Clock; color: string; bg: string }> = {
  requested: { label: "Requested", icon: Clock, color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  approved:  { label: "Approved",  icon: CheckCircle2, color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  arrived:   { label: "Arrived",   icon: Truck, color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  received:  { label: "Received",  icon: PackageCheck, color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  declined:  { label: "Declined",  icon: XCircle, color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
};

export function MaterialsPanel({ projectId, canApprove }: { projectId: string; canApprove: boolean }) {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [reqOpen, setReqOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: m }, { data: r }] = await Promise.all([
      supabase.from("materials").select("*").order("name"),
      supabase.from("material_requests").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    ]);
    setMaterials(m ?? []);
    setRequests(r ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const createRequest = async (input: { material_id: string; quantity: number; notes: string }) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("material_requests")
      .insert({ ...input, project_id: projectId, requested_by: user.id })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    if (data) setRequests((r) => [data, ...r]);
    toast.success("Request submitted");
    setReqOpen(false);
  };

  const setStatus = async (id: string, status: RequestStatus, extra: Partial<Request> = {}) => {
    const patch: Partial<Request> = { status, ...extra };
    if (status === "approved") { patch.approved_by = user?.id ?? null; patch.approved_at = new Date().toISOString(); }
    if (status === "arrived")  { patch.arrived_at = new Date().toISOString(); }
    if (status === "received") { patch.received_at = new Date().toISOString(); }
    if (status === "declined") { patch.declined_at = new Date().toISOString(); }
    const { error } = await supabase.from("material_requests").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRequests((r) => r.map((x) => (x.id === id ? { ...x, ...patch } as Request : x)));
    toast.success(STATUS_META[status].label);
  };

  const deleteRequest = async (id: string) => {
    if (!confirm("Delete this request?")) return;
    const { error } = await supabase.from("material_requests").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRequests((r) => r.filter((x) => x.id !== id));
  };

  const materialMap = new Map(materials.map((m) => [m.id, m]));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
          <Package className="w-3.5 h-3.5" /> Materials & Requests ({requests.length})
        </div>
        <RequestDialog
          open={reqOpen}
          onOpenChange={setReqOpen}
          materials={materials}
          onSubmit={createRequest}
        />
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : requests.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded">
          No material requests yet.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => {
            const m = materialMap.get(req.material_id);
            const meta = STATUS_META[req.status];
            const Icon = meta.icon;
            return (
              <Card key={req.id} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded shrink-0" style={{ backgroundColor: meta.bg }}>
                    <Icon className="w-4 h-4" style={{ color: meta.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{m?.name ?? "Unknown"}</span>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider" style={{ color: meta.color, borderColor: meta.color }}>
                        {meta.label}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {req.quantity} {m?.unit ?? "pcs"}
                      {req.notes && <span className="ml-2">· {req.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canApprove && req.status === "requested" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(req.id, "approved")}>Approve</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-destructive" onClick={() => setStatus(req.id, "declined")}>Decline</Button>
                      </>
                    )}
                    {canApprove && req.status === "approved" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(req.id, "arrived")}>Mark arrived</Button>
                    )}
                    {canApprove && req.status === "arrived" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus(req.id, "received")}>Mark received</Button>
                    )}
                    {(req.requested_by === user?.id || canApprove) && (
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteRequest(req.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RequestDialog({
  open, onOpenChange, materials, onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  materials: Material[];
  onSubmit: (input: { material_id: string; quantity: number; notes: string }) => Promise<void>;
}) {
  const [materialId, setMaterialId] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("1");
  const [notes, setNotes] = useState("");

  const reset = () => { setMaterialId(""); setQuantity("1"); setNotes(""); };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Plus className="w-3 h-3 mr-1" /> Request material
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request material</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Material</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger><SelectValue placeholder="Select material" /></SelectTrigger>
              <SelectContent>
                {materials.length === 0 ? (
                  <div className="px-2 py-3 text-xs text-muted-foreground">No materials yet. Add some in Inventory.</div>
                ) : (
                  materials.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} <span className="text-muted-foreground">· {m.stock_quantity} {m.unit} in stock</span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantity</Label>
            <Input type="number" min="0.01" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Why do you need this?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!materialId || !(parseFloat(quantity) > 0)}
            onClick={() => onSubmit({ material_id: materialId, quantity: parseFloat(quantity), notes })}
          >
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
