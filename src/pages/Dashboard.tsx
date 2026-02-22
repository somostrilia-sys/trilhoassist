import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Headphones, Send, DollarSign, Clock, TrendingUp, AlertCircle
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

interface Stats {
  totalRequests: number;
  totalDispatches: number;
  totalRevenue: number;
  avgCost: number;
  openRequests: number;
  inProgressRequests: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalRequests: 0, totalDispatches: 0, totalRevenue: 0,
    avgCost: 0, openRequests: 0, inProgressRequests: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () => loadStats())
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatches" }, () => loadStats())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadStats = async () => {
    const [reqRes, dispRes] = await Promise.all([
      supabase.from("service_requests").select("*"),
      supabase.from("dispatches").select("*"),
    ]);

    const requests = reqRes.data || [];
    const dispatches = dispRes.data || [];

    const totalRevenue = requests.reduce((sum, r) => sum + Number(r.charged_amount || 0), 0);
    const avgCost = requests.length > 0 ? totalRevenue / requests.length : 0;

    setStats({
      totalRequests: requests.length,
      totalDispatches: dispatches.length,
      totalRevenue,
      avgCost,
      openRequests: requests.filter((r) => r.status === "open" || r.status === "awaiting_dispatch").length,
      inProgressRequests: requests.filter((r) => r.status === "dispatched" || r.status === "in_progress").length,
    });
    setLoading(false);
  };

  const kpis = [
    { label: "Atendimentos", value: stats.totalRequests, icon: Headphones, color: "text-primary" },
    { label: "Acionamentos", value: stats.totalDispatches, icon: Send, color: "text-info" },
    { label: "Total (R$)", value: `R$ ${stats.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-success" },
    { label: "Méd. Atend. (R$)", value: `R$ ${stats.avgCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: "text-warning" },
    { label: "Abertos", value: stats.openRequests, icon: AlertCircle, color: "text-accent" },
    { label: "Em andamento", value: stats.inProgressRequests, icon: Clock, color: "text-primary" },
  ];

  // Mock chart data for now
  const chartData = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - i));
    return {
      date: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      abertos: Math.floor(Math.random() * 30) + 10,
      finalizados: Math.floor(Math.random() * 25) + 5,
      cancelados: Math.floor(Math.random() * 5),
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Visão geral das operações em tempo real</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{kpi.label}</span>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <p className="text-2xl font-bold">{loading ? "..." : kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atendimentos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="abertos" stroke="hsl(var(--primary))" strokeWidth={2} name="Abertos" />
                <Line type="monotone" dataKey="finalizados" stroke="hsl(var(--success))" strokeWidth={2} name="Finalizados" />
                <Line type="monotone" dataKey="cancelados" stroke="hsl(var(--destructive))" strokeWidth={2} name="Cancelados" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acionamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line type="monotone" dataKey="abertos" stroke="hsl(var(--info))" strokeWidth={2} name="Ativos" />
                <Line type="monotone" dataKey="cancelados" stroke="hsl(var(--destructive))" strokeWidth={2} name="Cancelados" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
