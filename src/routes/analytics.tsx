import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
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
import { CheckCircle2, Clock, AlertCircle, ListTodo } from "lucide-react";
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

function AnalyticsPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: p }, { data: pr }] = await Promise.all([
        supabase.from("tasks").select("*"),
        supabase.from("profiles").select("*"),
        supabase.from("projects").select("*"),
      ]);
      setTasks(t ?? []);
      setProfiles(p ?? []);
      setProjects(pr ?? []);
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const overdue = tasks.filter(
      (t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done",
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

  if (loading) return <div className="p-6 text-muted-foreground">Loading analytics…</div>;

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center bg-card">
        <h1 className="text-base font-semibold tracking-tight">Analytics</h1>
      </header>
      <div className="p-6 space-y-6 overflow-auto">
        {/* Stat cards */}
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
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
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