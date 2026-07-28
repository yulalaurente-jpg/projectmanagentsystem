import { auth, defineMcp } from "@lovable.dev/mcp-js";
import whoamiTool from "./tools/whoami";
import listProjectsTool from "./tools/list-projects";
import listTasksTool from "./tools/list-tasks";
import createTaskTool from "./tools/create-task";

// The published SUPABASE_URL is rewritten to a .lovable.cloud proxy, which
// mcp-js rejects as an OAuth issuer (RFC 8414). Use the direct supabase.co host.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "trackr-mcp",
  title: "Trackr MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Trackr project & task tracker. Use `whoami` to verify auth, `list_projects` and `list_tasks` to read, and `create_task` to add work items.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listProjectsTool, listTasksTool, createTaskTool],
});