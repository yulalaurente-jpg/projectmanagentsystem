import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronLeft, Search } from "lucide-react";
import { toast } from "sonner";
import { TaskRow } from "@/components/TaskRow";
import { TaskDialog } from "@/components/TaskDialog";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import type { Tables, Enums } from "@/integrations/supabase/types";

export const Route = createFileRoute("/projects/$projectId")({
  head: ({ params }) => ({
    meta: [
      { title: `Project — Trackr` },
      { name: "description", content: `Tasks and subtasks for project ${params.projectId}.` },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <ProjectDetail />
      </AppLayout>
    </RequireAuth>
  ),
});

export type Task = Tables<"tasks">;
export type Project = Tables<"projects">;
export type Profile = Tables<"profiles">;

const STATUSES: { value: Enums<"task_status">; label: string; color: string }[] = [
  { value: "todo", label: "To Do", color: "var(--status-todo)" },
  { value: "in_progress", label: "In Progress", color: "var(--status-progress)" },
  { value: "in_review", label: "In Review", color: "var(--status-review)" },
  { value: "done", label: "Done", color: "var(--status-done)" },
];

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParent, setCreateParent] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: t }, { data: pr }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
      supabase.from("profiles").select("*"),
    ]);
    setProject(p ?? null);
    setTasks(t ?? []);
    setProfiles(pr ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const parentTasks = useMemo(() => {
    const filtered = tasks.filter((t) => !t.parent_task_id);
    if (!search) return filtered;
    const s = search.toLowerCase();
    return filtered.filter((t) => t.title.toLowerCase().includes(s));
  }, [tasks, search]);

  const subtasksOf = (id: string) => tasks.filter((t) => t.parent_task_id === id);

  const updateTask = async (id: string, patch: Partial<Task>) => {
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) return toast.error(error.message);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_task_id !== id));
    toast.success("Task deleted");
  };

  const createTask = async (input: {
    title: string;
    description: string;
    status: Enums<"task_status">;
    priority: Enums<"task_priority">;
    assignee_id: string | null;
    due_date: string | null;
    labels: string[];
    parent_task_id: string | null;
  }) => {
    if (!user) return;
    const { data, error } = await supabase
      .from("tasks")
      .insert({ ...input, project_id: projectId, reporter_id: user.id })
      .select()
      .single();
    if (error) return toast.error(error.message);
    if (data) setTasks((prev) => [...prev, data]);
    toast.success("Task created");
  };

  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!project) return <div className="p-6">Project not found.</div>;

  return (
    <>
      <header className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/projects" className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <div className="w-7 h-7 rounded text-xs font-bold text-primary-foreground flex items-center justify-center" style={{ backgroundColor: project.color ?? "#3b82f6" }}>
              {project.key.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">{project.name}</h1>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-mono">{project.key}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…" className="h-8 w-48 pl-8 text-sm" />
            </div>
            <Button size="sm" onClick={() => { setCreateParent(null); setCreateOpen(true); }}>
              <Plus className="w-4 h-4 mr-1.5" /> New task
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="border-b border-border bg-muted/30 px-6 py-2 grid grid-cols-[24px_60px_1fr_120px_100px_120px_120px_60px] gap-3 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          <div></div>
          <div>Key</div>
          <div>Title</div>
          <div>Status</div>
          <div>Priority</div>
          <div>Assignee</div>
          <div>Due</div>
          <div></div>
        </div>
        {parentTasks.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No tasks yet. Click "New task" to add one.
          </div>
        ) : (
          <div>
            {parentTasks.map((t, idx) => (
              <TaskRow
                key={t.id}
                task={t}
                projectKey={project.key}
                index={idx + 1}
                subtasks={subtasksOf(t.id)}
                profiles={profiles}
                onOpen={(id) => setOpenTaskId(id)}
                onUpdate={updateTask}
                onDelete={deleteTask}
                onAddSubtask={(parentId) => { setCreateParent(parentId); setCreateOpen(true); }}
              />
            ))}
          </div>
        )}
      </div>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        profiles={profiles}
        parentTaskId={createParent}
        onCreate={createTask}
      />
      <TaskDialog
        task={openTask}
        projectKey={project.key}
        profiles={profiles}
        subtasks={openTask ? subtasksOf(openTask.id) : []}
        onClose={() => setOpenTaskId(null)}
        onUpdate={updateTask}
        onDelete={deleteTask}
        onAddSubtask={(parentId) => { setCreateParent(parentId); setCreateOpen(true); setOpenTaskId(null); }}
      />
    </>
  );
}