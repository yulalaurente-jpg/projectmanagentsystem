import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_task",
  title: "Create task",
  description: "Create a new task in a project. The signed-in user is set as the reporter.",
  inputSchema: {
    projectId: z.string().uuid().describe("Project to add the task to."),
    title: z.string().trim().min(1).describe("Task title."),
    description: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    status: z
      .enum(["todo", "in_progress", "in_review", "done", "on_hold", "provision", "removed"])
      .optional(),
    dueDate: z.string().optional().describe("ISO date (YYYY-MM-DD)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ projectId, title, description, priority, status, dueDate }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        project_id: projectId,
        title,
        description: description ?? null,
        priority: priority ?? "medium",
        status: status ?? "todo",
        due_date: dueDate ?? null,
        reporter_id: ctx.getUserId()!,
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created task ${data.id}` }],
      structuredContent: { task: data },
    };
  },
});