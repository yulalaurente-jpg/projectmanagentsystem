import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronLeft, Search, List, KanbanSquare, GanttChart as GanttIcon } from "lucide-react";
import { toast } from "sonner";
import { TaskRow } from "@/components/TaskRow";
import { TaskDialog } from "@/components/TaskDialog";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";
import { KanbanBoard } from "@/components/views/KanbanBoard";
import { GanttChart } from "@/components/views/GanttChart";
import { ChecklistPanel } from "@/components/ChecklistPanel";
import { MaterialsPanel } from "@/components/MaterialsPanel";
import { ManpowerPanel } from "@/components/ManpowerPanel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
export type Employee = Tables<"employees">;

const STATUSES: { value: Enums<"task_status">; label: string; color: string }[] = [
  { value: "todo", label: "To Do", color: "var(--status-todo)" },
  { value: "in_progress", label: "In Progress", color: "var(--status-progress)" },
  { value: "in_review", label: "In Review", color: "var(--status-review)" },
  { value: "done", label: "Done", color: "var(--status-done)" },
];

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { user, isAdmin } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projectEmployees, setProjectEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createParent, setCreateParent] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "kanban" | "gantt">("list");
  const [sortBy, setSortBy] = useState<"position" | "title" | "status" | "priority" | "due_date" | "created_at">("position");

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: t }, { data: pr }, { data: pe }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at", { ascending: true }),
      supabase.from("profiles").select("*"),
      supabase
        .from("project_employees")
        .select("employee:employees(*)")
        .eq("project_id", projectId),
    ]);
    setProject(p ?? null);
    setTasks(t ?? []);
    setProfiles(pr ?? []);
    const emps = ((pe ?? []) as Array<{ employee: Employee | null }>)
      .map((row) => row.employee)
      .filter((e): e is Employee => !!e);
    setProjectEmployees(emps);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const parentTasks = useMemo(() => {
    const filtered = tasks.filter((t) => !t.parent_task_id);
    const sorted = [...filtered].sort(sortFn(sortBy));
    if (!search) return sorted;
    const s = search.toLowerCase();
    return sorted.filter((t) => t.title.toLowerCase().includes(s));
  }, [tasks, search, sortBy]);

  const subtasksOf = (id: string) =>
    tasks.filter((t) => t.parent_task_id === id).sort(sortFn(sortBy));

  const canEditTask = (t: Task) =>
    !!user && (isAdmin || t.reporter_id === user.id || t.assignee_id === user.id);

  const reorder = async (sourceId: string, targetId: string) => {
    const src = tasks.find((t) => t.id === sourceId);
    const tgt = tasks.find((t) => t.id === targetId);
    if (!src || !tgt || src.id === tgt.id) return;
    // Move src to be sibling of tgt (same parent), placed at tgt's position.
    const newParent = tgt.parent_task_id;
    const siblings = tasks
      .filter((t) => t.parent_task_id === newParent && t.id !== src.id)
      .sort((a, b) => a.position - b.position);
    const insertIdx = siblings.findIndex((t) => t.id === tgt.id);
    siblings.splice(Math.max(0, insertIdx), 0, { ...src, parent_task_id: newParent });
    setSortBy("position");
    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => {
        const idx = siblings.findIndex((s) => s.id === t.id);
        if (idx === -1) return t;
        return { ...t, position: idx, parent_task_id: newParent };
      }),
    );
    // Persist new positions and parent
    await Promise.all(
      siblings.map((s, idx) =>
        supabase.from("tasks").update({ position: idx, parent_task_id: newParent }).eq("id", s.id),
      ),
    );
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    const { error } = await supabase.from("tasks").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const deleteTask = async (id: string) => {
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== id && t.parent_task_id !== id));
    toast.success("Task deleted");
  };

  const createTask = async (input: {
    title: string;
    description: string;
    status: Enums<"task_status">;
    priority: Enums<"task_priority">;
    assignee_id: string | null;
    employee_id: string | null;
    assignee_ids: string[];
    employee_ids: string[];
    due_date: string | null;
    start_date: string | null;
    labels: string[];
    parent_task_id: string | null;
  }) => {
    if (!user) return;
    const { assignee_ids, employee_ids, ...taskInput } = input;
    const { data, error } = await supabase
      .from("tasks")
      .insert({ ...taskInput, project_id: projectId, reporter_id: user.id })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data) {
      setTasks((prev) => [...prev, data]);
      if (assignee_ids.length) {
        await supabase.from("task_assignees").insert(
          assignee_ids.map((u) => ({ task_id: data.id, user_id: u, assigned_by: user.id })),
        );
      }
      if (employee_ids.length) {
        await supabase.from("task_employees").insert(
          employee_ids.map((e) => ({ task_id: data.id, employee_id: e, assigned_by: user.id })),
        );
      }
    }
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
            <div className="flex items-center bg-muted/60 rounded-md p-0.5">
              {([
                { v: "list", label: "List", Icon: List },
                { v: "kanban", label: "Board", Icon: KanbanSquare },
                { v: "gantt", label: "Gantt", Icon: GanttIcon },
              ] as const).map(({ v, label, Icon }) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
            {view === "list" && (
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Sort" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="position">Manual order</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                  <SelectItem value="priority">Priority</SelectItem>
                  <SelectItem value="due_date">Due date</SelectItem>
                  <SelectItem value="created_at">Created</SelectItem>
                </SelectContent>
              </Select>
            )}
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
        {view === "list" && (
          <>
            <div className="border-b border-border bg-muted/30 px-4 py-1.5 grid grid-cols-[8px_18px_18px_56px_1fr_110px_92px_140px_100px_44px] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              <div></div>
              <div></div>
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
                    subtasksOf={subtasksOf}
                    profiles={profiles}
                    onOpen={(id) => setOpenTaskId(id)}
                    onUpdate={updateTask}
                    onDelete={deleteTask}
                    onAddSubtask={(parentId) => { setCreateParent(parentId); setCreateOpen(true); }}
                    onReorder={reorder}
                    canEditTask={canEditTask}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {view === "kanban" && (
          <KanbanBoard
            tasks={tasks}
            profiles={profiles}
            projectKey={project.key}
            onOpen={(id) => setOpenTaskId(id)}
            onUpdate={updateTask}
          />
        )}
        {view === "gantt" && (
          <GanttChart tasks={tasks} profiles={profiles} onOpen={(id) => setOpenTaskId(id)} />
        )}
      </div>

      <div className="border-t border-border bg-card px-6 py-4">
        <Tabs defaultValue="checklist">
          <TabsList>
            <TabsTrigger value="checklist">Checklists</TabsTrigger>
            <TabsTrigger value="materials">Materials</TabsTrigger>
            <TabsTrigger value="manpower">Manpower</TabsTrigger>
          </TabsList>
          <TabsContent value="checklist" className="pt-3">
            <ChecklistPanel scope="project" scopeId={projectId} profiles={profiles} />
          </TabsContent>
          <TabsContent value="materials" className="pt-3">
            <MaterialsPanel projectId={projectId} canApprove={user?.id === project.created_by} />
          </TabsContent>
          <TabsContent value="manpower" className="pt-3">
            <ManpowerPanel projectId={projectId} canManage={user?.id === project.created_by} tasks={tasks} />
          </TabsContent>
        </Tabs>
      </div>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        profiles={profiles}
        employees={projectEmployees}
        parentTaskId={createParent}
        onCreate={createTask}
      />
      <TaskDialog
        task={openTask}
        projectKey={project.key}
        profiles={profiles}
        employees={projectEmployees}
        subtasks={openTask ? subtasksOf(openTask.id) : []}
        onClose={() => setOpenTaskId(null)}
        onUpdate={updateTask}
        onDelete={deleteTask}
        onAddSubtask={(parentId) => { setCreateParent(parentId); setCreateOpen(true); setOpenTaskId(null); }}
        canEdit={openTask ? canEditTask(openTask) : false}
      />
    </>
  );
}

function sortFn(field: "position" | "title" | "status" | "priority" | "due_date" | "created_at") {
  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const STATUS_ORDER: Record<string, number> = { in_progress: 0, in_review: 1, todo: 2, provision: 3, done: 4, removed: 5 };
  return (a: Task, b: Task) => {
    if (field === "title") return a.title.localeCompare(b.title);
    if (field === "priority") return (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
    if (field === "status") return (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (field === "due_date") {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    }
    if (field === "created_at") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return a.position - b.position;
  };
}