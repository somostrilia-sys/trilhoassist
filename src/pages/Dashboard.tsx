import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Headphones, Send, DollarSign, Clock, TrendingUp, AlertCircle
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusMap: Record<string, { label: string; color: string }> = {
  open: { label: "Aberto", color: "hsl(var(--primary))" },
  awaiting_dispatch: { label: "Aguard. Acion.", color: "hsl(var(--warning))" },
  dispatched: { label: "Acionado", color: "hsl(var(--info))" },
  in_progress: { label: "Em Andamento", color: "hsl(var(--accent))" },
  completed: { label: "Finalizado", color: "hsl(var(--success))" },
  cancelled: { label: "Cancelado", color: "hsl(var(--destructive))" },
  refunded: { label: "Reembolso", color: "#9b59b6" },
};

const serviceTypeMap: Record<string, string> = {
  tow_light: "R. Leve",
  tow_heavy: "R. Pesado",
  tow_motorcycle: "R. Moto",
  locksmith: "Chaveiro",
  tire_change: "Troca Pneu",
  battery: "Bateria",
  fuel: "Combustível",
  lodging: "Hospedagem",
  collision: "Colisão",
  other: "Outro",
};

const serviceTypeColors = [
  "hsl(var(--primary))", "hsl(var(--info))", "hsl(var(--success))",
  "hsl(var(--warning))", "hsl(var(--destructive))", "hsl(var(--accent))",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

interface Stats {
  totalRequests: number;
  totalDispatches: number;
  totalRevenue: number;
  avgCost: number;
  openRequests: number;
  inProgressRequests: number;
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalRequests: 0, totalDispatches: 0, totalRevenue: 0,
    avgCost: 0, openRequests: 0, inProgressRequests: 0,
  });
  const [allRequests, setAllRequests] = useState<any[]>([]);
  const [allDispatches, setAllDispatches] = useState<any[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [clientFilter, setClientFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [periodDays, setPeriodDays] = useState("30");

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatches" }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadData = async () => {
    const [reqRes, dispRes, clientRes] = await Promise.all([
      supabase.from("service_requests").select("*"),
      supabase.from("dispatches").select("*"),
      supabase.from("clients").select("id, name").order("name"),
    ]);

    setAllRequests(reqRes.data || []);
    setAllDispatches(dispRes.data || []);
    setClients(clientRes.data || []);
    setLoading(false);
  };

  // Filter requests and dispatches by client
  const requests = useMemo(() => {
    if (clientFilter === "all") return allRequests;
    return allRequests.filter((r) => r.client_id === clientFilter);
  }, [allRequests, clientFilter]);

  const dispatches = useMemo(() => {
    if (clientFilter === "all") return allDispatches;
    const reqIds = new Set(requests.map((r) => r.id));
    return allDispatches.filter((d) => reqIds.has(d.service_request_id));
  }, [allDispatches, clientFilter, requests]);

  // Compute stats from filtered data
  useEffect(() => {
    const totalRevenue = requests.reduce((sum, r) => sum + Number(r.charged_amount || 0), 0);
    setStats({
      totalRequests: requests.length,
      totalDispatches: dispatches.length,
      totalRevenue,
      avgCost: requests.length > 0 ? totalRevenue / requests.length : 0,
      openRequests: requests.filter((r) => r.status === "open" || r.status === "awaiting_dispatch").length,
      inProgressRequests: requests.filter((r) => r.status === "dispatched" || r.status === "in_progress").length,
    });
  }, [requests, dispatches]);

  const days = Number(periodDays);

  // Status pie chart data
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    requests.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return Object.entries(counts)
      .map(([key, value]) => ({
        name: statusMap[key]?.label || key,
        value,
        color: statusMap[key]?.color || "hsl(var(--muted))",
      }))
      .sort((a, b) => b.value - a.value);
  }, [requests]);

  // Service type bar chart data
  const serviceTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    requests.forEach((r) => { counts[r.service_type] = (counts[r.service_type] || 0) + 1; });
    return Object.entries(counts)
      .map(([key, value]) => ({
        name: serviceTypeMap[key] || key,
        quantidade: value,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);
  }, [requests]);

  // Timeline chart data (filtered by period)
  const timelineData = useMemo(() => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const dayMap: Record<string, { abertos: number; finalizados: number; cancelados: number }> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dayMap[key] = { abertos: 0, finalizados: 0, cancelados: 0 };
    }

    requests.forEach((r) => {
      const date = new Date(r.created_at);
      if (date < startDate) return;
      const key = date.toISOString().slice(0, 10);
      if (!dayMap[key]) return;

      if (r.status === "completed") dayMap[key].finalizados++;
      else if (r.status === "cancelled" || r.status === "refunded") dayMap[key].cancelados++;
      else dayMap[key].abertos++;
    });

    return Object.entries(dayMap).map(([date, vals]) => ({
      date: new Date(date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      ...vals,
    }));
  }, [requests, days]);

  const kpis = [
    { label: "Atendimentos", value: stats.totalRequests, icon: Headphones, color: "text-primary" },
    { label: "Acionamentos", value: stats.totalDispatches, icon: Send, color: "text-info" },
    { label: "Total (R$)", value: `R$ ${stats.totalRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-success" },
    { label: "Méd. Atend. (R$)", value: `R$ ${stats.avgCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: TrendingUp, color: "text-warning" },
    { label: "Abertos", value: stats.openRequests, icon: AlertCircle, color: "text-accent" },
    { label: "Em andamento", value: stats.inProgressRequests, icon: Clock, color: "text-primary" },
  ];

  const RADIAN = Math.PI / 180;
  const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight="bold">
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Visão geral das operações em tempo real</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
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

      {/* Charts row 1: Status pie + Service type bar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atendimentos por Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderCustomizedLabel}
                    outerRadius={110}
                    dataKey="value"
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Atendimentos por Tipo de Serviço</CardTitle>
          </CardHeader>
          <CardContent>
            {serviceTypeData.length === 0 ? (
              <p className="text-muted-foreground text-center py-12">Sem dados</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={serviceTypeData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" width={80} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="quantidade" name="Quantidade" radius={[0, 4, 4, 0]}>
                    {serviceTypeData.map((_, index) => (
                      <Cell key={`bar-${index}`} fill={serviceTypeColors[index % serviceTypeColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart row 2: Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolução por Período</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" interval={days <= 14 ? 0 : "preserveStartEnd"} />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend />
              <Line type="monotone" dataKey="abertos" stroke="hsl(var(--primary))" strokeWidth={2} name="Abertos" dot={days <= 14} />
              <Line type="monotone" dataKey="finalizados" stroke="hsl(var(--success))" strokeWidth={2} name="Finalizados" dot={days <= 14} />
              <Line type="monotone" dataKey="cancelados" stroke="hsl(var(--destructive))" strokeWidth={2} name="Cancelados" dot={days <= 14} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
