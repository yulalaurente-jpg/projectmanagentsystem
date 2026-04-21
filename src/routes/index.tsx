import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    navigate({ to: user ? "/projects" : "/auth" });
  }, [user, loading, navigate]);
  return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
}
