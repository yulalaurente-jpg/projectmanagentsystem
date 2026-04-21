import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Plus, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { DynamicIcon, IconPicker, ColorPicker } from "@/components/IconPicker";

export const Route = createFileRoute("/reports/")({
  head: () => ({
    meta: [
      { title: "Reports — Trackr" },
      { name: "description", content: "Shared reporting folders with notes and uploaded files." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <ReportsPage />
      </AppLayout>
    </RequireAuth>
  ),
});

type Folder = Tables<"report_folders">;

function ReportsPage() {
  const { user } = useAuth();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [counts, setCounts] = useState<Record<string, { reports: number; files: number }>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: "#3b82f6", icon: "folder" });

  const load = async () => {
    setLoading(true);
    const { data: f } = await supabase.from("report_folders").select("*").order("created_at", { ascending: false });
    setFolders(f ?? []);
    if (f && f.length > 0) {
      const ids = f.map((x) => x.id);
      const [{ data: rs }, { data: fs }] = await Promise.all([
        supabase.from("reports").select("folder_id").in("folder_id", ids),
        supabase.from("report_files").select("folder_id").in("folder_id", ids),
      ]);
      const c: Record<string, { reports: number; files: number }> = {};
      f.forEach((fl) => (c[fl.id] = { reports: 0, files: 0 }));
      rs?.forEach((r) => c[r.folder_id] && (c[r.folder_id].reports += 1));
      fs?.forEach((r) => c[r.folder_id] && (c[r.folder_id].files += 1));
      setCounts(c);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("report_folders").insert({
      name: form.name.trim(),
      description: form.description || null,
      color: form.color,
      icon: form.icon,
      created_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Folder created");
    setOpen(false);
    setForm({ name: "", description: "", color: "#3b82f6", icon: "folder" });
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete folder and all its contents?")) return;
    const { error } = await supabase.from("report_folders").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center justify-between bg-card">
        <h1 className="text-base font-semibold tracking-tight">Reports</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> New folder</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Create folder</DialogTitle></DialogHeader>
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
              <DialogFooter><Button type="submit">Create folder</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>
      <div className="p-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : folders.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-base font-semibold">No folders yet</h2>
            <p className="text-sm text-muted-foreground mb-4">Create a folder to start sharing reports and files.</p>
            <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> New folder</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {folders.map((f) => {
              const c = counts[f.id] ?? { reports: 0, files: 0 };
              return (
                <Card key={f.id} className="group p-0 overflow-hidden hover:shadow-md transition-shadow">
                  <Link to="/reports/$folderId" params={{ folderId: f.id }} className="block p-5">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `color-mix(in oklab, ${f.color ?? "#3b82f6"} 20%, transparent)` }}>
                        <DynamicIcon name={f.icon} className="w-5 h-5" style={{ color: f.color ?? "#3b82f6" } as React.CSSProperties} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold truncate">{f.name}</div>
                        <div className="text-xs text-muted-foreground line-clamp-2">{f.description || "No description"}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{c.reports} reports · {c.files} files</span>
                      <span>{new Date(f.created_at).toLocaleDateString()}</span>
                    </div>
                  </Link>
                  <div className="px-5 pb-3 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" onClick={() => del(f.id)} className="h-7 text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}