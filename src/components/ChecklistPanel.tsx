import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, MoreHorizontal, Calendar as CalendarIcon, FileDown, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { DynamicIcon, IconPicker, ColorPicker, ICON_OPTIONS } from "@/components/IconPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Checklist = Tables<"checklists">;
type Item = Tables<"checklist_items">;
type Profile = Tables<"profiles">;
type Template = Tables<"checklist_templates"> & { checklist_template_items: Tables<"checklist_template_items">[] };

export function ChecklistPanel({
  scope,
  scopeId,
  profiles,
}: {
  scope: "project" | "task";
  scopeId: string;
  profiles: Profile[];
}) {
  const { user } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const col = scope === "project" ? "project_id" : "task_id";
    const { data: cls } = await supabase
      .from("checklists")
      .select("*")
      .eq(col, scopeId)
      .order("position");
    setChecklists(cls ?? []);
    if (cls && cls.length > 0) {
      const { data: its } = await supabase
        .from("checklist_items")
        .select("*")
        .in("checklist_id", cls.map((c) => c.id))
        .order("position");
      setItems(its ?? []);
    } else {
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [scope, scopeId]);

  const createChecklist = async (input: { title: string; color: string; icon: string }): Promise<void> => {
    if (!user) return;
    const payload: Record<string, unknown> = {
      title: input.title,
      color: input.color,
      icon: input.icon,
      created_by: user.id,
      position: checklists.length,
    };
    payload[scope === "project" ? "project_id" : "task_id"] = scopeId;
    const { data, error } = await supabase.from("checklists").insert(payload as never).select().single();
    if (error) { toast.error(error.message); return; }
    if (data) setChecklists((c) => [...c, data]);
    toast.success("Checklist added");
  };

  const updateChecklist = async (id: string, patch: Partial<Checklist>): Promise<void> => {
    const { error } = await supabase.from("checklists").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setChecklists((c) => c.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const deleteChecklist = async (id: string): Promise<void> => {
    if (!confirm("Delete this checklist?")) return;
    const { error } = await supabase.from("checklists").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setChecklists((c) => c.filter((x) => x.id !== id));
    setItems((i) => i.filter((x) => x.checklist_id !== id));
  };

  const addItem = async (checklistId: string, label: string): Promise<void> => {
    if (!label.trim()) return;
    const max = items.filter((i) => i.checklist_id === checklistId).length;
    const { data, error } = await supabase
      .from("checklist_items")
      .insert({ checklist_id: checklistId, label: label.trim(), position: max })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    if (data) setItems((i) => [...i, data]);
  };

  const updateItem = async (id: string, patch: Partial<Item>): Promise<void> => {
    const { error } = await supabase.from("checklist_items").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((i) => i.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const deleteItem = async (id: string): Promise<void> => {
    const { error } = await supabase.from("checklist_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((i) => i.filter((x) => x.id !== id));
  };

  const reorderItems = async (checklistId: string, ids: string[]) => {
    const reordered = ids.map((id, idx) => ({ id, position: idx }));
    setItems((prev) => {
      const others = prev.filter((i) => i.checklist_id !== checklistId);
      const map = new Map(reordered.map((r) => [r.id, r.position]));
      const updated = prev
        .filter((i) => i.checklist_id === checklistId)
        .map((i) => ({ ...i, position: map.get(i.id) ?? i.position }))
        .sort((a, b) => a.position - b.position);
      return [...others, ...updated];
    });
    await Promise.all(
      reordered.map((r) =>
        supabase.from("checklist_items").update({ position: r.position }).eq("id", r.id),
      ),
    );
  };

  const applyTemplate = async (template: Template): Promise<void> => {
    if (!user) return;
    const payload: Record<string, unknown> = {
      title: template.name,
      color: template.color ?? "#3b82f6",
      icon: template.icon ?? "list-checks",
      created_by: user.id,
      position: checklists.length,
    };
    payload[scope === "project" ? "project_id" : "task_id"] = scopeId;
    const { data: cl, error } = await supabase.from("checklists").insert(payload as never).select().single();
    if (error || !cl) { toast.error(error?.message ?? "Failed"); return; }
    const tplItems = template.checklist_template_items ?? [];
    if (tplItems.length > 0) {
      const rows = tplItems
        .sort((a, b) => a.position - b.position)
        .map((ti, idx) => ({ checklist_id: cl.id, label: ti.label, position: idx }));
      const { data: newItems } = await supabase.from("checklist_items").insert(rows).select();
      if (newItems) setItems((i) => [...i, ...newItems]);
    }
    setChecklists((c) => [...c, cl]);
    toast.success(`Applied "${template.name}"`);
    setTemplatesOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Checklists ({checklists.length})
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTemplatesOpen(true)}>
            <FileDown className="w-3 h-3 mr-1" /> From template
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3 h-3 mr-1" /> New
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : checklists.length === 0 ? (
        <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded">
          No checklists yet.
        </div>
      ) : (
        checklists.map((cl) => (
          <ChecklistCard
            key={cl.id}
            checklist={cl}
            items={items.filter((i) => i.checklist_id === cl.id).sort((a, b) => a.position - b.position)}
            profiles={profiles}
            onUpdate={updateChecklist}
            onDelete={deleteChecklist}
            onAddItem={addItem}
            onUpdateItem={updateItem}
            onDeleteItem={deleteItem}
            onReorder={reorderItems}
          />
        ))
      )}

      <NewChecklistDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={createChecklist} />
      <TemplatePickerDialog open={templatesOpen} onOpenChange={setTemplatesOpen} onApply={applyTemplate} />
    </div>
  );
}

function ChecklistCard({
  checklist,
  items,
  profiles,
  onUpdate,
  onDelete,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onReorder,
}: {
  checklist: Checklist;
  items: Item[];
  profiles: Profile[];
  onUpdate: (id: string, patch: Partial<Checklist>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddItem: (id: string, label: string) => Promise<void>;
  onUpdateItem: (id: string, patch: Partial<Item>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onReorder: (checklistId: string, ids: string[]) => Promise<void>;
}) {
  const [newItem, setNewItem] = useState("");
  const [editTitle, setEditTitle] = useState(checklist.title);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const done = items.filter((i) => i.is_done).length;
  const pct = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorder(checklist.id, ids);
    setDragId(null);
    setOverId(null);
  };

  return (
    <Card className="overflow-hidden border-l-4" style={{ borderLeftColor: checklist.color ?? "#3b82f6" }}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/30">
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 shrink-0"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand checklist" : "Collapse checklist"}
        >
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </Button>
        <DynamicIcon name={checklist.icon} className="w-4 h-4" style={{ color: checklist.color ?? "#3b82f6" } as React.CSSProperties} />
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={() => editTitle !== checklist.title && onUpdate(checklist.id, { title: editTitle })}
          className="h-7 border-0 bg-transparent shadow-none px-1 font-semibold text-sm focus-visible:ring-1"
        />
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {done}/{items.length} · {pct}%
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="p-2 space-y-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Color</div>
                <ColorPicker value={checklist.color ?? "#3b82f6"} onChange={(v) => onUpdate(checklist.id, { color: v })} />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Icon</div>
                <div className="grid grid-cols-8 gap-1">
                  {ICON_OPTIONS.slice(0, 16).map((n) => (
                    <button key={n} onClick={() => onUpdate(checklist.id, { icon: n })} className="h-7 w-7 flex items-center justify-center hover:bg-accent rounded">
                      <DynamicIcon name={n} className={`w-3.5 h-3.5 ${checklist.icon === n ? "text-primary" : "text-muted-foreground"}`} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(checklist.id)}>
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete checklist
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted relative">
        <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct}%`, backgroundColor: checklist.color ?? "#3b82f6" }} />
      </div>

      {!collapsed && (
        <>
      <div className="divide-y divide-border">
        {items.map((it) => (
          <ChecklistItemRow
            key={it.id}
            item={it}
            profiles={profiles}
            isDragOver={overId === it.id}
            onDragStart={() => setDragId(it.id)}
            onDragOver={(e) => { e.preventDefault(); setOverId(it.id); }}
            onDrop={() => handleDrop(it.id)}
            onDragEnd={() => { setDragId(null); setOverId(null); }}
            onUpdate={onUpdateItem}
            onDelete={onDeleteItem}
          />
        ))}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); onAddItem(checklist.id, newItem); setNewItem(""); }}
        className="flex gap-2 px-3 py-2 border-t border-border bg-muted/20"
      >
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder="Add an item…"
          className="h-7 text-sm"
        />
        <Button type="submit" size="sm" variant="ghost" className="h-7" disabled={!newItem.trim()}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </form>
        </>
      )}
    </Card>
  );
}

function ChecklistItemRow({
  item,
  profiles,
  isDragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onUpdate,
  onDelete,
}: {
  item: Item;
  profiles: Profile[];
  isDragOver: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onUpdate: (id: string, patch: Partial<Item>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [label, setLabel] = useState(item.label);
  const [expanded, setExpanded] = useState(false);
  const assignee = profiles.find((p) => p.id === item.assignee_id);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group ${isDragOver ? "bg-primary/10" : ""}`}
    >
      <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/30">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 cursor-grab opacity-0 group-hover:opacity-100" />
        <Checkbox
          checked={item.is_done}
          onCheckedChange={(v) => onUpdate(item.id, { is_done: !!v })}
        />
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== item.label && onUpdate(item.id, { label })}
          className={`h-7 border-0 bg-transparent shadow-none px-1 text-sm focus-visible:ring-1 ${item.is_done ? "line-through text-muted-foreground" : ""}`}
        />
        {item.priority && (
          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider" style={{ color: priorityColor(item.priority) }}>
            {item.priority}
          </span>
        )}
        {item.due_date && (
          <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <CalendarIcon className="w-3 h-3" />
            {new Date(item.due_date).toLocaleDateString()}
          </span>
        )}
        {assignee && (
          <span className="text-[10px] text-muted-foreground">{assignee.display_name?.split(" ")[0]}</span>
        )}
        <Popover open={expanded} onOpenChange={setExpanded}>
          <PopoverTrigger asChild>
            <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3 space-y-3" align="end">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Assignee</Label>
              <Select value={item.assignee_id ?? "none"} onValueChange={(v) => onUpdate(item.id, { assignee_id: v === "none" ? null : v })}>
                <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.display_name || p.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Due</Label>
                <Input
                  type="date"
                  className="h-8 mt-1"
                  value={item.due_date ? item.due_date.slice(0, 10) : ""}
                  onChange={(e) => onUpdate(item.id, { due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</Label>
                <Select value={item.priority ?? "none"} onValueChange={(v) => onUpdate(item.id, { priority: v === "none" ? null : (v as Enums<"task_priority">) })}>
                  <SelectTrigger className="h-8 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Notes</Label>
              <textarea
                defaultValue={item.notes ?? ""}
                onBlur={(e) => e.target.value !== (item.notes ?? "") && onUpdate(item.id, { notes: e.target.value || null })}
                rows={3}
                className="w-full mt-1 text-sm rounded border border-input bg-background p-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Notes…"
              />
            </div>
            <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive" onClick={() => { onDelete(item.id); setExpanded(false); }}>
              <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete item
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function priorityColor(p: Enums<"task_priority">) {
  return p === "urgent" ? "var(--priority-urgent)" : p === "high" ? "var(--priority-high)" : p === "medium" ? "var(--priority-medium)" : "var(--priority-low)";
}

function NewChecklistDialog({
  open, onOpenChange, onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (input: { title: string; color: string; icon: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [icon, setIcon] = useState("list-checks");
  useEffect(() => { if (open) { setTitle(""); setColor("#3b82f6"); setIcon("list-checks"); } }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New checklist</DialogTitle></DialogHeader>
        <form
          onSubmit={async (e) => { e.preventDefault(); await onCreate({ title: title.trim(), color, icon }); onOpenChange(false); }}
          className="space-y-3"
        >
          <div>
            <Label>Title</Label>
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} autoFocus className="mt-1" />
          </div>
          <div>
            <Label>Color</Label>
            <div className="mt-1.5"><ColorPicker value={color} onChange={setColor} /></div>
          </div>
          <div>
            <Label>Icon</Label>
            <div className="mt-1.5"><IconPicker value={icon} onChange={setIcon} /></div>
          </div>
          <DialogFooter>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TemplatePickerDialog({
  open, onOpenChange, onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (t: Template) => Promise<void>;
}) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("checklist_templates")
      .select("*, checklist_template_items(*)")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setTemplates((data as Template[]) ?? []);
        setLoading(false);
      });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Apply a template</DialogTitle></DialogHeader>
        {loading ? (
          <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No templates yet. Create one in the Templates page.
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-auto">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => onApply(t)}
                className="w-full flex items-center gap-3 p-3 rounded-md border border-border hover:bg-accent text-left"
              >
                <div className="w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: `color-mix(in oklab, ${t.color ?? "#3b82f6"} 20%, transparent)` }}>
                  <DynamicIcon name={t.icon} className="w-4 h-4" style={{ color: t.color ?? "#3b82f6" } as React.CSSProperties} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{t.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {(t.checklist_template_items?.length ?? 0)} items
                    {t.description ? ` · ${t.description}` : ""}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}