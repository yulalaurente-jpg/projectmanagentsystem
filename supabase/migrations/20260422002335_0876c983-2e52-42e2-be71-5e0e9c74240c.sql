
-- Request status enum
CREATE TYPE public.material_request_status AS ENUM ('requested', 'approved', 'arrived', 'received', 'declined');

-- Materials catalog (global)
CREATE TABLE public.materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sku TEXT,
  description TEXT,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  unit_cost NUMERIC(12,2),
  stock_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Materials viewable by authenticated" ON public.materials
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create materials" ON public.materials
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owner or admin update materials" ON public.materials
  FOR UPDATE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));
CREATE POLICY "Owner or admin delete materials" ON public.materials
  FOR DELETE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'));

CREATE TRIGGER materials_set_updated_at BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Material requests (per project)
CREATE TABLE public.material_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  status public.material_request_status NOT NULL DEFAULT 'requested',
  notes TEXT,
  requested_by UUID NOT NULL,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  arrived_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  declined_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.material_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Requests viewable by authenticated" ON public.material_requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create requests" ON public.material_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = requested_by);
CREATE POLICY "Admins or project owners update requests" ON public.material_requests
  FOR UPDATE TO authenticated USING (
    has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.created_by = auth.uid())
    OR auth.uid() = requested_by
  );
CREATE POLICY "Requester or admin delete request" ON public.material_requests
  FOR DELETE TO authenticated USING (
    has_role(auth.uid(), 'admin') OR auth.uid() = requested_by
  );

CREATE TRIGGER material_requests_set_updated_at BEFORE UPDATE ON public.material_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_material_requests_project ON public.material_requests(project_id);
CREATE INDEX idx_material_requests_status ON public.material_requests(status);
