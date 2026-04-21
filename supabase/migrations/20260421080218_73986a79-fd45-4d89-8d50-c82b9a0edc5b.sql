-- =========================
-- REPORTING FOLDERS
-- =========================
CREATE TABLE public.report_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#3b82f6',
  icon text DEFAULT 'folder',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.report_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Folders viewable by authenticated"
  ON public.report_folders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create folder"
  ON public.report_folders FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated update folder"
  ON public.report_folders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete folder"
  ON public.report_folders FOR DELETE TO authenticated USING (true);

CREATE TRIGGER report_folders_updated_at
  BEFORE UPDATE ON public.report_folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- REPORTS (rich-text notes)
-- =========================
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.report_folders(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports viewable by authenticated"
  ON public.reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create report"
  ON public.reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated update report"
  ON public.reports FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete report"
  ON public.reports FOR DELETE TO authenticated USING (true);

CREATE TRIGGER reports_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_reports_folder ON public.reports(folder_id);

-- =========================
-- REPORT FILES (uploads)
-- =========================
CREATE TABLE public.report_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.report_folders(id) ON DELETE CASCADE,
  name text NOT NULL,
  storage_path text NOT NULL,
  size_bytes bigint,
  mime_type text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.report_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Files viewable by authenticated"
  ON public.report_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated upload file"
  ON public.report_files FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Authenticated delete file"
  ON public.report_files FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_report_files_folder ON public.report_files(folder_id);

-- =========================
-- CHECKLISTS
-- =========================
CREATE TABLE public.checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  color text DEFAULT '#3b82f6',
  icon text DEFAULT 'list-checks',
  position integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT checklist_belongs_to_one CHECK (
    (project_id IS NOT NULL AND task_id IS NULL)
    OR (project_id IS NULL AND task_id IS NOT NULL)
  )
);
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Checklists viewable by authenticated"
  ON public.checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create checklist"
  ON public.checklists FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated update checklist"
  ON public.checklists FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete checklist"
  ON public.checklists FOR DELETE TO authenticated USING (true);

CREATE TRIGGER checklists_updated_at
  BEFORE UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_checklists_project ON public.checklists(project_id);
CREATE INDEX idx_checklists_task ON public.checklists(task_id);

-- =========================
-- CHECKLIST ITEMS
-- =========================
CREATE TABLE public.checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  label text NOT NULL,
  notes text,
  is_done boolean NOT NULL DEFAULT false,
  assignee_id uuid,
  due_date timestamptz,
  priority task_priority,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Items viewable by authenticated"
  ON public.checklist_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create item"
  ON public.checklist_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update item"
  ON public.checklist_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete item"
  ON public.checklist_items FOR DELETE TO authenticated USING (true);

CREATE TRIGGER checklist_items_updated_at
  BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_checklist_items_checklist ON public.checklist_items(checklist_id);

-- =========================
-- CHECKLIST TEMPLATES
-- =========================
CREATE TABLE public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#3b82f6',
  icon text DEFAULT 'list-checks',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates viewable by authenticated"
  ON public.checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create template"
  ON public.checklist_templates FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owner or admin update template"
  ON public.checklist_templates FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Owner or admin delete template"
  ON public.checklist_templates FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER checklist_templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Template items viewable by authenticated"
  ON public.checklist_template_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create template item"
  ON public.checklist_template_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update template item"
  ON public.checklist_template_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated delete template item"
  ON public.checklist_template_items FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_template_items_template ON public.checklist_template_items(template_id);

-- =========================
-- STORAGE BUCKET for report files
-- =========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-files', 'report-files', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Report files readable by authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'report-files');

CREATE POLICY "Authenticated upload report files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'report-files');

CREATE POLICY "Authenticated delete report files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'report-files');