import * as React from "react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type BatchNode = { title: string; depth: number; children: BatchNode[] };

function parseLines(text: string): BatchNode[] {
  const roots: BatchNode[] = [];
  const stack: BatchNode[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    // Count leading indent: tab=1, 2 spaces=1. Also support leading "-" markers.
    let depth = 0;
    let i = 0;
    while (i < raw.length) {
      if (raw[i] === "\t") { depth++; i++; }
      else if (raw[i] === " " && raw[i + 1] === " ") { depth++; i += 2; }
      else if (raw[i] === " ") { i++; }
      else break;
    }
    let rest = raw.slice(i);
    // Allow dash markers like "- ", "-- ", "--- "
    const dashMatch = rest.match(/^(-+)\s+/);
    if (dashMatch) {
      depth = Math.max(depth, dashMatch[1].length - 1);
      rest = rest.slice(dashMatch[0].length);
    }
    rest = rest.replace(/^[•·*]\s+/, "").trim();
    if (!rest) continue;
    depth = Math.min(depth, 2);
    const node: BatchNode = { title: rest, depth, children: [] };
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    if (stack.length === 0) {
      node.depth = 0;
      roots.push(node);
    } else {
      node.depth = stack[stack.length - 1].depth + 1;
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return roots;
}

function countNodes(nodes: BatchNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.children), 0);
}

export function BatchAddTasksDialog({
  open,
  onOpenChange,
  parentTaskId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentTaskId: string | null;
  onSubmit: (nodes: BatchNode[], parentTaskId: string | null) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setText("");
      setBusy(false);
    }
  }, [open]);

  const parsed = parseLines(text);
  const total = countNodes(parsed);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.length) return;
    setBusy(true);
    try {
      await onSubmit(parsed, parentTaskId);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const renderPreview = (nodes: BatchNode[], depth = 0): React.ReactNode[] =>
    nodes.flatMap((n, idx) => [
      <div
        key={`${depth}-${idx}-${n.title}`}
        className="text-xs py-0.5"
        style={{ paddingLeft: depth * 16 }}
      >
        <span className="text-muted-foreground mr-1.5">
          {depth === 0 ? "•" : depth === 1 ? "◦" : "▸"}
        </span>
        {n.title}
      </div>,
      ...renderPreview(n.children, depth + 1),
    ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Batch add tasks</DialogTitle>
          <DialogDescription>
            One task per line. Indent with <kbd className="px-1 rounded bg-muted text-xs">Tab</kbd> or 2 spaces to make a subtask (up to 3 levels). Or use <code>-</code>, <code>--</code>, <code>---</code> prefixes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tasks</Label>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    const next = text.slice(0, start) + "\t" + text.slice(end);
                    setText(next);
                    requestAnimationFrame(() => {
                      el.selectionStart = el.selectionEnd = start + 1;
                    });
                  }
                }}
                rows={14}
                autoFocus
                placeholder={`Design homepage\n\tHero section\n\t\tHeadline copy\n\t\tCTA button\n\tFeatures grid\nSet up analytics`}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Preview ({total})</Label>
              <div className="border border-border rounded-md p-2 h-[298px] overflow-auto bg-muted/30">
                {parsed.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic">Nothing to add yet…</div>
                ) : (
                  renderPreview(parsed)
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || total === 0}>
              {busy ? "Adding…" : `Add ${total} task${total === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}