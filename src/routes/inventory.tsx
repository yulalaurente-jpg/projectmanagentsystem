import { createFileRoute } from "@tanstack/react-router";
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Package, AlertTriangle, Trash2, Pencil, Send,
  Clock, CheckCircle2, Truck, PackageCheck, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { Enums } from "@/integrations/supabase/types";
import { format } from "date-fns";

type Material = Tables<"materials">;
type Request = Tables<"material_requests">;
type Project = Tables<"projects">;
type Profile = Tables<"profiles">;
type RequestStatus = Enums<"material_request_status">;

const REQ_STATUS: Record<RequestStatus, { label: string; icon: typeof Clock; color: string }> = {
  requested: { label: "Requested", icon: Clock, color: "#f59e0b" },
  approved:  { label: "Approved",  icon: CheckCircle2, color: "#3b82f6" },
  arrived:   { label: "Arrived",   icon: Truck, color: "#8b5cf6" },
  received:  { label: "Received",  icon: PackageCheck, color: "#10b981" },
  declined:  { label: "Declined",  icon: XCircle, color: "#ef4444" },
};

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Trackr" },
      { name: "description", content: "Manage materials catalog and stock levels." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <InventoryPage />
      </AppLayout>
    </RequireAuth>
  ),
});

function InventoryPage() {
  const { user } = useAuth();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestMaterial, setRequestMaterial] = useState<Material | null>(null);

  const load = async () => {
    setLoading(true);
    const [{ data: m }, { data: r }, { data: pr }, { data: pf }] = await Promise.all([
      supabase.from("materials").select("*").order("name"),
      supabase.from("material_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("projects").select("*"),
      supabase.from("profiles").select("*"),
    ]);
    setMaterials(m ?? []);
    setRequests(r ?? []);
    setProjects(pr ?? []);
    setProfiles(pf ?? []);
    if (user) {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      setIsAdmin(!!roles?.some((x) => x.role === "admin"));
    }
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

  const saveMaterial = async (input: Partial<Material> & { name: string }): Promise<void> => {
    if (!user) return;
    if (editing) {
      const { error } = await supabase.from("materials").update(input).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      setMaterials((m) => m.map((x) => (x.id === editing.id ? { ...x, ...input } as Material : x)));
      toast.success("Updated");
    } else {
      const { data, error } = await supabase
        .from("materials")
        .insert({ ...input, created_by: user.id, name: input.name })
        .select()
        .single();
      if (error) { toast.error(error.message); return; }
      if (data) setMaterials((m) => [...m, data].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success("Material added");
    }
    setCreateOpen(false);
    setEditing(null);
  };

  const deleteMaterial = async (id: string) => {
    if (!confirm("Delete this material? Existing requests will be removed too.")) return;
    const { error } = await supabase.from("materials").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setMaterials((m) => m.filter((x) => x.id !== id));
  };

  const updateRequestStatus = async (id: string, status: RequestStatus, reason?: string) => {
    const patch: Partial<Request> = { status };
    if (status === "approved") { patch.approved_by = user?.id ?? null; patch.approved_at = new Date().toISOString(); }
    if (status === "arrived")  { patch.arrived_at = new Date().toISOString(); }
    if (status === "received") { patch.received_at = new Date().toISOString(); }
    if (status === "declined") { patch.declined_at = new Date().toISOString(); patch.declined_reason = reason ?? null; }
    const { error } = await supabase.from("material_requests").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRequests((rs) => rs.map((x) => (x.id === id ? { ...x, ...patch } as Request : x)));
    toast.success(REQ_STATUS[status].label);
  };

  const deleteRequest = async (id: string) => {
    if (!confirm("Delete this request?")) return;
    const { error } = await supabase.from("material_requests").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRequests((rs) => rs.filter((x) => x.id !== id));
  };

  const submitRequest = async (input: { material_id: string; project_id: string; quantity: number; notes: string }) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("material_requests")
      .insert({ ...input, requested_by: user.id })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    if (data) setRequests((r) => [data, ...r]);
    toast.success("Request submitted");
    setRequestOpen(false);
    setRequestMaterial(null);
  };

  const lowStock = materials.filter((m) => m.stock_quantity <= m.min_stock).length;
  const pendingRequests = requests.filter((r) => r.status === "requested").length;

  return (
    <>
      <header className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold flex items-center gap-2">
              <Package className="w-4 h-4" /> Inventory
            </h1>
            <p className="text-xs text-muted-foreground">Materials catalog and stock levels</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setRequestMaterial(null); setRequestOpen(true); }}
              disabled={materials.length === 0 || projects.length === 0}
            >
              <Send className="w-4 h-4 mr-1.5" /> Request material
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setCreateOpen(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> New material
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Materials" value={materials.length} />
          <StatCard label="Low stock" value={lowStock} accent={lowStock > 0 ? "warn" : undefined} />
          <StatCard label="Total stock units" value={materials.reduce((s, m) => s + Number(m.stock_quantity), 0).toLocaleString()} />
          <StatCard label="Pending requests" value={pendingRequests} accent={pendingRequests > 0 ? "warn" : undefined} />
        </div>

        <Tabs defaultValue="catalog" className="space-y-4">
          <TabsList>
            <TabsTrigger value="catalog">Catalog</TabsTrigger>
            <TabsTrigger value="requests">
              Requested Materials
              {requests.length > 0 && (
                <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {requests.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="catalog">
            <Card>
          {loading ? (
            <div className="p-8 text-sm text-muted-foreground text-center">Loading…</div>
          ) : materials.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              No materials yet. Click "New material" to add one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Min</TableHead>
                  <TableHead className="text-right">Unit cost</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materials.map((m) => {
                  const low = Number(m.stock_quantity) <= Number(m.min_stock);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">{m.sku ?? "—"}</TableCell>
                      <TableCell>{m.category ? <Badge variant="secondary">{m.category}</Badge> : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {low && <AlertTriangle className="w-3.5 h-3.5 inline mr-1 text-amber-500" />}
                        {m.stock_quantity} {m.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{m.min_stock}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {m.unit_cost ? `$${Number(m.unit_cost).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          disabled={projects.length === 0}
                          onClick={() => { setRequestMaterial(m); setRequestOpen(true); }}
                        >
                          <Send className="w-3 h-3 mr-1" /> Request
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(m); setCreateOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteMaterial(m.id)}>
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
          </TabsContent>

          <TabsContent value="requests">
            <RequestsPanel
              requests={requests}
              materials={materials}
              projects={projects}
              profiles={profiles}
              currentUserId={user?.id}
              isAdmin={isAdmin}
              onUpdate={updateRequestStatus}
              onDelete={deleteRequest}
            />
          </TabsContent>
        </Tabs>
      </div>

      <MaterialDialog
        open={createOpen}
        onOpenChange={(v) => { setCreateOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        onSave={saveMaterial}
      />

      <RequestMaterialDialog
        open={requestOpen}
        onOpenChange={(v) => { setRequestOpen(v); if (!v) setRequestMaterial(null); }}
        materials={materials}
        projects={projects}
        defaultMaterial={requestMaterial}
        onSubmit={submitRequest}
      />
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: "warn" }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${accent === "warn" ? "text-amber-500" : ""}`}>{value}</div>
    </Card>
  );
}

function MaterialDialog({
  open, onOpenChange, editing, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Material | null;
  onSave: (input: Partial<Material> & { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [cost, setCost] = useState("");
  const [desc, setDesc] = useState("");

  useEffect(() => {
    if (editing) {
      setName(editing.name); setSku(editing.sku ?? ""); setCategory(editing.category ?? "");
      setUnit(editing.unit); setStock(String(editing.stock_quantity)); setMinStock(String(editing.min_stock));
      setCost(editing.unit_cost ? String(editing.unit_cost) : ""); setDesc(editing.description ?? "");
    } else {
      setName(""); setSku(""); setCategory(""); setUnit("pcs"); setStock("0"); setMinStock("0"); setCost(""); setDesc("");
    }
  }, [editing, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit material" : "New material"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Steel rod 12mm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>SKU</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU-001" />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Hardware" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="pcs" />
            </div>
            <div>
              <Label>Stock</Label>
              <Input type="number" min="0" step="0.01" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div>
              <Label>Min stock</Label>
              <Input type="number" min="0" step="0.01" value={minStock} onChange={(e) => setMinStock(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Unit cost</Label>
            <Input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!name.trim()}
            onClick={() => onSave({
              name: name.trim(),
              sku: sku.trim() || null,
              category: category.trim() || null,
              unit: unit.trim() || "pcs",
              stock_quantity: parseFloat(stock) || 0,
              min_stock: parseFloat(minStock) || 0,
              unit_cost: cost ? parseFloat(cost) : null,
              description: desc.trim() || null,
            })}
          >
            {editing ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestsPanel({
  requests, materials, projects, profiles, currentUserId, isAdmin, onUpdate, onDelete,
}: {
  requests: Request[];
  materials: Material[];
  projects: Project[];
  profiles: Profile[];
  currentUserId: string | undefined;
  isAdmin: boolean;
  onUpdate: (id: string, status: RequestStatus, reason?: string) => void;
  onDelete: (id: string) => void;
}) {
  const [filter, setFilter] = useState<RequestStatus | "all">("all");
  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  const matName = (id: string) => materials.find((m) => m.id === id)?.name ?? "Unknown";
  const matUnit = (id: string) => materials.find((m) => m.id === id)?.unit ?? "";
  const projName = (id: string) => {
    const p = projects.find((x) => x.id === id);
    return p ? `${p.key} · ${p.name}` : "Unknown";
  };
  const userName = (id: string | null) => {
    if (!id) return "—";
    const p = profiles.find((x) => x.id === id);
    return p?.display_name || p?.email || "Unknown";
  };

  const canApprove = (r: Request) => {
    if (isAdmin) return true;
    const proj = projects.find((p) => p.id === r.project_id);
    return proj?.created_by === currentUserId;
  };

  return (
    <Card>
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="text-sm font-medium">All material requests</div>
        <Select value={filter} onValueChange={(v) => setFilter(v as RequestStatus | "all")}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(REQ_STATUS) as RequestStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{REQ_STATUS[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-sm text-muted-foreground">
          No requests {filter !== "all" ? `with status "${REQ_STATUS[filter as RequestStatus].label}"` : "yet"}.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Requested by</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const meta = REQ_STATUS[r.status];
              const Icon = meta.icon;
              const allowed = canApprove(r);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{matName(r.material_id)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{projName(r.project_id)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(r.quantity)} {matUnit(r.material_id)}
                  </TableCell>
                  <TableCell className="text-xs">{userName(r.requested_by)}</TableCell>
                  <TableCell>
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: `${meta.color}1f`, color: meta.color }}
                    >
                      <Icon className="w-3 h-3" />
                      {meta.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(r.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {allowed && r.status === "requested" && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onUpdate(r.id, "approved")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => {
                            const reason = prompt("Decline reason (optional):") ?? undefined;
                            onUpdate(r.id, "declined", reason || undefined);
                          }}>
                            Decline
                          </Button>
                        </>
                      )}
                      {allowed && r.status === "approved" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onUpdate(r.id, "arrived")}>
                          Mark arrived
                        </Button>
                      )}
                      {allowed && r.status === "arrived" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onUpdate(r.id, "received")}>
                          Mark received
                        </Button>
                      )}
                      {(isAdmin || r.requested_by === currentUserId) && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(r.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
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
  );
}
