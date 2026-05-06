import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ChatView } from "@/components/chat/ChatView";
import type { Tables } from "@/integrations/supabase/types";

type Profile = Tables<"profiles">;

export function DiscussionPanel({
  projectId,
  projectName,
  profiles,
}: {
  projectId: string;
  projectName: string;
  profiles: Profile[];
}) {
  const [channelId, setChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    supabase
      .from("chat_channels")
      .select("id")
      .eq("project_id", projectId)
      .eq("type", "project")
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setChannelId(data?.id ?? null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (!channelId)
    return <div className="text-sm text-muted-foreground py-6 text-center">No discussion channel found.</div>;

  return (
    <div className="h-[480px] border border-border rounded-md overflow-hidden">
      <ChatView
        channelId={channelId}
        channelLabel={projectName}
        channelSubLabel="Project discussion"
        profiles={profiles}
        channelType="project"
      />
    </div>
  );
}