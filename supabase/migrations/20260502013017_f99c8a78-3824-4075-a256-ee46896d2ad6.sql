-- Allow DM channel members to delete any message in their DM channels
DROP POLICY IF EXISTS "Author or admin delete message" ON public.chat_messages;

CREATE POLICY "Delete message author admin or dm member"
ON public.chat_messages
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.chat_channels c
    WHERE c.id = chat_messages.channel_id
      AND c.type = 'direct'
      AND public.is_channel_member(c.id, auth.uid())
  )
);