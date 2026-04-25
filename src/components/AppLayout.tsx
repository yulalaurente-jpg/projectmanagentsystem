import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/context/AuthContext";
import { KanbanSquare, FolderKanban, Shield, LogOut, User as UserIcon, BarChart3, FileText, ListChecks, Package, MessageSquare, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useEffect, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("trackr.sidebar.collapsed") === "1";
  });
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("trackr.sidebar.collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  // Expand visually when hovered, even when collapsed
  const expanded = !collapsed || hovered;

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  const navItems = [
    { to: "/projects", label: "Projects", icon: FolderKanban },
    { to: "/inventory" as const, label: "Inventory", icon: Package },
    { to: "/employees" as const, label: "Employees", icon: Users },
    { to: "/dtr" as const, label: "Time Records", icon: Clock },
    { to: "/chat" as const, label: "Chat", icon: MessageSquare },
    { to: "/reports" as const, label: "Reports", icon: FileText },
    { to: "/templates" as const, label: "Checklists", icon: ListChecks },
    { to: "/analytics" as const, label: "Analytics", icon: BarChart3 },
    ...(isAdmin ? [{ to: "/admin" as const, label: "Admin", icon: Shield }] : []),
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="min-h-screen bg-background text-foreground transition-[grid-template-columns] duration-300 ease-out grid"
        style={{ gridTemplateColumns: `${collapsed ? 56 : 220}px 1fr` }}
      >
        <aside
          onMouseEnter={() => collapsed && setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={`bg-sidebar-bg text-sidebar-fg flex flex-col border-r border-sidebar-border transition-all duration-300 ease-out z-30 ${
            collapsed ? "fixed top-0 left-0 bottom-0" : "relative"
          }`}
          style={{ width: expanded ? 220 : 56 }}
        >
          <div className="flex items-center gap-2 px-3 h-14 border-b border-sidebar-border overflow-hidden">
            <div className="w-7 h-7 rounded bg-primary flex items-center justify-center shrink-0">
              <KanbanSquare className="w-4 h-4 text-primary-foreground" />
            </div>
            {expanded && <span className="font-semibold tracking-tight whitespace-nowrap">Trackr</span>}
            <button
              onClick={() => { setCollapsed((c) => !c); setHovered(false); }}
              className="ml-auto text-sidebar-muted hover:text-sidebar-fg p-1 rounded hover:bg-sidebar-accent/60 shrink-0"
              title={collapsed ? "Pin sidebar open" : "Auto-hide sidebar"}
            >
              <span className={`block w-1 h-4 rounded-full bg-current transition-transform ${collapsed ? "" : "rotate-180"}`} />
            </button>
          </div>
          <nav className="flex-1 p-2 space-y-0.5 overflow-hidden">
            {navItems.map((item) => {
              const active = location.pathname.startsWith(item.to);
              const Icon = item.icon;
              const link = (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-2.5 px-2.5 py-2 text-sm rounded transition-colors ${
                    active ? "bg-sidebar-accent text-sidebar-fg" : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-fg"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {expanded && <span className="whitespace-nowrap">{item.label}</span>}
                </Link>
              );
              return collapsed && !hovered ? (
                <Tooltip key={item.to}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ) : (
                link
              );
            })}
          </nav>
          <div className="border-t border-sidebar-border p-2 flex items-center gap-2 overflow-hidden">
            <Avatar className="w-8 h-8 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
            </Avatar>
            {expanded && (
              <>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{user?.email}</div>
                  <div className="text-[10px] uppercase tracking-wider text-sidebar-muted">{isAdmin ? "Admin" : "User"}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={handleSignOut} className="h-8 w-8 text-sidebar-muted hover:text-sidebar-fg hover:bg-sidebar-accent shrink-0">
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </aside>
        <main className="min-w-0 flex flex-col">{children}</main>
      </div>
    </TooltipProvider>
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