
-- ============================================================
-- 1. TASK STATUS: add 'provision' and 'removed'
-- ============================================================
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'provision';
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'removed';

-- ============================================================
-- 2. TASKS: add color field for color-coding
-- ============================================================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS color text;

-- ============================================================
-- 3. REPORT FOLDERS: nested folders
-- ============================================================
ALTER TABLE public.report_folders
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.report_folders(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS report_folders_parent_id_idx ON public.report_folders(parent_id);

-- ============================================================
-- 4. EMPLOYEES (global directory) + PROJECT ASSIGNMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  position text,
  email text,
  phone text,
  hourly_rate numeric,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  user_id uuid, -- optional link to auth user
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees viewable by authenticated"
  ON public.employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create employees"
  ON public.employees FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owner or admin update employees"
  ON public.employees FOR UPDATE TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owner or admin delete employees"
  ON public.employees FOR DELETE TO authenticated
  USING ((auth.uid() = created_by) OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_employees_updated_at
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Per-project employee assignments
CREATE TABLE IF NOT EXISTS public.project_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role text,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid NOT NULL,
  UNIQUE (project_id, employee_id)
);

ALTER TABLE public.project_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project employees viewable by authenticated"
  ON public.project_employees FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated assign employee to project"
  ON public.project_employees FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = assigned_by);
CREATE POLICY "Project owner or admin remove assignment"
  ON public.project_employees FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_employees.project_id AND p.created_by = auth.uid()) OR
    auth.uid() = assigned_by
  );

-- Optionally allow tasks to be assigned to an employee (not only profile)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

-- ============================================================
-- 5. DAILY TIME RECORDS
-- ============================================================
CREATE TYPE public.dtr_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE IF NOT EXISTS public.daily_time_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  work_date date NOT NULL,
  time_in timestamptz,
  break_out timestamptz,
  break_in timestamptz,
  time_out timestamptz,
  overtime_hours numeric NOT NULL DEFAULT 0,
  total_hours numeric, -- computed by client (or trigger if needed)
  status public.dtr_status NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dtr_employee_idx ON public.daily_time_records(employee_id);
CREATE INDEX IF NOT EXISTS dtr_project_idx ON public.daily_time_records(project_id);
CREATE INDEX IF NOT EXISTS dtr_date_idx ON public.daily_time_records(work_date);

ALTER TABLE public.daily_time_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DTR viewable by authenticated"
  ON public.daily_time_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create DTR"
  ON public.daily_time_records FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator project owner or admin update DTR"
  ON public.daily_time_records FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    auth.uid() = created_by OR
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = daily_time_records.project_id AND p.created_by = auth.uid())
  );
CREATE POLICY "Creator or admin delete DTR"
  ON public.daily_time_records FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR auth.uid() = created_by);

CREATE TRIGGER set_dtr_updated_at
  BEFORE UPDATE ON public.daily_time_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 6. AUTO-ADD STOCK WHEN MATERIAL REQUEST RECEIVED
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_stock_on_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'received' AND (OLD.status IS DISTINCT FROM 'received') THEN
    UPDATE public.materials
      SET stock_quantity = stock_quantity + NEW.quantity,
          updated_at = now()
    WHERE id = NEW.material_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_stock_on_received ON public.material_requests;
CREATE TRIGGER trg_add_stock_on_received
  AFTER UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.add_stock_on_received();

-- ============================================================
-- 7. CHAT ATTACHMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.chat_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attachments viewable when message is viewable"
  ON public.chat_message_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert attachment"
  ON public.chat_message_attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Author or admin delete attachment"
  ON public.chat_message_attachments FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    EXISTS (SELECT 1 FROM public.chat_messages m WHERE m.id = message_id AND m.user_id = auth.uid())
  );

-- chat-attachments storage bucket (public for easy preview)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Chat attachments publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-attachments');
CREATE POLICY "Authenticated upload chat attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');
CREATE POLICY "Owner or admin delete chat attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments' AND (
      owner = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- ============================================================
-- 8. REALTIME: include new tables in publication
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_message_attachments;
