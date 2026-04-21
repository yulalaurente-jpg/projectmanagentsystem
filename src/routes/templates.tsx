import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, ListChecks, GripVertical } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { DynamicIcon, IconPicker, ColorPicker } from "@/components/IconPicker";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Checklist Templates — Trackr" },
      { name: "description", content: "Reusable checklist blueprints for projects and tasks." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <TemplatesPage />
      </AppLayout>
    </RequireAuth>
  ),
});

type Template = Tables<"checklist_templates">;
type TemplateItem = Tables<"checklist_template_items">;

function TemplatesPage() {
  const { user, isAdmin } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: "#3b82f6", icon: "list-checks" });

  const load = async () => {
    setLoading(true);
    const { data: t } = await supabase.from("checklist_templates").select("*").order("created_at", { ascending: false });
    setTemplates(t ?? []);
    if (t && t.length > 0) {
      const { data: i } = await supabase
        .from("checklist_template_items")
        .select("*")
        .in("template_id", t.map((x) => x.id))
        .order("position");
      setItems(i ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("checklist_templates").insert({
      name: form.name.trim(),
      description: form.description || null,
      color: form.color,
      icon: form.icon,
      created_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Template created");
    setOpen(false);
    setForm({ name: "", description: "", color: "#3b82f6", icon: "list-checks" });
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this template?")) return;
    const { error } = await supabase.from("checklist_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  const addItem = async (templateId: string, label: string): Promise<void> => {
    if (!label.trim()) return;
    const max = items.filter((i) => i.template_id === templateId).length;
    const { data, error } = await supabase
      .from("checklist_template_items")
      .insert({ template_id: templateId, label: label.trim(), position: max })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    if (data) setItems((i) => [...i, data]);
  };

  const updateItem = async (id: string, label: string): Promise<void> => {
    const { error } = await supabase.from("checklist_template_items").update({ label }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((i) => i.map((x) => (x.id === id ? { ...x, label } : x)));
  };

  const removeItem = async (id: string): Promise<void> => {
    const { error } = await supabase.from("checklist_template_items").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setItems((i) => i.filter((x) => x.id !== id));
  };

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center justify-between bg-card">
        <h1 className="text-base font-semibold tracking-tight">Checklist Templates</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> New template</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create template</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" autoFocus />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1" />
              </div>
              <div>
                <Label>Color</Label>
                <div className="mt-1.5"><ColorPicker value={form.color} onChange={(v) => setForm({ ...form, color: v })} /></div>
              </div>
              <div>
                <Label>Icon</Label>
                <div className="mt-1.5"><IconPicker value={form.icon} onChange={(v) => setForm({ ...form, icon: v })} /></div>
              </div>
              <DialogFooter><Button type="submit">Create</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>
      <div className="p-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : templates.length === 0 ? (
          <Card className="p-12 text-center">
            <ListChecks className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-base font-semibold">No templates yet</h2>
            <p className="text-sm text-muted-foreground mb-4">Build reusable checklists you can apply to any project or task.</p>
            <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> New template</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {templates.map((t) => {
              const tItems = items.filter((i) => i.template_id === t.id).sort((a, b) => a.position - b.position);
              const canEdit = isAdmin || t.created_by === user?.id;
              return (
                <TemplateCard
                  key={t.id}
                  template={t}
                  items={tItems}
                  canEdit={canEdit}
                  onAddItem={(label) => addItem(t.id, label)}
                  onUpdateItem={updateItem}
                  onRemoveItem={removeItem}
                  onDelete={() => del(t.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function TemplateCard({
  template, items, canEdit, onAddItem, onUpdateItem, onRemoveItem, onDelete,
}: {
  template: Template;
  items: TemplateItem[];
  canEdit: boolean;
  onAddItem: (label: string) => Promise<void>;
  onUpdateItem: (id: string, label: string) => Promise<void>;
  onRemoveItem: (id: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [newLabel, setNewLabel] = useState("");

  return (
    <Card className="p-0 overflow-hidden border-l-4" style={{ borderLeftColor: template.color ?? "#3b82f6" }}>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2.5">
        <div className="w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: `color-mix(in oklab, ${template.color ?? "#3b82f6"} 20%, transparent)` }}>
          <DynamicIcon name={template.icon} className="w-4 h-4" style={{ color: template.color ?? "#3b82f6" } as React.CSSProperties} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{template.name}</div>
          <div className="text-xs text-muted-foreground truncate">{template.description || `${items.length} items`}</div>
        </div>
        {canEdit && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
      <div className="divide-y divide-border">
        {items.map((it) => (
          <div key={it.id} className="flex items-center gap-2 px-3 py-1.5 group hover:bg-accent/30">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40" />
            <Input
              defaultValue={it.label}
              onBlur={(e) => e.target.value !== it.label && canEdit && onUpdateItem(it.id, e.target.value)}
              disabled={!canEdit}
              className="h-7 border-0 bg-transparent shadow-none px-1 text-sm focus-visible:ring-1"
            />
            {canEdit && (
              <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive" onClick={() => onRemoveItem(it.id)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <form
          onSubmit={(e) => { e.preventDefault(); onAddItem(newLabel); setNewLabel(""); }}
          className="flex gap-2 px-3 py-2 border-t border-border bg-muted/20"
        >
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Add item…" className="h-7 text-sm" />
          <Button type="submit" size="sm" variant="ghost" className="h-7" disabled={!newLabel.trim()}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </form>
      )}
    </Card>
  );
}