import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, RequireAuth, RequireAdmin } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Shield, ShieldOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Trackr" },
      { name: "description", content: "Manage users and roles." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <RequireAdmin>
          <AdminPage />
        </RequireAdmin>
      </AppLayout>
    </RequireAuth>
  ),
});

interface RoleRow {
  user_id: string;
  role: "admin" | "user";
}

function AdminPage() {
  const [profiles, setProfiles] = useState<Array<{ id: string; email: string | null; display_name: string | null }>>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: p }, { data: r }] = await Promise.all([
      supabase.from("profiles").select("id, email, display_name").order("created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setProfiles(p ?? []);
    setRoles((r ?? []) as RoleRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const isAdmin = (uid: string) => roles.some((r) => r.user_id === uid && r.role === "admin");

  const toggleAdmin = async (uid: string) => {
    if (isAdmin(uid)) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "admin");
      if (error) return toast.error(error.message);
      toast.success("Admin role removed");
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
      if (error) return toast.error(error.message);
      toast.success("Promoted to admin");
    }
    load();
  };

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center bg-card">
        <h1 className="text-base font-semibold tracking-tight">User management</h1>
      </header>
      <div className="p-6">
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground font-medium grid grid-cols-[1fr_120px_120px] gap-3">
            <div>User</div>
            <div>Role</div>
            <div className="text-right">Actions</div>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : (
            profiles.map((p) => {
              const admin = isAdmin(p.id);
              const initials = (p.display_name || p.email || "?").slice(0, 2).toUpperCase();
              return (
                <div key={p.id} className="px-4 py-3 grid grid-cols-[1fr_120px_120px] gap-3 items-center border-b border-border last:border-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.display_name || "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                    </div>
                  </div>
                  <div>
                    {admin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                        <Shield className="w-3 h-3" /> Admin
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">User</span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" variant={admin ? "ghost" : "outline"} onClick={() => toggleAdmin(p.id)}>
                      {admin ? <><ShieldOff className="w-3.5 h-3.5 mr-1.5" /> Revoke</> : <><Shield className="w-3.5 h-3.5 mr-1.5" /> Promote</>}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </Card>
        <p className="text-xs text-muted-foreground mt-3">
          Tip: To make the first admin, promote yourself by running the promotion in the database directly, or have an existing admin grant the role.
        </p>
      </div>
    </>
  );
}