-- Multi-assignee and multi-project-employee join tables for tasks

CREATE TABLE IF NOT EXISTS public.task_assignees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  assigned_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON public.task_assignees(user_id);

ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Task assignees viewable by authenticated"
  ON public.task_assignees FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert task assignee"
  ON public.task_assignees FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = assigned_by);

CREATE POLICY "Assigner or admin delete task assignee"
  ON public.task_assignees FOR DELETE TO authenticated
  USING (auth.uid() = assigned_by OR has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.task_employees (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_task_employees_task ON public.task_employees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_employees_emp ON public.task_employees(employee_id);

ALTER TABLE public.task_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Task employees viewable by authenticated"
  ON public.task_employees FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert task employee"
  ON public.task_employees FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = assigned_by);

CREATE POLICY "Assigner or admin delete task employee"
  ON public.task_employees FOR DELETE TO authenticated
  USING (auth.uid() = assigned_by OR has_role(auth.uid(), 'admin'));

-- Backfill from existing single-value columns
INSERT INTO public.task_assignees (task_id, user_id, assigned_by)
SELECT id, assignee_id, reporter_id FROM public.tasks
WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.task_employees (task_id, employee_id, assigned_by)
SELECT id, employee_id, reporter_id FROM public.tasks
WHERE employee_id IS NOT NULL
ON CONFLICT DO NOTHING;
