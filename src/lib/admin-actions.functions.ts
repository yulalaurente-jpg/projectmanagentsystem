import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => {
    if (!input || typeof input.userId !== "string" || input.userId.length < 10) {
      throw new Error("Invalid userId");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify caller is admin
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) {
      throw new Response("Forbidden: admin only", { status: 403 });
    }

    if (data.userId === userId) {
      throw new Response("You cannot delete your own account here", { status: 400 });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Null out references so cascading isn't required
    await admin.from("tasks").update({ assignee_id: null }).eq("assignee_id", data.userId);
    await admin.from("user_roles").delete().eq("user_id", data.userId);
    await admin.from("task_comments").delete().eq("user_id", data.userId);
    await admin.from("profiles").delete().eq("id", data.userId);

    const { error } = await admin.auth.admin.deleteUser(data.userId);
    if (error) throw new Response(error.message, { status: 500 });

    return { success: true };
  });

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createClient<Database>(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw new Response(error.message, { status: 500 });

    return {
      users: data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        provider: u.app_metadata?.provider ?? "email",
      })),
    };
  });