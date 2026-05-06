import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { KanbanSquare, FolderKanban, Shield, LogOut, User as UserIcon, BarChart3, FileText, ListChecks, Package, MessageSquare, Users, ClipboardList, LayoutDashboard, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { type ReactNode } from "react";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  const navItems = [
    { to: "/dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { to: "/projects", label: "Projects", icon: FolderKanban },
    { to: "/inventory" as const, label: "Inventory", icon: Package },
    { to: "/employees" as const, label: "Employees", icon: Users },
    { to: "/dtr" as const, label: "Daily Job Records", icon: ClipboardList },
    { to: "/chat" as const, label: "Chat", icon: MessageSquare },
    { to: "/reports" as const, label: "Reports", icon: FileText },
    { to: "/templates" as const, label: "Checklists", icon: ListChecks },
    { to: "/analytics" as const, label: "Analytics", icon: BarChart3 },
    { to: "/finance" as const, label: "Finance", icon: DollarSign },
    ...(isAdmin ? [{ to: "/admin" as const, label: "Admin", icon: Shield }] : []),
  ];

  return (
    <div
        className="min-h-screen bg-background text-foreground grid grid-cols-[220px_1fr]"
      >
        <aside className="bg-sidebar-bg text-sidebar-fg flex flex-col border-r border-sidebar-border">
          <div className="flex items-center gap-2 px-4 h-14 border-b border-sidebar-border">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center shrink-0">
              <KanbanSquare className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">Trackr</span>
          </div>
          <nav className="flex-1 p-2 space-y-0.5">
            {navItems.map((item) => {
              const active = location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded transition-colors ${
                    active ? "bg-sidebar-accent text-sidebar-fg" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-fg"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-sidebar-border p-3 flex items-center gap-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user?.email}</div>
              <div className="text-[10px] uppercase tracking-wider text-sidebar-muted">{isAdmin ? "Admin" : "User"}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={handleSignOut} className="h-8 w-8 text-sidebar-muted hover:text-sidebar-fg hover:bg-sidebar-accent">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </aside>
        <main className="min-w-0 flex flex-col">{children}</main>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) {
    navigate({ to: "/auth" });
    return null;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return <div className="p-8 text-muted-foreground">Loading…</div>;
  if (!isAdmin) {
    return (
      <div className="p-12 text-center">
        <UserIcon className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h2 className="text-lg font-semibold">Admins only</h2>
        <p className="text-muted-foreground text-sm">You don't have permission to view this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}