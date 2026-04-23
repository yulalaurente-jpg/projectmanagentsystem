import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MessageSquare, Hash, User as UserIcon, Plus, Search } from "lucide-react";
import { ChatView } from "@/components/chat/ChatView";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

type Channel = Tables<"chat_channels">;
type Project = Tables<"projects">;
type Profile = Tables<"profiles">;
type Member = Tables<"chat_channel_members">;

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — Trackr" },
      { name: "description", content: "Project group chats and direct messages." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppLayout>
        <ChatPage />
      </AppLayout>
    </RequireAuth>
  ),
});

function ChatPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [memberships, setMemberships] = useState<Member[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const load = async () => {
    setLoading(true);
    const [{ data: ch }, { data: pr }, { data: pf }, { data: mem }] = await Promise.all([
      supabase.from("chat_channels").select("*").order("created_at", { ascending: true }),
      supabase.from("projects").select("*"),
      supabase.from("profiles").select("*"),
      user
        ? supabase.from("chat_channel_members").select("*").eq("user_id", user.id)
        : Promise.resolve({ data: [] as Member[] }),
    ]);
    setChannels(ch ?? []);
    setProjects(pr ?? []);
    setProfiles(pf ?? []);
    setMemberships(mem ?? []);
    if (!activeId && ch && ch.length > 0) setActiveId(ch[0].id);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "Project";
  const projectKey = (id: string | null) => projects.find((p) => p.id === id)?.key ?? "";

  const projectChannels = channels.filter((c) => c.type === "project");
  const dmChannels = channels.filter(
    (c) => c.type === "direct" && memberships.some((m) => m.channel_id === c.id),
  );

  const dmCounterpartName = (channelId: string): { name: string; userId: string } => {
    const otherMember = memberships.find((m) => m.channel_id === channelId);
    // For DMs we need the OTHER user; fetch from members not in our memberships set:
    const ch = channels.find((c) => c.id === channelId);
    if (!ch) return { name: "DM", userId: "" };
    const known = otherMember; // current user's membership
    void known;
    // Use channel name as fallback
    return { name: ch.name ?? "Direct message", userId: "" };
  };

  const filtered = (list: Channel[]) =>
    !filter
      ? list
      : list.filter((c) => {
          const label =
            c.type === "project" ? projectName(c.project_id) : (c.name ?? dmCounterpartName(c.id).name);
          return label.toLowerCase().includes(filter.toLowerCase());
        });

  const startDM = async (otherUserId: string) => {
    if (!user || otherUserId === user.id) return;
    // Look for existing DM where both are members
    const { data: myDms } = await supabase
      .from("chat_channel_members")
      .select("channel_id, chat_channels!inner(id, type)")
      .eq("user_id", user.id);
    const candidateIds = (myDms ?? [])
      .filter((r: { chat_channels: { type: string } | null }) => r.chat_channels?.type === "direct")
      .map((r: { channel_id: string }) => r.channel_id);
    if (candidateIds.length > 0) {
      const { data: theirs } = await supabase
        .from("chat_channel_members")
        .select("channel_id")
        .eq("user_id", otherUserId)
        .in("channel_id", candidateIds);
      if (theirs && theirs.length > 0) {
        const existing = theirs[0].channel_id;
        setActiveId(existing);
        setNewDmOpen(false);
        return;
      }
    }
    const otherProfile = profiles.find((p) => p.id === otherUserId);
    const myProfile = profiles.find((p) => p.id === user.id);
    const dmName = `${myProfile?.display_name || myProfile?.email || "You"} & ${otherProfile?.display_name || otherProfile?.email || "Them"}`;
    const { data: ch, error } = await supabase
      .from("chat_channels")
      .insert({ type: "direct", name: dmName, created_by: user.id })
      .select()
      .single();
    if (error || !ch) {
      toast.error(error?.message ?? "Failed");
      return;
    }
    const { error: mErr } = await supabase.from("chat_channel_members").insert([
      { channel_id: ch.id, user_id: user.id },
      { channel_id: ch.id, user_id: otherUserId },
    ]);
    if (mErr) {
      toast.error(mErr.message);
      return;
    }
    setChannels((c) => [...c, ch]);
    setMemberships((m) => [...m, { id: "tmp", channel_id: ch.id, user_id: user.id, last_read_at: new Date().toISOString(), created_at: new Date().toISOString() }]);
    setActiveId(ch.id);
    setNewDmOpen(false);
    toast.success("Direct message started");
  };

  const active = useMemo(() => channels.find((c) => c.id === activeId) ?? null, [channels, activeId]);

  const activeLabel = active
    ? active.type === "project"
      ? `# ${projectName(active.project_id)}`
      : (active.name ?? "Direct message")
    : "";
  const activeSubLabel = active?.type === "project" ? `Project ${projectKey(active.project_id)}` : "Direct message";

  return (
    <div className="flex h-[calc(100vh-0px)] min-h-0">
      <aside className="w-72 border-r border-border bg-card flex flex-col">
        <div className="px-4 h-14 border-b border-border flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> <span className="font-semibold">Chat</span>
        </div>
        <div className="px-3 py-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter"
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-4">
          <div>
            <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Project channels
            </div>
            {loading ? (
              <div className="text-xs text-muted-foreground px-2">Loading…</div>
            ) : filtered(projectChannels).length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-2">No channels yet.</div>
            ) : (
              filtered(projectChannels).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                    activeId === c.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  }`}
                >
                  <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="truncate">{projectName(c.project_id)}</span>
                </button>
              ))
            )}
          </div>

          <div>
            <div className="px-2 py-1 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Direct messages
              </span>
              <Dialog open={newDmOpen} onOpenChange={setNewDmOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Start a direct message</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-1 max-h-[400px] overflow-y-auto">
                    {profiles
                      .filter((p) => p.id !== user?.id)
                      .map((p) => (
                        <button
                          key={p.id}
                          onClick={() => startDM(p.id)}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-accent text-left"
                        >
                          <Avatar className="w-7 h-7">
                            <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                              {(p.display_name || p.email || "?").slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{p.display_name || p.email}</div>
                            <div className="text-[10px] text-muted-foreground truncate">{p.email}</div>
                          </div>
                        </button>
                      ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {filtered(dmChannels).length === 0 ? (
              <div className="text-xs text-muted-foreground px-2 py-2">No DMs yet. Click + to start one.</div>
            ) : (
              filtered(dmChannels).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                    activeId === c.id ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                  }`}
                >
                  <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="truncate">{c.name ?? "Direct message"}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        {active ? (
          <ChatView
            channelId={active.id}
            channelLabel={activeLabel}
            channelSubLabel={activeSubLabel}
            profiles={profiles}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a channel to start chatting.
          </div>
        )}
      </div>
    </div>
  );
}