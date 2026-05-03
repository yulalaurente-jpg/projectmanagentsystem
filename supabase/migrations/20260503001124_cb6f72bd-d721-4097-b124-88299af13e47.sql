DROP POLICY IF EXISTS "Creator or admin delete channel" ON public.chat_channels;
CREATE POLICY "Delete channel creator admin or dm member"
ON public.chat_channels
FOR DELETE
TO authenticated
USING (
  auth.uid() = created_by
  OR has_role(auth.uid(), 'admin'::app_role)
  OR (type = 'direct'::chat_channel_type AND public.is_channel_member(id, auth.uid()))
);