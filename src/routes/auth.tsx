import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KanbanSquare } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Trackr" },
      { name: "description", content: "Sign in or create an account to manage your projects and tasks." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    if (!loading && user) navigate({ to: "/projects" });
  }, [user, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) toast.error(error);
    else toast.success("Welcome back");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signUp(email, password, displayName);
    setSubmitting(false);
    if (error) toast.error(error);
    else toast.success("Account created — you're signed in.");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-sidebar-bg text-sidebar-fg">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded bg-primary flex items-center justify-center">
            <KanbanSquare className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-semibold tracking-tight">Trackr</span>
        </div>
        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Ship work faster with focused project tracking.
          </h1>
          <p className="text-sidebar-muted text-base leading-relaxed max-w-md">
            Organize projects, break tasks into subtasks, assign teammates, and track every status change in one dense, productive workspace.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4">
            {["Projects", "Tasks & Subtasks", "Roles"].map((f) => (
              <div key={f} className="text-xs uppercase tracking-wider text-sidebar-muted border-l-2 border-primary pl-3">
                {f}
              </div>
            ))}
          </div>
        </div>
        <div className="text-xs text-sidebar-muted">© Trackr — built for getting things done.</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 shadow-sm">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
              <KanbanSquare className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold">Trackr</span>
          </div>
          <Tabs defaultValue="signin">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email-in">Email</Label>
                  <Input id="email-in" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-in">Password</Label>
                  <Input id="password-in" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Sign in
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name-up">Display name</Label>
                  <Input id="name-up" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email-up">Email</Label>
                  <Input id="email-up" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password-up">Password</Label>
                  <Input id="password-up" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}