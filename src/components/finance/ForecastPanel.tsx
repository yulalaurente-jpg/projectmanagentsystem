import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { fmtMoney, loadProjectFinance, daysBetween, type ProjectFinance } from "./financeUtils";

export function ForecastPanel({ projectId }: { projectId: string }) {
  const [fin, setFin] = useState<ProjectFinance | null>(null);
  const [series, setSeries] = useState<{ date: string; actual: number; budget: number }[]>([]);

  useEffect(() => {
    void (async () => {
      const f = await loadProjectFinance(projectId);
      setFin(f);
      // build cumulative actual series from DTR (labor) + cost_entries + paid invoices + materials
      const [{ data: dtrs }, { data: emps }, { data: costs }, { data: pays }, { data: invs }, { data: matReqs }, { data: mats }] = await Promise.all([
        supabase.from("daily_time_records").select("work_date,employee_id,total_hours").eq("project_id", projectId),
        supabase.from("employees").select("id,hourly_rate"),
        supabase.from("cost_entries").select("cost_date,amount").eq("project_id", projectId),
        supabase.from("invoice_payments").select("payment_date,amount,invoice_id"),
        supabase.from("invoices").select("id,direction").eq("project_id", projectId),
        supabase.from("material_requests").select("material_id,quantity,status,received_at").eq("project_id", projectId),
        supabase.from("materials").select("id,unit_cost"),
      ]);
      const empMap = new Map((emps ?? []).map((e) => [e.id, Number(e.hourly_rate ?? 0)]));
      const matMap = new Map((mats ?? []).map((m) => [m.id, Number(m.unit_cost ?? 0)]));
      const apInvIds = new Set((invs ?? []).filter((i) => i.direction === "incoming").map((i) => i.id));

      const byDate = new Map<string, number>();
      const add = (d: string | null | undefined, v: number) => {
        if (!d) return;
        const k = d.slice(0, 10);
        byDate.set(k, (byDate.get(k) ?? 0) + v);
      };
      for (const r of dtrs ?? []) add(r.work_date, Number(r.total_hours ?? 0) * (empMap.get(r.employee_id) ?? 0));
      for (const c of costs ?? []) add(c.cost_date, Number(c.amount ?? 0));
      for (const p of pays ?? []) if (apInvIds.has(p.invoice_id)) add(p.payment_date, Number(p.amount ?? 0));
      for (const r of matReqs ?? []) if (r.status === "received") add(r.received_at as unknown as string, Number(r.quantity ?? 0) * (matMap.get(r.material_id) ?? 0));

      const sorted = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b));
      let cum = 0;
      const start = f.startDate ? new Date(f.startDate) : (sorted[0] ? new Date(sorted[0][0]) : new Date());
      const end = f.endDate ? new Date(f.endDate) : new Date();
      const totalDays = daysBetween(start, end);
      const out: { date: string; actual: number; budget: number }[] = [];
      for (const [date, v] of sorted) {
        cum += v;
        const elapsed = daysBetween(start, new Date(date));
        const planned = (Math.min(elapsed, totalDays) / totalDays) * f.budget;
        out.push({ date, actual: cum, budget: planned });
      }
      setSeries(out);
    })();
  }, [projectId]);

  const stats = useMemo(() => {
    if (!fin) return null;
    const start = fin.startDate ? new Date(fin.startDate) : null;
    const end = fin.endDate ? new Date(fin.endDate) : null;
    const today = new Date();
    const elapsedDays = start ? daysBetween(start, today) : 0;
    const totalDays = start && end ? daysBetween(start, end) : 0;
    const burnRate = elapsedDays > 0 ? fin.totalActual / elapsedDays : 0;
    const projectedTotal = totalDays > 0 ? burnRate * totalDays : fin.totalActual;
    const variance = fin.budget - projectedTotal;
    const remaining = Math.max(fin.budget - fin.totalActual, 0);
    const daysOfRunway = burnRate > 0 ? remaining / burnRate : Infinity;
    return { burnRate, projectedTotal, variance, daysOfRunway, elapsedDays, totalDays };
  }, [fin]);

  if (!fin || !stats) return <div className="text-muted-foreground text-sm py-6">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Daily Burn Rate</div><div className="text-2xl font-semibold">{fmtMoney(stats.burnRate, fin.currency)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Projected Total</div><div className="text-2xl font-semibold">{fmtMoney(stats.projectedTotal, fin.currency)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Forecasted Variance</div><div className={`text-2xl font-semibold ${stats.variance < 0 ? "text-destructive" : "text-emerald-600"}`}>{fmtMoney(stats.variance, fin.currency)}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Budget Runway</div><div className="text-2xl font-semibold">{Number.isFinite(stats.daysOfRunway) ? `${Math.round(stats.daysOfRunway)} days` : "∞"}</div></Card>
      </div>

      <Card className="p-4">
        <div className="font-semibold mb-3">Cumulative Spend vs Budget Plan</div>
        {series.length === 0 ? (
          <div className="text-sm text-muted-foreground py-12 text-center">No spend data yet. Add DTR records, materials, or cost entries.</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(v: number) => fmtMoney(v, fin.currency)} />
              <Legend />
              <Line type="monotone" dataKey="actual" stroke="#3b82f6" name="Actual" />
              <Line type="monotone" dataKey="budget" stroke="#10b981" name="Planned" strokeDasharray="5 5" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}