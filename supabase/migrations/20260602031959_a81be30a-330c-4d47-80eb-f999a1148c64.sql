-- Add on_hold to task_status enum
ALTER TYPE public.task_status ADD VALUE IF NOT EXISTS 'on_hold';

-- Track when task was placed on hold
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS hold_started_at timestamptz;

-- Trigger: manage hold lifecycle and auto-shift dates
CREATE OR REPLACE FUNCTION public.handle_task_hold()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  elapsed interval;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'on_hold' AND OLD.status <> 'on_hold' THEN
      NEW.hold_started_at := now();
    ELSIF OLD.status = 'on_hold' AND NEW.status <> 'on_hold' THEN
      IF OLD.hold_started_at IS NOT NULL THEN
        elapsed := now() - OLD.hold_started_at;
        IF NEW.due_date IS NOT NULL THEN
          NEW.due_date := NEW.due_date + elapsed;
        END IF;
        IF NEW.start_date IS NOT NULL THEN
          NEW.start_date := NEW.start_date + elapsed;
        END IF;
      END IF;
      NEW.hold_started_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_task_hold ON public.tasks;
CREATE TRIGGER trg_handle_task_hold
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.handle_task_hold();