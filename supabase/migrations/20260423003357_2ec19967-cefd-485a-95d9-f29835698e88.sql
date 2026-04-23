-- Allow creator to view their own channel even before membership rows are inserted
DROP POLICY IF EXISTS "Channels visible to members or project channels" ON public.chat_channels;
CREATE POLICY "Channels visible to members project or creator"
ON public.chat_channels
FOR SELECT
TO authenticated
USING (
  type = 'project'::chat_channel_type
  OR created_by = auth.uid()
  OR public.is_channel_member(id, auth.uid())
);

-- Auto-add creator as member when a direct channel is created
CREATE OR REPLACE FUNCTION public.add_creator_as_channel_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'direct' THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (NEW.id, NEW.created_by)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_add_creator_as_channel_member ON public.chat_channels;
CREATE TRIGGER trg_add_creator_as_channel_member
AFTER INSERT ON public.chat_channels
FOR EACH ROW EXECUTE FUNCTION public.add_creator_as_channel_member();