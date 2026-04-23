import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/AuthContext";
import type { Tables } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Pencil, Trash2, Check, X } from "lucide-react";
import { toast } from "sonner";

type Comment = Tables<"report_comments">;
type Profile = Tables<"profiles">;

export function CommentsThread({
  targetType,
  targetId,
  profiles,
  compact,
}: {
  targetType: "folder" | "file";
  targetId: string;
  profiles: Profile[];
  compact?: boolean;
}) {
  const { user, isAdmin } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const nameOf = (id: string) => {
    const p = profileMap.get(id);
    return p?.display_name || p?.email?.split("@")[0] || "User";
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("report_comments")
      .select("*")
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!active) return;
        setComments(data ?? []);
        setLoading(false);
      });
    const ch = supabase
      .channel(`comments-${targetType}-${targetId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "report_comments", filter: `target_id=eq.${targetId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Comment;
          if (row.target_type !== targetType) return;
          if (payload.eventType === "INSERT") {
            setComments((c) => (c.some((x) => x.id === row.id) ? c : [...c, payload.new as Comment]));
          } else if (payload.eventType === "UPDATE") {
            setComments((c) => c.map((x) => (x.id === row.id ? (payload.new as Comment) : x)));
          } else if (payload.eventType === "DELETE") {
            setComments((c) => c.filter((x) => x.id !== row.id));
          }
        },
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [targetType, targetId]);

  const extractMentions = (content: string): string[] => {
    const mentions: string[] = [];
    const re = /@([A-Za-z0-9_.@-]+)/g;
    let match;
    while ((match = re.exec(content)) !== null) {
      const handle = match[1].toLowerCase();
      const found = profiles.find(
        (p) =>
          (p.display_name?.toLowerCase().replace(/\s+/g, "") === handle.replace(/\s+/g, "")) ||
          p.email?.toLowerCase().split("@")[0] === handle,
      );
      if (found) mentions.push(found.id);
    }
    return Array.from(new Set(mentions));
  };

  const submit = async () => {
    const content = text.trim();
    if (!content || !user) return;
    const mentions = extractMentions(content);
    setText("");
    const { data, error } = await supabase
      .from("report_comments")
      .insert({ target_type: targetType, target_id: targetId, user_id: user.id, content, mentions })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      setText(content);
      return;
    }
    if (data) setComments((c) => (c.some((x) => x.id === data.id) ? c : [...c, data]));
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const content = editText.trim();
    if (!content) return;
    const mentions = extractMentions(content);
    const { error } = await supabase
      .from("report_comments")
      .update({ content, mentions, edited_at: new Date().toISOString() })
      .eq("id", editingId);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditingId(null);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this comment?")) return;
    const { error } = await supabase.from("report_comments").delete().eq("id", id);
    if (error) toast.error(error.message);
  };

  const onTextChange = (val: string) => {
    setText(val);
    const m = val.match(/@([A-Za-z0-9_.-]*)$/);
    if (m) {
      setShowSuggest(true);
      setMentionQuery(m[1].toLowerCase());
    } else {
      setShowSuggest(false);
    }
  };

  const insertMention = (p: Profile) => {
    const handle = (p.display_name?.replace(/\s+/g, "") || p.email?.split("@")[0] || "user");
    setText((t) => t.replace(/@([A-Za-z0-9_.-]*)$/, `@${handle} `));
    setShowSuggest(false);
  };

  const renderContent = (content: string) => {
    const parts = content.split(/(@[A-Za-z0-9_.@-]+)/g);
    return parts.map((p, i) =>
      p.startsWith("@") ? (
        <span key={i} className="text-primary font-medium">
          {p}
        </span>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  };

  const suggestions = profiles
    .filter(
      (p) =>
        !mentionQuery ||
        (p.display_name?.toLowerCase().includes(mentionQuery) ||
          p.email?.toLowerCase().includes(mentionQuery)),
    )
    .slice(0, 5);

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
        <MessageSquare className="w-3.5 h-3.5" /> Comments ({comments.length})
      </div>
      {loading ? (
        <div className="text-xs text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-2">
          {comments.map((c) => {
            const own = c.user_id === user?.id;
            const canModify = own || isAdmin;
            return (
              <div key={c.id} className="flex gap-2 group">
                <Avatar className="w-7 h-7 shrink-0">
                  <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                    {nameOf(c.user_id).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold">{nameOf(c.user_id)}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                    {c.edited_at && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                  </div>
                  {editingId === c.id ? (
                    <div className="flex gap-1 mt-1">
                      <Input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
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
                      <p className="text-sm whitespace-pre-wrap flex-1">{renderContent(c.content)}</p>
                      {canModify && (
                        <div className="opacity-0 group-hover:opacity-100 flex gap-0.5 shrink-0">
                          {own && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => {
                                setEditingId(c.id);
                                setEditText(c.content);
                              }}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive"
                            onClick={() => remove(c.id)}
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
          })}
          {comments.length === 0 && (
            <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded">
              No comments yet. Start the discussion.
            </div>
          )}
        </div>
      )}

      <div className="relative">
        <div className="flex gap-2 items-end">
          <Textarea
            rows={2}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Add a comment… use @ to mention. ⌘/Ctrl+Enter to post."
            className="text-sm resize-none"
          />
          <Button size="icon" onClick={submit} disabled={!text.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 bg-popover border border-border rounded shadow-md w-64 max-h-48 overflow-y-auto z-50">
            {suggestions.map((p) => (
              <button
                key={p.id}
                onClick={() => insertMention(p)}
                className="w-full flex items-center gap-2 px-2 py-1.5 hover:bg-accent text-left text-sm"
              >
                <Avatar className="w-6 h-6">
                  <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                    {(p.display_name || p.email || "?").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{p.display_name || p.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}