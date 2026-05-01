import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, RequireAuth, RequireAdmin } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Shield, ShieldOff, Trash2, Search, CheckCircle2, XCircle, Mail, Eye } from "lucide-react";
import { toast } from "sonner";
import { deleteUser, listUsers } from "@/server/admin-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  role: "admin" | "user" | "viewer";
}

interface AuthUser {
  id: string;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  provider: string;
}

function AdminPage() {
  const { user: currentUser } = useAuth();
  const [profiles, setProfiles] = useState<Array<{ id: string; email: string | null; display_name: string | null }>>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [authUsers, setAuthUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("id, email, display_name").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      setProfiles(p ?? []);
      setRoles((r ?? []) as RoleRow[]);
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        const result = await listUsers({
          headers: token ? { authorization: `Bearer ${token}` } : undefined,
        });
        setAuthUsers(result.users);
      } catch (err) {
        console.error("listUsers failed", err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const isAdmin = (uid: string) => roles.some((r) => r.user_id === uid && r.role === "admin");
  const isViewer = (uid: string) => roles.some((r) => r.user_id === uid && r.role === "viewer");

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

  const toggleViewer = async (uid: string) => {
    if (isViewer(uid)) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "viewer");
      if (error) return toast.error(error.message);
      toast.success("Viewer role removed");
    } else {
      // Remove admin if present, then assign viewer
      if (isAdmin(uid)) {
        await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "admin");
      }
      const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "viewer" });
      if (error) return toast.error(error.message);
      toast.success("Set as viewer");
    }
    load();
  };

  const handleDelete = async (uid: string) => {
    setBusy(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      await deleteUser({
        data: { userId: uid },
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
      });
      toast.success("User deleted");
      setConfirmDelete(null);
      load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete user";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const merged = profiles.map((p) => {
    const auth = authUsers.find((a) => a.id === p.id);
    return { ...p, auth };
  });
  const filtered = search
    ? merged.filter(
        (u) =>
          u.email?.toLowerCase().includes(search.toLowerCase()) ||
          u.display_name?.toLowerCase().includes(search.toLowerCase()),
      )
    : merged;
  const userToDelete = confirmDelete
    ? merged.find((u) => u.id === confirmDelete)
    : null;

  return (
    <>
      <header className="h-14 border-b border-border px-6 flex items-center bg-card">
        <h1 className="text-base font-semibold tracking-tight">User management</h1>
        <div className="ml-auto relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users…" className="h-8 w-56 pl-8 text-sm" />
        </div>
      </header>
      <div className="p-6">
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30 text-[11px] uppercase tracking-wider text-muted-foreground font-medium grid grid-cols-[1.5fr_1fr_100px_100px_100px_180px] gap-3">
            <div>User</div>
            <div>Provider · Verified</div>
            <div>Last seen</div>
            <div>Joined</div>
            <div>Role</div>
            <div className="text-right">Actions</div>
          </div>
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No users.</div>
          ) : (
            filtered.map((p) => {
              const admin = isAdmin(p.id);
              const viewer = isViewer(p.id);
              const initials = (p.display_name || p.email || "?").slice(0, 2).toUpperCase();
              const isSelf = currentUser?.id === p.id;
              return (
                <div key={p.id} className="px-4 py-3 grid grid-cols-[1.5fr_1fr_100px_100px_100px_180px] gap-3 items-center border-b border-border last:border-0 text-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="font-medium truncate flex items-center gap-1.5">
                        {p.display_name || "—"}
                        {isSelf && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">You</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{p.email}</div>
                    </div>
                  </div>
                  <div className="text-xs flex items-center gap-1.5 min-w-0">
                    <span className="capitalize">{p.auth?.provider ?? "—"}</span>
                    <span className="text-muted-foreground">·</span>
                    {p.auth?.email_confirmed_at ? (
                      <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-500">
                        <CheckCircle2 className="w-3 h-3" /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-500">
                        <XCircle className="w-3 h-3" /> Pending
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.auth?.last_sign_in_at ? new Date(p.auth.last_sign_in_at).toLocaleDateString() : "Never"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {p.auth?.created_at ? new Date(p.auth.created_at).toLocaleDateString() : "—"}
                  </div>
                  <div>
                    {admin ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary">
                        <Shield className="w-3 h-3" /> Admin
                      </span>
                    ) : viewer ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                        <Eye className="w-3 h-3" /> Viewer
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">User</span>
                    )}
                  </div>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant={admin ? "ghost" : "outline"} onClick={() => toggleAdmin(p.id)} disabled={isSelf} className="h-7 text-xs">
                      {admin ? <><ShieldOff className="w-3.5 h-3.5 mr-1" /> Revoke</> : <><Shield className="w-3.5 h-3.5 mr-1" /> Promote</>}
                    </Button>
                    <Button size="sm" variant={viewer ? "ghost" : "outline"} onClick={() => toggleViewer(p.id)} disabled={isSelf || admin} className="h-7 text-xs">
                      <Eye className="w-3.5 h-3.5 mr-1" /> {viewer ? "Unset" : "Viewer"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isSelf}
                      onClick={() => setConfirmDelete(p.id)}
                      className="h-7 text-xs text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </Card>
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
          <Mail className="w-3 h-3" />
          Deleting a user permanently removes their account, profile, comments, and unassigns their tasks.
        </p>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{userToDelete?.email ?? "this user"}</span>.
              Their tasks will be unassigned but kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => { e.preventDefault(); if (confirmDelete) handleDelete(confirmDelete); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Deleting…" : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}