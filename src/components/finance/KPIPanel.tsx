import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Target, CheckCircle2, Receipt, Wallet, PiggyBank } from "lucide-react";
import { fmtMoney, pct, loadProjectFinance, type ProjectFinance } from "./financeUtils";

export function KPIPanel({ projectId }: { projectId: string }) {
  const [fin, setFin] = useState<ProjectFinance | null>(null);
  const [taskStats, setTaskStats] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  useEffect(() => {
    void (async () => {
      const [f, { data: tasks }] = await Promise.all([
        loadProjectFinance(projectId),
        supabase.from("tasks").select("status").eq("project_id", projectId),
      ]);
      setFin(f);
      const done = (tasks ?? []).filter((t) => t.status === "done").length;
      setTaskStats({ done, total: tasks?.length ?? 0 });
    })();
  }, [projectId]);

  if (!fin) return <div className="text-muted-foreground text-sm py-6">Loading…</div>;

  const utilization = fin.budget ? (fin.totalActual / fin.budget) * 100 : 0;
  const variance = fin.budget - fin.totalActual;
  const margin = fin.totalRevenue ? ((fin.totalRevenue - fin.totalActual) / fin.totalRevenue) * 100 : 0;
  const fundingCoverage = fin.budget ? (fin.fundingReceived / fin.budget) * 100 : 0;
  const scheduleProgress = taskStats.total ? (taskStats.done / taskStats.total) * 100 : 0;
  const costPerTask = taskStats.done ? fin.totalActual / taskStats.done : 0;

  const cards = [
    { label: "Budget Utilization", value: pct(utilization), icon: Target, accent: utilization > 100 ? "text-destructive" : "" },
    { label: "Cost Variance", value: fmtMoney(variance, fin.currency), icon: variance < 0 ? TrendingDown : TrendingUp, accent: variance < 0 ? "text-destructive" : "text-emerald-600" },
    { label: "Schedule Progress", value: pct(scheduleProgress), icon: CheckCircle2 },
    { label: "Cost per Completed Task", value: fmtMoney(costPerTask, fin.currency), icon: DollarSign },
    { label: "Profit Margin", value: pct(margin), icon: TrendingUp, accent: margin < 0 ? "text-destructive" : "text-emerald-600" },
    { label: "Funding Coverage", value: pct(fundingCoverage), icon: PiggyBank },
    { label: "Outstanding AR", value: fmtMoney(fin.arOutstanding, fin.currency), icon: Receipt },
    { label: "Outstanding AP", value: fmtMoney(fin.apOutstanding, fin.currency), icon: Wallet },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className={`text-xl font-semibold ${c.accent ?? ""}`}>{c.value}</div>
          </Card>
        );
      })}
    </div>
  );
}