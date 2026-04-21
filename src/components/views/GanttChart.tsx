import { useMemo } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { differenceInDays, format, max, min, startOfDay, addDays } from "date-fns";

type Task = Tables<"tasks">;
type Profile = Tables<"profiles">;

const STATUS_COLOR: Record<string, string> = {
  todo: "var(--status-todo)",
  in_progress: "var(--status-progress)",
  in_review: "var(--status-review)",
  done: "var(--status-done)",
};

export function GanttChart({
  tasks,
  profiles,
  onOpen,
}: {
  tasks: Task[];
  profiles: Profile[];
  onOpen: (id: string) => void;
}) {
  const dated = useMemo(
    () =>
      tasks
        .filter((t) => !t.parent_task_id)
        .map((t) => {
          const start = startOfDay(new Date(t.start_date ?? t.created_at));
          const end = t.due_date ? startOfDay(new Date(t.due_date)) : addDays(start, 3);
          return { task: t, start, end: end < start ? addDays(start, 1) : end };
        }),
    [tasks],
  );

  if (dated.length === 0) {
    return <div className="p-12 text-center text-sm text-muted-foreground">No tasks to display.</div>;
  }

  const rangeStart = startOfDay(min(dated.map((d) => d.start)));
  const rangeEnd = max(dated.map((d) => d.end));
  const totalDays = Math.max(differenceInDays(rangeEnd, rangeStart) + 1, 7);
  const dayWidth = 32;
  const chartWidth = totalDays * dayWidth;

  const days = Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i));

  return (
    <div className="overflow-auto p-6">
      <div className="inline-block min-w-full border border-border rounded-md bg-card">
        {/* Header */}
        <div className="grid border-b border-border bg-muted/40" style={{ gridTemplateColumns: `260px ${chartWidth}px` }}>
          <div className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-r border-border">Task</div>
          <div className="flex">
            {days.map((d, i) => {
              const isMonthStart = d.getDate() === 1 || i === 0;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`flex-shrink-0 text-center text-[10px] py-1.5 border-r border-border/50 ${isWeekend ? "bg-muted/40" : ""}`}
                  style={{ width: dayWidth }}
                >
                  {isMonthStart && <div className="font-semibold">{format(d, "MMM")}</div>}
                  <div className="text-muted-foreground">{format(d, "d")}</div>
                </div>
              );
            })}
          </div>
        </div>
        {/* Rows */}
        {dated.map(({ task, start, end }) => {
          const offset = differenceInDays(start, rangeStart);
          const span = differenceInDays(end, start) + 1;
          const assignee = profiles.find((p) => p.id === task.assignee_id);
          const color = STATUS_COLOR[task.status] ?? "var(--primary)";
          return (
            <div
              key={task.id}
              className="grid border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
              style={{ gridTemplateColumns: `260px ${chartWidth}px` }}
            >
              <div className="px-4 py-2 border-r border-border min-w-0 flex items-center gap-2">
                <button onClick={() => onOpen(task.id)} className="text-sm font-medium truncate text-left hover:text-primary">
                  {task.title}
                </button>
                {assignee && <span className="text-[10px] text-muted-foreground ml-auto">{assignee.display_name?.split(" ")[0]}</span>}
              </div>
              <div className="relative h-10">
                {days.map((d, i) => (
                  <div
                    key={i}
                    className={`absolute top-0 bottom-0 border-r border-border/30 ${d.getDay() === 0 || d.getDay() === 6 ? "bg-muted/20" : ""}`}
                    style={{ left: i * dayWidth, width: dayWidth }}
                  />
                ))}
                <button
                  onClick={() => onOpen(task.id)}
                  className="absolute top-2 bottom-2 rounded shadow-sm hover:shadow-md hover:ring-2 hover:ring-primary/40 transition-all flex items-center px-2 text-[11px] font-medium text-white truncate"
                  style={{
                    left: offset * dayWidth + 2,
                    width: span * dayWidth - 4,
                    backgroundColor: color,
                  }}
                  title={`${task.title} · ${format(start, "MMM d")} → ${format(end, "MMM d")}`}
                >
                  {task.title}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}