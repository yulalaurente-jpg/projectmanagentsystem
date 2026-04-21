import * as Lucide from "lucide-react";
import { cn } from "@/lib/utils";

export const ICON_OPTIONS = [
  "folder", "file-text", "list-checks", "check-square", "clipboard-list",
  "rocket", "target", "flag", "star", "heart", "zap", "bug",
  "book-open", "lightbulb", "calendar", "users", "code", "wrench",
  "shield", "package", "trending-up", "alert-triangle",
] as const;

export type IconName = (typeof ICON_OPTIONS)[number];

const NAME_MAP: Record<string, string> = {
  "folder": "Folder",
  "file-text": "FileText",
  "list-checks": "ListChecks",
  "check-square": "CheckSquare",
  "clipboard-list": "ClipboardList",
  "rocket": "Rocket",
  "target": "Target",
  "flag": "Flag",
  "star": "Star",
  "heart": "Heart",
  "zap": "Zap",
  "bug": "Bug",
  "book-open": "BookOpen",
  "lightbulb": "Lightbulb",
  "calendar": "Calendar",
  "users": "Users",
  "code": "Code",
  "wrench": "Wrench",
  "shield": "Shield",
  "package": "Package",
  "trending-up": "TrendingUp",
  "alert-triangle": "AlertTriangle",
};

export function DynamicIcon({
  name,
  className,
  style,
}: {
  name: string | null | undefined;
  className?: string;
  style?: React.CSSProperties;
}) {
  const compName = NAME_MAP[name ?? "folder"] ?? "Folder";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (Lucide as any)[compName] ?? Lucide.Folder;
  return <Icon className={className} style={style} />;
}

export function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1.5 p-2 border border-border rounded-md max-h-48 overflow-auto bg-card">
      {ICON_OPTIONS.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          className={cn(
            "h-8 w-8 rounded flex items-center justify-center transition-colors",
            value === name ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground hover:text-foreground",
          )}
          title={name}
        >
          <DynamicIcon name={name} className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
}

export const COLOR_OPTIONS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b",
  "#10b981", "#14b8a6", "#06b6d4", "#64748b", "#1f2937",
];

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "w-7 h-7 rounded-md border-2 transition-transform",
            value === c ? "border-foreground scale-110" : "border-transparent hover:scale-105",
          )}
          style={{ backgroundColor: c }}
          aria-label={`Color ${c}`}
        />
      ))}
    </div>
  );
}