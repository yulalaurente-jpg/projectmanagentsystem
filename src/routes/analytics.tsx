import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import type { Tables } from "@/integrations/supabase/types";
import {
  CheckCircle2, Clock, AlertCircle, ListTodo,
  Package, AlertTriangle, Truck, PackageCheck, XCircle,
} from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — Trackr" },
      { name: "description", content: "Project insights, charts, and workload distribution." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <AnalyticsPage />
      </AppLayout>
    </RequireAuth>
  ),
});

type Task = Tables<"tasks">;
type Profile = Tables<"profiles">;
type Project = Tables<"projects">;
type Material = Tables<"materials">;
type MaterialRequest = Tables<"material_requests">;

const STATUS_COLORS: Record<string, string> = {
  todo: "#94a3b8",
  in_progress: "#3b82f6",
  in_review: "#a855f7",
  done: "#10b981",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "#64748b",
  medium: "#3b82f6",
  high: "#f59e0b",
  urgent: "#ef4444",
};
const REQ_STATUS_COLORS: Record<string, string> = {
  requested: "#f59e0b",
  approved: "#3b82f6",
  arrived: "#8b5cf6",
  received: "#10b981",
  declined: "#ef4444",
};

function AnalyticsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: p }, { data: pr }, { data: m }, { data: r }] = await Promise.all([
        supabase.from("tasks").select("*"),
        supabase.from("profiles").select("*"),
        supabase.from("projects").select("*"),
        supabase.from("materials").select("*"),
        supabase.from("material_requests").select("*"),
      ]);
      setTasks(t ?? []);
      setProfiles(p ?? []);
      setProjects(pr ?? []);
      setMaterials(m ?? []);
      setRequests(r ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6 text-muted-foreground">Loading analytics…</div>;

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center bg-card">
        <h1 className="text-base font-semibold tracking-tight">Analytics</h1>
      </header>
      <div className="p-6 overflow-auto">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="project">Per Project</TabsTrigger>
            <TabsTrigger value="inventory">Inventory</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <OverviewTab tasks={tasks} profiles={profiles} projects={projects} />
          </TabsContent>

          <TabsContent value="project" className="space-y-6">
            <PerProjectTab tasks={tasks} profiles={profiles} projects={projects} requests={requests} materials={materials} />
          </TabsContent>

          <TabsContent value="inventory" className="space-y-6">
            <InventoryTab materials={materials} requests={requests} projects={projects} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

/* ---------------- Overview ---------------- */

function OverviewTab({ tasks, profiles, projects }: { tasks: Task[]; profiles: Profile[]; projects: Project[] }) {
  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const overdue = tasks.filter(
      (t) =>
        t.due_date &&
        new Date(t.due_date) < new Date() &&
        t.status !== "done" &&
        t.status !== "removed",
    ).length;
    return { total, done, inProgress, overdue };
  }, [tasks]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => (counts[t.status] = (counts[t.status] ?? 0) + 1));
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] }));
  }, [tasks]);

  const priorityData = useMemo(() => {
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    tasks.forEach((t) => (counts[t.priority] = (counts[t.priority] ?? 0) + 1));
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] }));
  }, [tasks]);

  const workloadData = useMemo(() => {
    type Row = { name: string; todo: number; in_progress: number; in_review: number; done: number };
    const map: Record<string, Row> = {};
    profiles.forEach((p) => {
      map[p.id] = { name: p.display_name || p.email || "Unknown", todo: 0, in_progress: 0, in_review: 0, done: 0 };
    });
    map["unassigned"] = { name: "Unassigned", todo: 0, in_progress: 0, in_review: 0, done: 0 };
    tasks.forEach((t) => {
      const key = t.assignee_id ?? "unassigned";
      const row = map[key];
      if (!row) return;
      row[t.status as keyof Omit<Row, "name">] += 1;
    });
    return Object.values(map).filter((m) => m.todo + m.in_progress + m.in_review + m.done > 0);
  }, [tasks, profiles]);

  const trendData = useMemo(() => {
    const days = 14;
    const today = startOfDay(new Date());
    return Array.from({ length: days }, (_, i) => {
      const day = subDays(today, days - 1 - i);
      const created = tasks.filter(
        (t) => startOfDay(new Date(t.created_at)).getTime() === day.getTime(),
      ).length;
      const completed = tasks.filter(
        (t) =>
          t.status === "done" &&
          startOfDay(new Date(t.updated_at)).getTime() === day.getTime(),
      ).length;
      return { date: format(day, "MMM d"), created, completed };
    });
  }, [tasks]);

  const projectData = useMemo(() => {
    return projects.map((p) => ({
      name: p.key,
      tasks: tasks.filter((t) => t.project_id === p.id).length,
      done: tasks.filter((t) => t.project_id === p.id && t.status === "done").length,
    }));
  }, [projects, tasks]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Tasks" value={stats.total} icon={ListTodo} color="text-foreground" />
        <StatCard label="In Progress" value={stats.inProgress} icon={Clock} color="text-blue-500" />
        <StatCard label="Completed" value={stats.done} icon={CheckCircle2} color="text-emerald-500" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertCircle} color="text-red-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Tasks by Status</h3>
          <p className="text-xs text-muted-foreground mb-4">Current distribution across all projects</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {statusData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Priority Distribution</h3>
          <p className="text-xs text-muted-foreground mb-4">Breakdown by urgency level</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={priorityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {priorityData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-1">Activity Trend (last 14 days)</h3>
          <p className="text-xs text-muted-foreground mb-4">Tasks created vs completed</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="created" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Workload by Assignee</h3>
          <p className="text-xs text-muted-foreground mb-4">Stacked task counts by status</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={workloadData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={100} />
              <Tooltip />
              <Legend />
              <Bar dataKey="todo" stackId="a" fill={STATUS_COLORS.todo} />
              <Bar dataKey="in_progress" stackId="a" fill={STATUS_COLORS.in_progress} />
              <Bar dataKey="in_review" stackId="a" fill={STATUS_COLORS.in_review} />
              <Bar dataKey="done" stackId="a" fill={STATUS_COLORS.done} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Tasks per Project</h3>
          <p className="text-xs text-muted-foreground mb-4">Total vs completed</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={projectData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="tasks" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="done" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </>
  );
}

/* ---------------- Per project ---------------- */

function PerProjectTab({
  tasks, profiles, projects, requests, materials,
}: {
  tasks: Task[]; profiles: Profile[]; projects: Project[];
  requests: MaterialRequest[]; materials: Material[];
}) {
  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");

  if (projects.length === 0) {
    return <div className="text-sm text-muted-foreground">No projects yet.</div>;
  }

  const project = projects.find((p) => p.id === projectId) ?? projects[0];
  const pTasks = tasks.filter((t) => t.project_id === project.id);
  const pRequests = requests.filter((r) => r.project_id === project.id);

  const stats = {
    total: pTasks.length,
    done: pTasks.filter((t) => t.status === "done").length,
    inProgress: pTasks.filter((t) => t.status === "in_progress").length,
    overdue: pTasks.filter(
      (t) =>
        t.due_date &&
        new Date(t.due_date) < new Date() &&
        t.status !== "done" &&
        t.status !== "removed",
    ).length,
  };
  const completion = stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const statusData = (() => {
    const counts: Record<string, number> = {};
    pTasks.forEach((t) => (counts[t.status] = (counts[t.status] ?? 0) + 1));
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] }));
  })();

  const priorityData = (() => {
    const counts: Record<string, number> = { low: 0, medium: 0, high: 0, urgent: 0 };
    pTasks.forEach((t) => (counts[t.priority] = (counts[t.priority] ?? 0) + 1));
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: PRIORITY_COLORS[name] }));
  })();

  const assigneeData = (() => {
    const map: Record<string, { name: string; tasks: number; done: number }> = {};
    profiles.forEach((p) => { map[p.id] = { name: p.display_name || p.email || "Unknown", tasks: 0, done: 0 }; });
    map["unassigned"] = { name: "Unassigned", tasks: 0, done: 0 };
    pTasks.forEach((t) => {
      const key = t.assignee_id ?? "unassigned";
      if (!map[key]) return;
      map[key].tasks += 1;
      if (t.status === "done") map[key].done += 1;
    });
    return Object.values(map).filter((r) => r.tasks > 0);
  })();

  const trendData = (() => {
    const days = 14;
    const today = startOfDay(new Date());
    return Array.from({ length: days }, (_, i) => {
      const day = subDays(today, days - 1 - i);
      const created = pTasks.filter((t) => startOfDay(new Date(t.created_at)).getTime() === day.getTime()).length;
      const completed = pTasks.filter(
        (t) => t.status === "done" && startOfDay(new Date(t.updated_at)).getTime() === day.getTime(),
      ).length;
      return { date: format(day, "MMM d"), created, completed };
    });
  })();

  const reqByStatus = (() => {
    const counts: Record<string, number> = {};
    pRequests.forEach((r) => (counts[r.status] = (counts[r.status] ?? 0) + 1));
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: REQ_STATUS_COLORS[name] }));
  })();

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Project</span>
        <Select value={project.id} onValueChange={setProjectId}>
          <SelectTrigger className="w-[280px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="font-mono text-xs mr-2 text-muted-foreground">{p.key}</span>{p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total Tasks" value={stats.total} icon={ListTodo} color="text-foreground" />
        <StatCard label="In Progress" value={stats.inProgress} icon={Clock} color="text-blue-500" />
        <StatCard label="Done" value={stats.done} icon={CheckCircle2} color="text-emerald-500" />
        <StatCard label="Overdue" value={stats.overdue} icon={AlertCircle} color="text-red-500" />
        <StatCard label="Completion" value={`${completion}%`} icon={CheckCircle2} color="text-emerald-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Status</h3>
          <p className="text-xs text-muted-foreground mb-4">Tasks for {project.name}</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {statusData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Priority</h3>
          <p className="text-xs text-muted-foreground mb-4">Urgency breakdown</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={priorityData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {priorityData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-1">Activity (last 14 days)</h3>
          <p className="text-xs text-muted-foreground mb-4">Created vs completed</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="created" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Assignee load</h3>
          <p className="text-xs text-muted-foreground mb-4">Tasks per teammate</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={assigneeData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={100} />
              <Tooltip />
              <Legend />
              <Bar dataKey="tasks" fill="#3b82f6" />
              <Bar dataKey="done" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Material requests</h3>
          <p className="text-xs text-muted-foreground mb-4">{pRequests.length} total · {materials.length} materials in catalog</p>
          {reqByStatus.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">
              No material requests for this project yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={reqByStatus} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {reqByStatus.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </>
  );
}

/* ---------------- Inventory analytics ---------------- */

function InventoryTab({
  materials, requests, projects,
}: {
  materials: Material[]; requests: MaterialRequest[]; projects: Project[];
}) {
  const lowStock = materials.filter((m) => Number(m.stock_quantity) <= Number(m.min_stock)).length;
  const totalUnits = materials.reduce((s, m) => s + Number(m.stock_quantity), 0);
  const totalValue = materials.reduce(
    (s, m) => s + Number(m.stock_quantity) * Number(m.unit_cost ?? 0),
    0,
  );

  const reqStatusData = (() => {
    const counts: Record<string, number> = { requested: 0, approved: 0, arrived: 0, received: 0, declined: 0 };
    requests.forEach((r) => (counts[r.status] = (counts[r.status] ?? 0) + 1));
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: REQ_STATUS_COLORS[name] }));
  })();

  const stockData = [...materials]
    .sort((a, b) => Number(b.stock_quantity) - Number(a.stock_quantity))
    .slice(0, 10)
    .map((m) => ({ name: m.name, stock: Number(m.stock_quantity), min: Number(m.min_stock) }));

  const categoryData = (() => {
    const map: Record<string, number> = {};
    materials.forEach((m) => {
      const k = m.category ?? "Uncategorized";
      map[k] = (map[k] ?? 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  })();

  const topRequested = (() => {
    const map: Record<string, { name: string; quantity: number; count: number }> = {};
    requests.forEach((r) => {
      const mat = materials.find((m) => m.id === r.material_id);
      const name = mat?.name ?? "Unknown";
      if (!map[r.material_id]) map[r.material_id] = { name, quantity: 0, count: 0 };
      map[r.material_id].quantity += Number(r.quantity);
      map[r.material_id].count += 1;
    });
    return Object.values(map).sort((a, b) => b.quantity - a.quantity).slice(0, 8);
  })();

  const requestsByProject = (() => {
    return projects.map((p) => ({
      name: p.key,
      requests: requests.filter((r) => r.project_id === p.id).length,
    })).filter((r) => r.requests > 0);
  })();

  const trendData = (() => {
    const days = 14;
    const today = startOfDay(new Date());
    return Array.from({ length: days }, (_, i) => {
      const day = subDays(today, days - 1 - i);
      const created = requests.filter(
        (r) => startOfDay(new Date(r.created_at)).getTime() === day.getTime(),
      ).length;
      const received = requests.filter(
        (r) => r.received_at && startOfDay(new Date(r.received_at)).getTime() === day.getTime(),
      ).length;
      return { date: format(day, "MMM d"), created, received };
    });
  })();

  const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#8b5cf6"];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Materials" value={materials.length} icon={Package} color="text-foreground" />
        <StatCard label="Low Stock" value={lowStock} icon={AlertTriangle} color={lowStock > 0 ? "text-amber-500" : "text-muted-foreground"} />
        <StatCard label="Total Units" value={totalUnits.toLocaleString()} icon={PackageCheck} color="text-blue-500" />
        <StatCard label="Stock Value" value={`$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={CheckCircle2} color="text-emerald-500" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <RequestStat label="Requested" value={requests.filter((r) => r.status === "requested").length} icon={Clock} color="#f59e0b" />
        <RequestStat label="Approved" value={requests.filter((r) => r.status === "approved").length} icon={CheckCircle2} color="#3b82f6" />
        <RequestStat label="Arrived" value={requests.filter((r) => r.status === "arrived").length} icon={Truck} color="#8b5cf6" />
        <RequestStat label="Received" value={requests.filter((r) => r.status === "received").length} icon={PackageCheck} color="#10b981" />
        <RequestStat label="Declined" value={requests.filter((r) => r.status === "declined").length} icon={XCircle} color="#ef4444" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Requests by Status</h3>
          <p className="text-xs text-muted-foreground mb-4">Lifecycle distribution</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={reqStatusData.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {reqStatusData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Stock Levels (top 10)</h3>
          <p className="text-xs text-muted-foreground mb-4">Current vs minimum</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stockData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={120} />
              <Tooltip />
              <Legend />
              <Bar dataKey="stock" fill="#3b82f6" />
              <Bar dataKey="min" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-1">Request Activity (last 14 days)</h3>
          <p className="text-xs text-muted-foreground mb-4">Created vs received</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" fontSize={11} stroke="hsl(var(--muted-foreground))" />
              <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="created" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="received" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Top Requested Materials</h3>
          <p className="text-xs text-muted-foreground mb-4">By total quantity</p>
          {topRequested.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">No requests yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topRequested} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <YAxis type="category" dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" width={120} />
                <Tooltip />
                <Bar dataKey="quantity" fill="#a855f7" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-1">Requests per Project</h3>
          <p className="text-xs text-muted-foreground mb-4">Where materials flow</p>
          {requestsByProject.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">No requests yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={requestsByProject}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="requests" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-1">Materials by Category</h3>
          <p className="text-xs text-muted-foreground mb-4">Catalog composition</p>
          {categoryData.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center text-xs text-muted-foreground">No materials yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {categoryData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </>
  );
}

/* ---------------- Shared cards ---------------- */

function StatCard({
  label, value, icon: Icon, color,
}: {
  label: string; value: number | string;
  icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-md bg-muted flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </div>
    </Card>
  );
}

function RequestStat({
  label, value, icon: Icon, color,
}: {
  label: string; value: number;
  icon: React.ComponentType<{ className?: string }>; color: string;
}) {
  return (
    <Card className="p-3 flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: `${color}1f`, color }}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
      </div>
    </Card>
  );
}