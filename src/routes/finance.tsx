import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppLayout, RequireAuth } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtMoney, loadProjectFinance, type ProjectFinance } from "@/components/finance/financeUtils";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Receipt, Wallet, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/finance")({
  head: () => ({ meta: [{ title: "Finance — Trackr" }, { name: "description", content: "Financial overview across all projects." }] }),
  component: () => (<RequireAuth><AppLayout><FinancePage /></AppLayout></RequireAuth>),
});

type Row = ProjectFinance & { name: string; key: string };

function FinancePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data: projects } = await supabase.from("projects").select("id,name,key");
      if (!projects) { setLoading(false); return; }
      const all = await Promise.all(projects.map(async (p) => ({ ...(await loadProjectFinance(p.id)), name: p.name, key: p.key })));
      setRows(all);
      setLoading(false);
    })();
  }, []);

  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.totalActual, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const arOut = rows.reduce((s, r) => s + r.arOutstanding, 0);
  const apOut = rows.reduce((s, r) => s + r.apOutstanding, 0);
  const margin = totalRevenue ? ((totalRevenue - totalActual) / totalRevenue) * 100 : 0;

  const overBudget = [...rows].filter((r) => r.budget > 0).sort((a, b) => (b.totalActual - b.budget) - (a.totalActual - a.budget)).slice(0, 5);

  const chart = rows.map((r) => ({ name: r.key || r.name.slice(0, 8), Budget: r.budget, Actual: r.totalActual, Revenue: r.totalRevenue }));

  const cards = [
    { label: "Total Budget", value: fmtMoney(totalBudget), icon: DollarSign },
    { label: "Total Actual Cost", value: fmtMoney(totalActual), icon: TrendingDown },
    { label: "Total Revenue", value: fmtMoney(totalRevenue), icon: TrendingUp, accent: "text-emerald-600" },
    { label: "Overall Margin", value: `${margin.toFixed(1)}%`, icon: TrendingUp, accent: margin < 0 ? "text-destructive" : "text-emerald-600" },
    { label: "Outstanding AR", value: fmtMoney(arOut), icon: Receipt },
    { label: "Outstanding AP", value: fmtMoney(apOut), icon: Wallet },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Finance</h1>
        <p className="text-sm text-muted-foreground">Aggregate budget, cost, revenue, and invoice status across all projects.</p>
      </div>

      {loading ? <div className="text-muted-foreground">Loading…</div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <Card key={c.label} className="p-4">
                  <div className="flex items-center justify-between mb-2"><div className="text-xs text-muted-foreground">{c.label}</div><Icon className="w-4 h-4 text-muted-foreground" /></div>
                  <div className={`text-lg font-semibold ${c.accent ?? ""}`}>{c.value}</div>
                </Card>
              );
            })}
          </div>

          <Card className="p-4">
            <div className="font-semibold mb-3">Budget vs Actual vs Revenue</div>
            {chart.length === 0 ? <div className="text-sm text-muted-foreground py-12 text-center">No projects yet</div> : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(v) => fmtMoney(Number(v))} />
                  <Legend />
                  <Bar dataKey="Budget" fill="#10b981" />
                  <Bar dataKey="Actual" fill="#3b82f6" />
                  <Bar dataKey="Revenue" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="font-semibold mb-3">All Projects</div>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Project</TableHead><TableHead className="text-right">Budget</TableHead><TableHead className="text-right">Actual</TableHead><TableHead className="text-right">Variance</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const v = r.budget - r.totalActual;
                    return (
                      <TableRow key={r.projectId}>
                        <TableCell><Link to="/projects/$projectId" params={{ projectId: r.projectId }} className="hover:underline font-medium">{r.name}</Link></TableCell>
                        <TableCell className="text-right">{fmtMoney(r.budget, r.currency)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(r.totalActual, r.currency)}</TableCell>
                        <TableCell className={`text-right ${v < 0 ? "text-destructive" : "text-emerald-600"}`}>{fmtMoney(v, r.currency)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            <Card className="p-4">
              <div className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Top Over-Budget Projects</div>
              <Table>
                <TableHeader><TableRow><TableHead>Project</TableHead><TableHead className="text-right">Over By</TableHead><TableHead className="text-right">% Used</TableHead></TableRow></TableHeader>
                <TableBody>
                  {overBudget.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No data</TableCell></TableRow>}
                  {overBudget.map((r) => {
                    const over = r.totalActual - r.budget;
                    const used = r.budget ? (r.totalActual / r.budget) * 100 : 0;
                    return (
                      <TableRow key={r.projectId}>
                        <TableCell><Link to="/projects/$projectId" params={{ projectId: r.projectId }} className="hover:underline">{r.name}</Link></TableCell>
                        <TableCell className={`text-right ${over > 0 ? "text-destructive" : "text-emerald-600"}`}>{fmtMoney(over, r.currency)}</TableCell>
                        <TableCell className="text-right"><Badge variant={used > 100 ? "destructive" : "secondary"}>{used.toFixed(0)}%</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}