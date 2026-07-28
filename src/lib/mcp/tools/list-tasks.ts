import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "List tasks",
  description: "List tasks the signed-in user can see, optionally filtered by project or status.",
  inputSchema: {
    projectId: z.string().uuid().optional().describe("Filter to a project by id."),
    status: z
      .enum(["todo", "in_progress", "in_review", "done", "on_hold", "provision", "removed"])
      .optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("tasks")
      .select("id,title,status,priority,project_id,assignee_id,due_date,created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (projectId) q = q.eq("project_id", projectId);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { tasks: data },
    };
  },
});