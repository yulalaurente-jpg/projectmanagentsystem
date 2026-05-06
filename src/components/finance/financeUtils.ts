import { supabase } from "@/integrations/supabase/client";

export const fmtMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(
    Number.isFinite(n) ? n : 0,
  );

export const pct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;

export type ProjectFinance = {
  projectId: string;
  budget: number;
  currency: string;
  laborCost: number;
  materialsCost: number;
  manualCost: number;
  apPaid: number;
  apOutstanding: number;
  arPaid: number;
  arOutstanding: number;
  fundingPledged: number;
  fundingReceived: number;
  totalActual: number;
  totalRevenue: number;
  startDate: string | null;
  endDate: string | null;
};

export async function loadProjectFinance(projectId: string): Promise<ProjectFinance> {
  const [
    { data: budget },
    { data: dtrs },
    { data: emps },
    { data: matReqs },
    { data: mats },
    { data: costs },
    { data: invs },
    { data: pays },
    { data: funds },
  ] = await Promise.all([
    supabase.from("project_budgets").select("*").eq("project_id", projectId).maybeSingle(),
    supabase.from("daily_time_records").select("employee_id,total_hours").eq("project_id", projectId),
    supabase.from("employees").select("id,hourly_rate"),
    supabase.from("material_requests").select("material_id,quantity,status").eq("project_id", projectId),
    supabase.from("materials").select("id,unit_cost"),
    supabase.from("cost_entries").select("amount").eq("project_id", projectId),
    supabase.from("invoices").select("id,direction,total,status").eq("project_id", projectId),
    supabase.from("invoice_payments").select("invoice_id,amount"),
    supabase.from("funding_sources").select("amount,received_amount,status").eq("project_id", projectId),
  ]);

  const empMap = new Map((emps ?? []).map((e) => [e.id, Number(e.hourly_rate ?? 0)]));
  const laborCost = (dtrs ?? []).reduce(
    (s, d) => s + Number(d.total_hours ?? 0) * (empMap.get(d.employee_id) ?? 0),
    0,
  );

  const matMap = new Map((mats ?? []).map((m) => [m.id, Number(m.unit_cost ?? 0)]));
  const materialsCost = (matReqs ?? [])
    .filter((r) => r.status === "received")
    .reduce((s, r) => s + Number(r.quantity ?? 0) * (matMap.get(r.material_id) ?? 0), 0);

  const manualCost = (costs ?? []).reduce((s, c) => s + Number(c.amount ?? 0), 0);

  const invIds = new Set((invs ?? []).map((i) => i.id));
  const payByInv = new Map<string, number>();
  for (const p of pays ?? []) {
    if (!invIds.has(p.invoice_id)) continue;
    payByInv.set(p.invoice_id, (payByInv.get(p.invoice_id) ?? 0) + Number(p.amount ?? 0));
  }

  let apPaid = 0, apOutstanding = 0, arPaid = 0, arOutstanding = 0;
  for (const inv of invs ?? []) {
    if (inv.status === "cancelled") continue;
    const total = Number(inv.total ?? 0);
    const paid = payByInv.get(inv.id) ?? 0;
    const remaining = Math.max(total - paid, 0);
    if (inv.direction === "incoming") {
      apPaid += paid;
      apOutstanding += remaining;
    } else {
      arPaid += paid;
      arOutstanding += remaining;
    }
  }

  const fundingPledged = (funds ?? []).reduce((s, f) => s + Number(f.amount ?? 0), 0);
  const fundingReceived = (funds ?? []).reduce(
    (s, f) => s + Number(f.received_amount ?? 0) + (f.status === "received" ? Number(f.amount ?? 0) - Number(f.received_amount ?? 0) : 0),
    0,
  );

  const totalActual = laborCost + materialsCost + apPaid + manualCost;

  return {
    projectId,
    budget: Number(budget?.total_budget ?? 0),
    currency: budget?.currency ?? "USD",
    laborCost,
    materialsCost,
    manualCost,
    apPaid,
    apOutstanding,
    arPaid,
    arOutstanding,
    fundingPledged,
    fundingReceived,
    totalActual,
    totalRevenue: arPaid,
    startDate: budget?.start_date ?? null,
    endDate: budget?.end_date ?? null,
  };
}

export function daysBetween(a: Date, b: Date): number {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}