import type { Tables, Enums } from "@/integrations/supabase/types";
import { PriorityBadge, AssigneeAvatar } from "@/components/TaskBadges";
import { Card } from "@/components/ui/card";
import { useState } from "react";

type Task = Tables<"tasks">;
type Profile = Tables<"profiles">;

const COLUMNS: { id: Enums<"task_status">; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "var(--status-todo)" },
  { id: "in_progress", label: "In Progress", color: "var(--status-progress)" },
  { id: "in_review", label: "In Review", color: "var(--status-review)" },
  { id: "done", label: "Done", color: "var(--status-done)" },
];

export function KanbanBoard({
  tasks,
  profiles,
  projectKey,
  onOpen,
  onUpdate,
}: {
  tasks: Task[];
  profiles: Profile[];
  projectKey: string;
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<void>;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const onDrop = async (status: Enums<"task_status">) => {
    if (!dragId) return;
    const t = tasks.find((x) => x.id === dragId);
    if (t && t.status !== status) {
      await onUpdate(dragId, { status });
    }
    setDragId(null);
    setOverCol(null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 p-6 min-h-full">
      {COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.id && !t.parent_task_id);
        const isOver = overCol === col.id;
        return (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
            onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
            onDrop={() => onDrop(col.id)}
            className={`flex flex-col bg-muted/30 rounded-md border ${isOver ? "border-primary bg-primary/5" : "border-border"} transition-colors`}
          >
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-border">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.color }} />
                <span className="text-xs font-semibold uppercase tracking-wider">{col.label}</span>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{colTasks.length}</span>
            </div>
            <div className="flex-1 p-2 space-y-2 min-h-32">
              {colTasks.map((t, i) => {
                const assignee = profiles.find((p) => p.id === t.assignee_id);
                return (
                  <Card
                    key={t.id}
                    draggable
                    onDragStart={() => setDragId(t.id)}
                    onDragEnd={() => { setDragId(null); setOverCol(null); }}
                    onClick={() => onOpen(t.id)}
                    className="p-2.5 cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors"
                  >
                    <div className="text-[10px] font-mono text-muted-foreground mb-1">{projectKey}-{i + 1}</div>
                    <div className="text-sm font-medium leading-snug mb-2 line-clamp-2">{t.title}</div>
                    <div className="flex items-center justify-between">
                      <PriorityBadge priority={t.priority} />
                      <AssigneeAvatar profile={assignee} />
                    </div>
                    {t.due_date && (
                      <div className="text-[10px] text-muted-foreground mt-2">
                        Due {new Date(t.due_date).toLocaleDateString()}
                      </div>
                    )}
                  </Card>
                );
              })}
              {colTasks.length === 0 && (
                <div className="text-[11px] text-muted-foreground text-center py-6">No tasks</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}