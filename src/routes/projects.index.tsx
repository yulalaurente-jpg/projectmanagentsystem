import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Plus, FolderKanban, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/projects/")({
  head: () => ({
    meta: [
      { title: "Projects — Trackr" },
      { name: "description", content: "All projects in your workspace." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <ProjectsPage />
      </AppLayout>
    </RequireAuth>
  ),
});

interface Project {
  id: string;
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  created_by: string;
  created_at: string;
}

function ProjectsPage() {
  const { user, isAdmin } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});
  const [form, setForm] = useState({ name: "", key: "", description: "", color: "#3b82f6" });

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("projects").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setProjects(data ?? []);
    if (data) {
      const { data: counts } = await supabase.from("tasks").select("project_id");
      const c: Record<string, number> = {};
      counts?.forEach((t) => (c[t.project_id] = (c[t.project_id] ?? 0) + 1));
      setTaskCounts(c);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const key = form.key.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (!key) return toast.error("Key required");
    const { error } = await supabase.from("projects").insert({
      name: form.name.trim(),
      key,
      description: form.description || null,
      color: form.color,
      created_by: user.id,
    });
    if (error) return toast.error(error.message);
    toast.success("Project created");
    setOpen(false);
    setForm({ name: "", key: "", description: "", color: "#3b82f6" });
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this project and all its tasks?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    load();
  };

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center justify-between bg-card">
        <h1 className="text-base font-semibold tracking-tight">Projects</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> New project</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create project</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label>Name</Label>
                  <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value, key: form.key || e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Key</Label>
                  <Input required maxLength={6} value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })} placeholder="ABC" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-20 p-1" />
              </div>
              <DialogFooter>
                <Button type="submit">Create project</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>
      <div className="p-6">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : projects.length === 0 ? (
          <Card className="p-12 text-center">
            <FolderKanban className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-base font-semibold">No projects yet</h2>
            <p className="text-sm text-muted-foreground mb-4">Create your first project to start tracking tasks.</p>
            <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> New project</Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <Card key={p.id} className="group p-0 overflow-hidden hover:shadow-md transition-shadow">
                <Link to="/projects/$projectId" params={{ projectId: p.id }} className="block p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded text-xs font-bold text-primary-foreground flex items-center justify-center shrink-0" style={{ backgroundColor: p.color ?? "#3b82f6" }}>
                        {p.key.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{p.name}</div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">{p.key}</div>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[2.5rem]">
                    {p.description || "No description"}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{taskCounts[p.id] ?? 0} tasks</span>
                    <span>Created {new Date(p.created_at).toLocaleDateString()}</span>
                  </div>
                </Link>
                {(isAdmin || user?.id === p.created_by) && (
                  <div className="px-5 pb-3 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" onClick={() => del(p.id)} className="h-7 text-destructive hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}