# Financial Management Module

Add comprehensive project finance tracking with per-project tabs and a global Finance page.

## Database (new migration)

**`project_budgets`** — one row per project
- `project_id` (unique), `total_budget` numeric, `currency` text default 'USD', `start_date`, `end_date`, `notes`, audit fields

**`budget_categories`** — line items per project (labor, materials, equipment, subcontractor, overhead, other)
- `project_id`, `name`, `category_type` text, `allocated_amount` numeric, `notes`

**`funding_sources`** — where money comes from
- `project_id`, `name`, `source_type` (client_payment, loan, grant, internal, investor, other), `amount`, `received_date` nullable, `status` (pledged, received, partial), `notes`

**`cost_entries`** — manual cost adjustments / actuals not auto-derived
- `project_id`, `category_id` nullable, `description`, `amount`, `cost_date`, `entry_type` (manual, adjustment), `notes`, `created_by`

**`invoices`** — both AR (outgoing) and AP (incoming)
- `project_id`, `invoice_number`, `direction` (outgoing/incoming), `party_name` (client or vendor), `issue_date`, `due_date`, `subtotal`, `tax`, `total`, `status` (draft, sent, paid, overdue, cancelled), `notes`

**`invoice_payments`** — payments against invoices
- `invoice_id`, `amount`, `payment_date`, `payment_method` (cash, bank_transfer, check, card, other), `reference`, `notes`, `created_by`

**RLS**: authenticated select; insert restricted by `created_by = auth.uid()`; update/delete by creator or admin (or project owner for project-scoped tables).

## Auto-calculated actuals (client-side aggregation)

For each project compute:
- **Labor cost** = sum of `daily_time_records.total_hours × employees.hourly_rate` (joined)
- **Materials cost** = sum of `material_requests` where status='received' of `quantity × materials.unit_cost`
- **Invoice cost (AP)** = sum of paid incoming invoices
- **Manual entries** = sum of `cost_entries`
- **Total actual** = labor + materials + AP paid + manual
- **Revenue** = sum of paid outgoing invoices
- **Funding received** = sum of `funding_sources` where status='received' (+ partial amounts)

## Forecasting

Simple projections shown in the Forecasting tab:
- **Burn rate** = total actual cost / days elapsed since project start
- **Projected total at completion** = burn rate × project duration days
- **Variance vs budget** = projected − total_budget (color-coded)
- **Estimated completion date based on remaining budget** = remaining budget / burn rate
- Linear chart (Recharts) of cumulative actual vs straight-line budget plan

## KPIs

Card grid showing:
- Budget utilization % (actual / budget)
- Cost variance (budget − actual)
- Schedule progress (tasks done / total)
- Cost per task completed
- Revenue vs cost (margin %)
- Funding coverage % (funding received / budget)
- Outstanding AR (unpaid outgoing invoices)
- Outstanding AP (unpaid incoming bills)

## UI Components (new)

- `src/components/finance/BudgetPanel.tsx` — total budget + categories table, edit dialog
- `src/components/finance/FundingPanel.tsx` — funding sources CRUD
- `src/components/finance/CostsPanel.tsx` — auto-computed breakdown + manual cost entries CRUD
- `src/components/finance/ForecastPanel.tsx` — projections + burn-down chart
- `src/components/finance/InvoicesPanel.tsx` — tabs for outgoing/incoming, list + create dialog, payment recording dialog
- `src/components/finance/KPIPanel.tsx` — KPI card grid
- `src/components/finance/financeUtils.ts` — shared aggregation functions

## Per-project integration

Edit `src/routes/projects.$projectId.tsx`:
- Add tabs after "Discussion": **KPIs**, **Budget**, **Costs**, **Funding**, **Forecast**, **Invoices**
- Each tab renders its panel with `projectId` prop

## Global Finance page

New route `src/routes/finance.tsx`:
- Aggregate KPI cards across all projects
- Table: per-project budget vs actual vs variance (sortable)
- Outgoing invoices summary (total billed / collected / outstanding)
- Incoming invoices summary (total billed / paid / outstanding)
- Top 5 over-budget projects
- Cash flow chart (monthly inflow from paid AR vs outflow from paid AP + labor)

Add "Finance" link to `src/components/AppLayout.tsx` sidebar (after Analytics).

## Tech notes

- Use Recharts (already used in analytics) for charts
- Currency formatting via `Intl.NumberFormat`
- All date math with native Date; no extra deps
- Reuse existing `Card`, `Tabs`, `Dialog`, `Table` UI primitives
