
-- ============== CHAT SYSTEM ==============
CREATE TYPE public.chat_channel_type AS ENUM ('project', 'direct');

CREATE TABLE public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.chat_channel_type NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_chat_channels_project ON public.chat_channels(project_id) WHERE type = 'project';

CREATE TABLE public.chat_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel_id, user_id)
);

CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_channel_created ON public.chat_messages(channel_id, created_at DESC);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper: is user member of a channel
CREATE OR REPLACE FUNCTION public.is_channel_member(_channel_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_channel_members WHERE channel_id = _channel_id AND user_id = _user_id
  );
$$;

-- Channels: anyone authenticated can see project channels; DMs only to members
CREATE POLICY "Channels visible to members or project channels"
  ON public.chat_channels FOR SELECT TO authenticated
  USING (type = 'project' OR public.is_channel_member(id, auth.uid()));

CREATE POLICY "Authenticated create channels"
  ON public.chat_channels FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator or admin update channel"
  ON public.chat_channels FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Creator or admin delete channel"
  ON public.chat_channels FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.has_role(auth.uid(), 'admin'));

-- Members
CREATE POLICY "Members visible to channel members or project channels"
  ON public.chat_channel_members FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND c.type = 'project')
    OR public.is_channel_member(channel_id, auth.uid())
  );

CREATE POLICY "Authenticated add members"
  ON public.chat_channel_members FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "User can update own membership"
  ON public.chat_channel_members FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "User can remove self or admin remove anyone"
  ON public.chat_channel_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Messages: project channels open to authenticated; DMs to members only
CREATE POLICY "Messages readable by channel members or project channel"
  ON public.chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND c.type = 'project')
    OR public.is_channel_member(channel_id, auth.uid())
  );

CREATE POLICY "Authenticated send message"
  ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND (
      EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.id = channel_id AND c.type = 'project')
      OR public.is_channel_member(channel_id, auth.uid())
    )
  );

CREATE POLICY "Author or admin update message"
  ON public.chat_messages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Author or admin delete message"
  ON public.chat_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- Realtime
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_channel_members;

-- Auto create project chat channel
CREATE OR REPLACE FUNCTION public.create_project_chat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.chat_channels (type, project_id, name, created_by)
  VALUES ('project', NEW.id, NEW.name, NEW.created_by);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_create_project_chat
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.create_project_chat();

-- Backfill chat channels for existing projects
INSERT INTO public.chat_channels (type, project_id, name, created_by)
SELECT 'project', p.id, p.name, p.created_by
FROM public.projects p
WHERE NOT EXISTS (SELECT 1 FROM public.chat_channels c WHERE c.project_id = p.id);

-- Updated_at trigger
CREATE TRIGGER trg_chat_channels_updated
  BEFORE UPDATE ON public.chat_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============== COMMENTS ON FOLDERS & FILES ==============
CREATE TYPE public.comment_target_type AS ENUM ('folder', 'file');

CREATE TABLE public.report_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type public.comment_target_type NOT NULL,
  target_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  mentions UUID[] DEFAULT ARRAY[]::UUID[],
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_comments_target ON public.report_comments(target_type, target_id, created_at);

ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments viewable by authenticated"
  ON public.report_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert comment"
  ON public.report_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Author or admin update comment"
  ON public.report_comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Author or admin delete comment"
  ON public.report_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.report_comments REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.report_comments;
