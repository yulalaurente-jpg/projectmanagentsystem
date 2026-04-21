import { useState } from "react";
import type { Tables, Enums } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronDown, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { StatusBadge, PriorityBadge, AssigneeAvatar } from "@/components/TaskBadges";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

type Task = Tables<"tasks">;
type Profile = Tables<"profiles">;

export function TaskRow({
  task,
  projectKey,
  index,
  subtasks,
  profiles,
  onOpen,
  onUpdate,
  onDelete,
  onAddSubtask,
  isSubtask = false,
}: {
  task: Task;
  projectKey: string;
  index: number;
  subtasks: Task[];
  profiles: Profile[];
  onOpen: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Task>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onAddSubtask: (parentId: string) => void;
  isSubtask?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasSubs = subtasks.length > 0;
  const assignee = profiles.find((p) => p.id === task.assignee_id);

  return (
    <>
      <div
        className={`grid grid-cols-[24px_60px_1fr_120px_100px_120px_120px_60px] gap-3 items-center px-6 py-2 border-b border-border text-sm hover:bg-accent/40 cursor-pointer transition-colors ${
          isSubtask ? "bg-muted/30 pl-12" : ""
        }`}
        onClick={() => onOpen(task.id)}
      >
        <div onClick={(e) => e.stopPropagation()}>
          {hasSubs ? (
            <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : null}
        </div>
        <div className="font-mono text-xs text-muted-foreground">
          {projectKey}-{index}
        </div>
        <div className="font-medium truncate">
          {task.title}
          {hasSubs && <span className="ml-2 text-xs text-muted-foreground">({subtasks.length})</span>}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <StatusSelect value={task.status} onChange={(v) => onUpdate(task.id, { status: v })} />
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <PrioritySelect value={task.priority} onChange={(v) => onUpdate(task.id, { priority: v })} />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <AssigneeAvatar profile={assignee} />
          <span className="text-xs text-muted-foreground truncate">{assignee?.display_name ?? "Unassigned"}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}
        </div>
        <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!isSubtask && (
                <DropdownMenuItem onClick={() => onAddSubtask(task.id)}>
                  <Plus className="w-4 h-4 mr-2" /> Add subtask
                </DropdownMenuItem>
              )}
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
          {subtasks.map((sub, i) => (
            <TaskRow
              key={sub.id}
              task={sub}
              projectKey={projectKey}
              index={parseInt(`${index}${i + 1}`)}
              subtasks={[]}
              profiles={profiles}
              onOpen={onOpen}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddSubtask={onAddSubtask}
              isSubtask
            />
          ))}
        </>
      )}
    </>
  );
}

function StatusSelect({ value, onChange }: { value: Enums<"task_status">; onChange: (v: Enums<"task_status">) => void }) {
  const opts: Enums<"task_status">[] = ["todo", "in_progress", "in_review", "done"];
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