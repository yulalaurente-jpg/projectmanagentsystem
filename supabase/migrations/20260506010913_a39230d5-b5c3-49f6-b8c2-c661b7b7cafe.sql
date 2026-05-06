
CREATE TYPE public.funding_status AS ENUM ('pledged','partial','received');
CREATE TYPE public.funding_source_type AS ENUM ('client_payment','loan','grant','internal','investor','other');
CREATE TYPE public.budget_category_type AS ENUM ('labor','materials','equipment','subcontractor','overhead','other');
CREATE TYPE public.invoice_direction AS ENUM ('outgoing','incoming');
CREATE TYPE public.invoice_status AS ENUM ('draft','sent','paid','partial','overdue','cancelled');
CREATE TYPE public.payment_method AS ENUM ('cash','bank_transfer','check','card','other');
CREATE TYPE public.cost_entry_type AS ENUM ('manual','adjustment');

CREATE TABLE public.project_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL UNIQUE,
  total_budget numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  start_date date,
  end_date date,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.budget_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name text NOT NULL,
  category_type public.budget_category_type NOT NULL DEFAULT 'other',
  allocated_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.funding_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  name text NOT NULL,
  source_type public.funding_source_type NOT NULL DEFAULT 'client_payment',
  amount numeric NOT NULL DEFAULT 0,
  received_amount numeric NOT NULL DEFAULT 0,
  received_date date,
  status public.funding_status NOT NULL DEFAULT 'pledged',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  category_id uuid,
  description text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  cost_date date NOT NULL DEFAULT CURRENT_DATE,
  entry_type public.cost_entry_type NOT NULL DEFAULT 'manual',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  invoice_number text NOT NULL,
  direction public.invoice_direction NOT NULL,
  party_name text NOT NULL,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method public.payment_method NOT NULL DEFAULT 'bank_transfer',
  reference text,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_payments ENABLE ROW LEVEL SECURITY;

-- generic policies factory via repetition
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['project_budgets','budget_categories','funding_sources','cost_entries','invoices']) LOOP
    EXECUTE format('CREATE POLICY "viewable by authenticated" ON public.%I FOR SELECT TO authenticated USING (true);', t);
    EXECUTE format('CREATE POLICY "authenticated insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);', t);
    EXECUTE format('CREATE POLICY "creator or admin update" ON public.%I FOR UPDATE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(), ''admin''::app_role));', t);
    EXECUTE format('CREATE POLICY "creator or admin delete" ON public.%I FOR DELETE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(), ''admin''::app_role));', t);
  END LOOP;
END $$;

CREATE POLICY "payments viewable by authenticated" ON public.invoice_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert payment" ON public.invoice_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "creator or admin delete payment" ON public.invoice_payments FOR DELETE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "creator or admin update payment" ON public.invoice_payments FOR UPDATE TO authenticated USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER set_updated_at_project_budgets BEFORE UPDATE ON public.project_budgets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_budget_categories BEFORE UPDATE ON public.budget_categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_funding_sources BEFORE UPDATE ON public.funding_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_cost_entries BEFORE UPDATE ON public.cost_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at_invoices BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_budget_categories_project ON public.budget_categories(project_id);
CREATE INDEX idx_funding_sources_project ON public.funding_sources(project_id);
CREATE INDEX idx_cost_entries_project ON public.cost_entries(project_id);
CREATE INDEX idx_invoices_project ON public.invoices(project_id);
CREATE INDEX idx_invoice_payments_invoice ON public.invoice_payments(invoice_id);
