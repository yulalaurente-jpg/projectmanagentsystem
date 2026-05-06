
CREATE TABLE public.project_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled',
  content TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notes viewable by authenticated"
  ON public.project_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated create note"
  ON public.project_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Author or admin update note"
  ON public.project_notes FOR UPDATE TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Author or admin delete note"
  ON public.project_notes FOR DELETE TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_project_notes_updated_at
  BEFORE UPDATE ON public.project_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_project_notes_project ON public.project_notes(project_id);
