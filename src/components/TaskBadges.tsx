import type { Enums, Tables } from "@/integrations/supabase/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CircleDashed, CircleDot, Eye, CheckCircle2, ArrowDown, Minus, ArrowUp, Flame } from "lucide-react";

const STATUS_CONFIG: Record<Enums<"task_status">, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  todo: { label: "To Do", color: "var(--status-todo)", icon: CircleDashed },
  in_progress: { label: "In Progress", color: "var(--status-progress)", icon: CircleDot },
  in_review: { label: "In Review", color: "var(--status-review)", icon: Eye },
  done: { label: "Done", color: "var(--status-done)", icon: CheckCircle2 },
};

const PRIORITY_CONFIG: Record<Enums<"task_priority">, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  low: { label: "Low", color: "var(--priority-low)", icon: ArrowDown },
  medium: { label: "Medium", color: "var(--priority-medium)", icon: Minus },
  high: { label: "High", color: "var(--priority-high)", icon: ArrowUp },
  urgent: { label: "Urgent", color: "var(--priority-urgent)", icon: Flame },
};

export function StatusBadge({ status }: { status: Enums<"task_status"> }) {
  const c = STATUS_CONFIG[status];
  const Icon = c.icon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `color-mix(in oklab, ${c.color} 15%, transparent)`, color: c.color }}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Enums<"task_priority"> }) {
  const c = PRIORITY_CONFIG[priority];
  const Icon = c.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: c.color }}>
      <Icon className="w-3.5 h-3.5" />
      {c.label}
    </span>
  );
}

export function AssigneeAvatar({ profile }: { profile?: Tables<"profiles"> }) {
  if (!profile) {
    return (
      <Avatar className="w-6 h-6 border border-dashed border-muted-foreground/40">
        <AvatarFallback className="bg-transparent text-[10px] text-muted-foreground">?</AvatarFallback>
      </Avatar>
    );
  }
  const initials = (profile.display_name || profile.email || "?").slice(0, 2).toUpperCase();
  return (
    <Avatar className="w-6 h-6">
      <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">{initials}</AvatarFallback>
    </Avatar>
  );
}