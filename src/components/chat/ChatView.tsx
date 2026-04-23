import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

type Message = Tables<"chat_messages">;
type Profile = Tables<"profiles">;

export function ChatView({
  channelId,
  channelLabel,
  channelSubLabel,
  profiles,
}: {
  channelId: string;
  channelLabel: string;
  channelSubLabel?: string;
  profiles: Profile[];
}) {
  const { user, isAdmin } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const p = profileMap.get(id);
    return p?.display_name || p?.email?.split("@")[0] || "User";
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessages([]);
    setEditingId(null);
    supabase
      .from("chat_messages")
      .select("*")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: true })
      .limit(500)
      .then(({ data }) => {
        if (!active) return;
        setMessages(data ?? []);
        setLoading(false);
      });

    const channel = supabase
      .channel(`chat-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMessages((m) => (m.some((x) => x.id === (payload.new as Message).id) ? m : [...m, payload.new as Message]));
          } else if (payload.eventType === "UPDATE") {
            setMessages((m) => m.map((x) => (x.id === (payload.new as Message).id ? (payload.new as Message) : x)));
          } else if (payload.eventType === "DELETE") {
            setMessages((m) => m.filter((x) => x.id !== (payload.old as Message).id));
          }
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const content = text.trim();
    if (!content || !user) return;
    setText("");
    const optimistic: Message = {
      id: `tmp-${Date.now()}`,
      channel_id: channelId,
      user_id: user.id,
      content,
      edited_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    const { data, error } = await supabase
      .from("chat_messages")
      .insert({ channel_id: channelId, user_id: user.id, content })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setText(content);
      return;
    }
    if (data) {
      setMessages((m) => m.map((x) => (x.id === optimistic.id ? data : x)));
    }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const content = editText.trim();
    if (!content) return;
    const { error } = await supabase
      .from("chat_messages")
      .update({ content, edited_at: new Date().toISOString() })
      .eq("id", editingId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditingId(null);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this message?")) return;
    const { error } = await supabase.from("chat_messages").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-5 py-3">
        <div className="font-semibold text-sm">{channelLabel}</div>
        {channelSubLabel && <div className="text-xs text-muted-foreground">{channelSubLabel}</div>}
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
        {loading ? (
          <div className="text-xs text-muted-foreground">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-12">
            No messages yet. Say hi 👋
          </div>
        ) : (
          messages.map((m, idx) => {
            const prev = messages[idx - 1];
            const showHeader = !prev || prev.user_id !== m.user_id;
            const own = m.user_id === user?.id;
            const canModify = own || isAdmin;
            const initials = nameOf(m.user_id).slice(0, 2).toUpperCase();
            return (
              <div key={m.id} className="flex gap-2.5 group">
                <div className="w-8 shrink-0">
                  {showHeader && (
                    <Avatar className="w-8 h-8">
                      <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  {showHeader && (
                    <div className="flex items-baseline gap-2 mb-0.5">
                      <span className="text-xs font-semibold">{nameOf(m.user_id)}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  )}
                  {editingId === m.id ? (
                    <div className="flex gap-1">
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        className="h-7 text-sm"
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={saveEdit}>
                        <Check className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div
                        className={`text-sm whitespace-pre-wrap rounded px-2.5 py-1 ${own ? "bg-primary/10" : "bg-muted/40"}`}
                      >
                        {m.content}
                        {m.edited_at && (
                          <span className="text-[10px] text-muted-foreground ml-1">(edited)</span>
                        )}
                      </div>
                      {canModify && (
                        <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0">
                          {own && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                setEditingId(m.id);
                                setEditText(m.content);
                              }}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive"
                            onClick={() => remove(m.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="border-t border-border p-3 bg-card">
        <div className="flex gap-2 items-end">
          <Textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Write a message…  (Shift+Enter for newline)"
            className="min-h-[38px] max-h-[120px] resize-none"
          />
          <Button size="icon" onClick={send} disabled={!text.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}