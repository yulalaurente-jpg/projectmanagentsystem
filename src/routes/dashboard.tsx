import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Legend,
} from "recharts";
import type { Tables } from "@/integrations/supabase/types";
import {
  FolderKanban, ListTodo, CheckCircle2, Clock, AlertCircle,
  Package, AlertTriangle, Users, DollarSign, Timer, ArrowRight,
} from "lucide-react";
import { format, subDays, startOfDay } from "date-fns";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Trackr" },
      { name: "description", content: "At-a-glance overview of projects, tasks, inventory and workforce." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <DashboardPage />
      </AppLayout>
    </RequireAuth>
  ),
});

type Task = Tables<"tasks">;
type Project = Tables<"projects">;
type Material = Tables<"materials">;
type MaterialRequest = Tables<"material_requests">;
type Employee = Tables<"employees">;
type DTR = Tables<"daily_time_records">;

const STATUS_COLORS: Record<string, string> = {
  todo: "#94a3b8", in_progress: "#3b82f6", in_review: "#a855f7", done: "#10b981",
};

function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [dtrs, setDtrs] = useState<DTR[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [t, p, m, r, e, d] = await Promise.all([
        supabase.from("tasks").select("*"),
        supabase.from("projects").select("*"),
        supabase.from("materials").select("*"),
        supabase.from("material_requests").select("*"),
        supabase.from("employees").select("*"),
        supabase.from("daily_time_records").select("*"),
      ]);
      setTasks(t.data ?? []);
      setProjects(p.data ?? []);
      setMaterials(m.data ?? []);
      setRequests(r.data ?? []);
      setEmployees(e.data ?? []);
      setDtrs(d.data ?? []);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const done = tasks.filter((t) => t.status === "done").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const overdue = tasks.filter(
      (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done" && t.status !== "removed",
    ).length;
    const lowStock = materials.filter((m) => Number(m.stock_quantity ?? 0) <= Number(m.min_stock ?? 0)).length;
    const pendingReq = requests.filter((r) => r.status === "requested").length;
    const payroll = dtrs.reduce((s, d) => {
      const emp = employees.find((e) => e.id === d.employee_id);
      const rate = Number(emp?.hourly_rate ?? 0);
      return s + rate * (Number(d.total_hours ?? 0) + Number(d.overtime_hours ?? 0) * 0.5);
    }, 0);
    const totalHours = dtrs.reduce((s, d) => s + Number(d.total_hours ?? 0), 0);
    return {
      projects: projects.length, tasks: tasks.length, done, inProgress, overdue,
      materials: materials.length, lowStock, pendingReq,
      employees: employees.length, payroll, totalHours,
    };
  }, [tasks, projects, materials, requests, employees, dtrs]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach((t) => (counts[t.status] = (counts[t.status] ?? 0) + 1));
    return Object.entries(counts).map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] ?? "#64748b" }));
  }, [tasks]);

  const trendData = useMemo(() => {
    const days = 14;
    const today = startOfDay(new Date());
    return Array.from({ length: days }, (_, i) => {
      const day = subDays(today, days - 1 - i);
      const created = tasks.filter((t) => startOfDay(new Date(t.created_at)).getTime() === day.getTime()).length;
      const completed = tasks.filter((t) => t.status === "done" && startOfDay(new Date(t.updated_at)).getTime() === day.getTime()).length;
      return { date: format(day, "MMM d"), created, completed };
    });
  }, [tasks]);

  const projectData = useMemo(() => projects.slice(0, 8).map((p) => ({
    name: p.key,
    tasks: tasks.filter((t) => t.project_id === p.id).length,
    done: tasks.filter((t) => t.project_id === p.id && t.status === "done").length,
  })), [projects, tasks]);

  const recentTasks = useMemo(
    () => [...tasks].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 6),
    [tasks],
  );

  if (loading) return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center bg-card">
        <h1 className="text-base font-semibold tracking-tight">Dashboard</h1>
      </header>
      <div className="p-6 text-muted-foreground">Loading dashboard…</div>
    </>
  );

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center bg-card">
        <h1 className="text-base font-semibold tracking-tight">Dashboard</h1>
      </header>
      <div className="p-6 overflow-auto space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Projects" value={stats.projects} icon={FolderKanban} color="text-blue-500" to="/projects" />
          <StatCard label="Open Tasks" value={stats.tasks - stats.done} icon={ListTodo} color="text-foreground" to="/projects" />
          <StatCard label="In Progress" value={stats.inProgress} icon={Clock} color="text-blue-500" />
          <StatCard label="Overdue" value={stats.overdue} icon={AlertCircle} color="text-red-500" />
          <StatCard label="Materials" value={stats.materials} icon={Package} color="text-foreground" to="/inventory" />
          <StatCard label="Low Stock" value={stats.lowStock} icon={AlertTriangle} color="text-amber-500" to="/inventory" />
          <StatCard label="Employees" value={stats.employees} icon={Users} color="text-foreground" to="/employees" />
          <StatCard label="Est. Payroll" value={`$${stats.payroll.toFixed(0)}`} icon={DollarSign} color="text-emerald-500" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-1">Tasks by Status</h3>
            <p className="text-xs text-muted-foreground mb-4">Across all projects</p>
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
            <h3 className="text-sm font-semibold mb-1">Tasks per Project</h3>
            <p className="text-xs text-muted-foreground mb-4">Total vs completed</p>
            <ResponsiveContainer width="100%" height={240}>
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">Recent Activity</h3>
                <p className="text-xs text-muted-foreground">Latest task updates</p>
              </div>
              <Link to="/projects" className="text-xs text-primary flex items-center gap-1 hover:underline">
                View all <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="space-y-2">
              {recentTasks.length === 0 && <p className="text-xs text-muted-foreground">No tasks yet.</p>}
              {recentTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(t.updated_at), "MMM d, h:mm a")}</div>
                  </div>
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-medium ml-3 shrink-0"
                    style={{ backgroundColor: `${STATUS_COLORS[t.status] ?? "#64748b"}20`, color: STATUS_COLORS[t.status] ?? "#64748b" }}
                  >
                    {t.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-1">Workforce Snapshot</h3>
            <p className="text-xs text-muted-foreground mb-4">Hours and pending items</p>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat icon={Timer} label="Total Hours Logged" value={stats.totalHours.toFixed(1)} color="text-blue-500" />
              <MiniStat icon={CheckCircle2} label="Completed Tasks" value={stats.done} color="text-emerald-500" />
              <MiniStat icon={Package} label="Pending Requests" value={stats.pendingReq} color="text-amber-500" />
              <MiniStat icon={Users} label="Active Employees" value={stats.employees} color="text-foreground" />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function StatCard({
  label, value, icon: Icon, color, to,
}: { label: string; value: number | string; icon: React.ComponentType<{ className?: string }>; color: string; to?: "/projects" | "/inventory" | "/employees" }) {
  const inner = (
    <Card className="p-4 hover:shadow-md transition-shadow h-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

function MiniStat({
  icon: Icon, label, value, color,
}: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number; color: string }) {
  return (
    <div className="border border-border rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
