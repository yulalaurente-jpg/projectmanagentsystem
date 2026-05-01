import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type MSOption = { value: string; label: string; sub?: string };

export function MultiSelectChips({
  options,
  values,
  onChange,
  placeholder = "Select…",
  emptyText = "No options",
  className,
  disabled = false,
}: {
  options: MSOption[];
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => values.includes(o.value));

  const toggle = (v: string) => {
    if (values.includes(v)) onChange(values.filter((x) => x !== v));
    else onChange([...values, v]);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="w-full justify-between h-8 text-xs font-normal"
          >
            <span className="truncate text-muted-foreground">
              {selected.length === 0
                ? placeholder
                : `${selected.length} selected`}
            </span>
            <ChevronsUpDown className="w-3.5 h-3.5 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-1" align="start">
          {options.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2">{emptyText}</div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {options.map((o) => {
                const checked = values.includes(o.value);
                return (
                  <button
                    type="button"
                    key={o.value}
                    onClick={() => toggle(o.value)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent text-left"
                  >
                    <Checkbox checked={checked} className="pointer-events-none" />
                    <span className="flex-1 min-w-0 truncate">
                      {o.label}
                      {o.sub ? <span className="text-muted-foreground"> · {o.sub}</span> : null}
                    </span>
                    {checked && <Check className="w-3.5 h-3.5 text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((o) => (
            <span
              key={o.value}
              className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground"
            >
              {o.label}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => toggle(o.value)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${o.label}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}