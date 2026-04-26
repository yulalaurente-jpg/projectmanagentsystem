import { useState } from "react";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, MoreHorizontal, Plus, Trash2, GripVertical } from "lucide-react";
import { StatusBadge, PriorityBadge, AssigneeAvatar } from "@/components/TaskBadges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

type Task = Tables<"tasks">;
type Profile = Tables<"profiles">;

const TASK_COLORS = [
  { value: "", label: "None" },
  { value: "#3b82f6", label: "Blue" },
  { value: "#10b981", label: "Green" },
  { value: "#f59e0b", label: "Amber" },
  { value: "#ef4444", label: "Red" },
  { value: "#a855f7", label: "Purple" },
  { value: "#ec4899", label: "Pink" },
  { value: "#14b8a6", label: "Teal" },
];

export function TaskRow({
  task,
  projectKey,
  index,
  subtasksOf,
  profiles,
  onOpen,
  onUpdate,
  onDelete,
  onAddSubtask,
  onReorder,
  depth = 0,
}: {
  task: Task;
  projectKey: string;
  index: number;
  /** Returns direct children of a task id — used recursively for sub-sub-tasks. */
  subtasksOf: (parentId: string) => Task[];
  profiles: Profile[];
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddSubtask: (parentId: string) => void;
  /** Move task to a new position relative to a sibling. */
  onReorder?: (sourceId: string, targetId: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const children = subtasksOf(task.id);
  const hasSubs = children.length > 0;
  const assignee = profiles.find((p) => p.id === task.assignee_id);
  const indent = depth * 20;
  const colorBar = task.color || null;
  const isCompleted = task.status === "done" || task.status === "removed";
  const isOverdue =
    !!task.due_date && !isCompleted && new Date(task.due_date) < new Date();

  return (
    <>
      <div
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData("text/task-id", task.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (!onReorder) return;
          const id = e.dataTransfer.types.includes("text/task-id");
          if (id) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!onReorder) return;
          const sid = e.dataTransfer.getData("text/task-id");
          if (sid && sid !== task.id) onReorder(sid, task.id);
        }}
        className="grid grid-cols-[8px_18px_18px_56px_1fr_110px_92px_140px_100px_44px] gap-2 items-center px-4 py-1 border-b border-border text-[13px] hover:bg-accent/40 cursor-pointer transition-colors leading-tight"
        style={{ paddingLeft: 16 + indent }}
        onClick={() => onOpen(task.id)}
      >
        <div className="h-5 w-1 rounded-sm" style={{ backgroundColor: colorBar ?? "transparent" }} />
        <div onClick={(e) => e.stopPropagation()} className="text-muted-foreground/60">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          {hasSubs ? (
            <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : null}
        </div>
        <div className="font-mono text-[11px] text-muted-foreground truncate">
          {projectKey}-{index}
        </div>
        <div className="font-medium truncate">
          {task.title}
          {hasSubs && <span className="ml-1.5 text-[11px] text-muted-foreground font-normal">({children.length})</span>}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <StatusSelect value={task.status} onChange={(v) => onUpdate(task.id, { status: v })} />
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <PrioritySelect value={task.priority} onChange={(v) => onUpdate(task.id, { priority: v })} />
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <AssigneeAvatar profile={assignee} />
          <span className="text-[11px] text-muted-foreground truncate">{assignee?.display_name ?? "—"}</span>
        </div>
        <div
          className={`text-[11px] ${
            isOverdue
              ? "text-destructive font-medium"
              : isCompleted && task.due_date
              ? "text-muted-foreground/60 line-through"
              : "text-muted-foreground"
          }`}
        >
          {task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}
        </div>
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onAddSubtask(task.id)}>
                <Plus className="w-4 h-4 mr-2" /> Add sub-task
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Color
              </DropdownMenuLabel>
              <div className="flex flex-wrap gap-1 px-2 pb-2 max-w-[180px]">
                {TASK_COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => onUpdate(task.id, { color: c.value || null })}
                    title={c.label}
                    className={`w-5 h-5 rounded border ${task.color === c.value || (!task.color && !c.value) ? "ring-2 ring-ring" : ""}`}
                    style={{
                      backgroundColor: c.value || "transparent",
                      borderStyle: c.value ? "solid" : "dashed",
                      borderColor: c.value ? "transparent" : "var(--color-border)",
                    }}
                  />
                ))}
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(task.id)}>
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {expanded && hasSubs && (
        <>
          {children.map((sub, i) => (
            <TaskRow
              key={sub.id}
              task={sub}
              projectKey={projectKey}
              index={i + 1}
              subtasksOf={subtasksOf}
              profiles={profiles}
              onOpen={onOpen}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddSubtask={onAddSubtask}
              onReorder={onReorder}
              depth={depth + 1}
            />
          ))}
        </>
      )}
    </>
  );
}

function StatusSelect({ value, onChange }: { value: Enums<"task_status">; onChange: (v: Enums<"task_status">) => void }) {
  const opts: Enums<"task_status">[] = ["todo", "in_progress", "in_review", "done", "provision", "removed"];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button><StatusBadge status={value} /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {opts.map((o) => (
          <DropdownMenuItem key={o} onClick={() => onChange(o)}>
            <StatusBadge status={o} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PrioritySelect({ value, onChange }: { value: Enums<"task_priority">; onChange: (v: Enums<"task_priority">) => void }) {
  const opts: Enums<"task_priority">[] = ["low", "medium", "high", "urgent"];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button><PriorityBadge priority={value} /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {opts.map((o) => (
          <DropdownMenuItem key={o} onClick={() => onChange(o)}>
            <PriorityBadge priority={o} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}