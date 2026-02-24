import { useEffect, useState, useMemo, lazy, Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

const ServiceHeatmap = lazy(() => import("@/components/ServiceHeatmap"));
const NpsPanel = lazy(() => import("@/components/NpsPanel"));
import {
  Headphones, Send, DollarSign, Clock, TrendingUp, AlertCircle,
  Timer, Route, Banknote, Zap,
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

const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
};


function formatDuration(minutes: number): string {
  if (!minutes || !isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)}min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export default function Dashboard() {
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

  const days = Number(periodDays);

  // ===== COMPUTED KPIs =====
  const kpiData = useMemo(() => {
    const totalRequests = requests.length;
    const totalDispatches = dispatches.length;
    const totalRevenue = requests.reduce((s, r) => s + Number(r.charged_amount || 0), 0);
    const totalCost = requests.reduce((s, r) => s + Number(r.provider_cost || 0), 0);
    const totalGanho = totalRevenue - totalCost;
    const avgCost = totalRequests > 0 ? totalRevenue / totalRequests : 0;
    const openRequests = requests.filter((r) => r.status === "open" || r.status === "awaiting_dispatch").length;
    const inProgressRequests = requests.filter((r) => r.status === "dispatched" || r.status === "in_progress").length;

    // Tempo médio de atendimento (created_at → completed_at, only completed)
    const completedReqs = requests.filter((r) => r.status === "completed" && r.completed_at);
    let avgServiceTimeMin = 0;
    if (completedReqs.length > 0) {
      const validTimes = completedReqs
        .map((r) => (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()) / 60000)
        .filter((d) => d > 0);
      avgServiceTimeMin = validTimes.length > 0 ? validTimes.reduce((s, d) => s + d, 0) / validTimes.length : 0;
    }

    // Tempo médio de acionamento (dispatch created_at → accepted_at)
    const acceptedDisp = dispatches.filter((d) => d.accepted_at);
    let avgDispatchTimeMin = 0;
    if (acceptedDisp.length > 0) {
      const validTimes = acceptedDisp
        .map((d) => (new Date(d.accepted_at).getTime() - new Date(d.created_at).getTime()) / 60000)
        .filter((d) => d > 0);
      avgDispatchTimeMin = validTimes.length > 0 ? validTimes.reduce((s, d) => s + d, 0) / validTimes.length : 0;
    }

    // Distância média
    const withKm = requests.filter((r) => r.estimated_km && Number(r.estimated_km) > 0);
    const avgKm = withKm.length > 0
      ? withKm.reduce((s, r) => s + Number(r.estimated_km), 0) / withKm.length
      : 0;

    // Valor médio prestador
    const withCost = requests.filter((r) => Number(r.provider_cost) > 0);
    const avgProviderCost = withCost.length > 0
      ? withCost.reduce((s, r) => s + Number(r.provider_cost), 0) / withCost.length
      : 0;

    return {
      totalRequests, totalDispatches, totalRevenue, totalCost, totalGanho,
      avgCost, openRequests, inProgressRequests,
      avgServiceTimeMin, avgDispatchTimeMin, avgKm, avgProviderCost,
    };
  }, [requests, dispatches]);

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

  // ===== KPI cards config =====
  const kpiCards = [
    { label: "Atendimentos", value: String(kpiData.totalRequests), icon: Headphones, color: "text-primary" },
    { label: "Acionamentos", value: String(kpiData.totalDispatches), icon: Send, color: "text-info" },
    { label: "Abertos", value: String(kpiData.openRequests), icon: AlertCircle, color: "text-accent" },
    { label: "Em andamento", value: String(kpiData.inProgressRequests), icon: Clock, color: "text-primary" },
    { label: "Faturado", value: formatCurrency(kpiData.totalRevenue), icon: DollarSign, color: "text-success" },
    { label: "Custo Prestadores", value: formatCurrency(kpiData.totalCost), icon: Banknote, color: "text-destructive" },
  ];

  const kpiCards2 = [
    { label: "Tempo Méd. Atendimento", value: formatDuration(kpiData.avgServiceTimeMin), icon: Timer, color: "text-info" },
    { label: "Tempo Méd. Acionamento", value: formatDuration(kpiData.avgDispatchTimeMin), icon: Zap, color: "text-warning" },
    { label: "Distância Média", value: kpiData.avgKm > 0 ? `${kpiData.avgKm.toFixed(1)} km` : "—", icon: Route, color: "text-primary" },
    { label: "Valor Méd. Cobrado", value: formatCurrency(kpiData.avgCost), icon: DollarSign, color: "text-primary" },
    { label: "Valor Méd. Prestador", value: formatCurrency(kpiData.avgProviderCost), icon: Banknote, color: "text-destructive" },
    { label: "Custo Total Prestadores", value: formatCurrency(kpiData.totalCost), icon: Banknote, color: "text-destructive" },
  ];

  const requestClientMap = useMemo(() => {
    const map: Record<string, string> = {};
    allRequests.forEach((r) => { if (r.client_id) map[r.id] = r.client_id; });
    return map;
  }, [allRequests]);

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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="page-header">
          <h1>Dashboard</h1>
          <p>Visão geral das operações em tempo real</p>
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
              <SelectItem value="1">Hoje</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs — Row 1: Operacionais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} className="kpi-card hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
                <div className={`h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center`}>
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight">{loading ? "..." : kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KPIs — Row 2: Médias e Performance */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards2.map((kpi) => (
          <Card key={kpi.label} className="kpi-card hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
                <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight">{loading ? "..." : kpi.value}</p>
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
      {/* Heatmap + Origin/Destination Lists */}
      {(() => {
        const heatPoints: [number, number, number][] = requests
          .filter((r) => r.origin_lat && r.origin_lng)
          .map((r) => [Number(r.origin_lat), Number(r.origin_lng), 1]);

        // Aggregate origins
        const originCounts: Record<string, number> = {};
        const destCounts: Record<string, number> = {};
        requests.forEach((r) => {
          if (r.origin_address) originCounts[r.origin_address] = (originCounts[r.origin_address] || 0) + 1;
          if (r.destination_address) destCounts[r.destination_address] = (destCounts[r.destination_address] || 0) + 1;
        });
        const topOrigins = Object.entries(originCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
        const topDests = Object.entries(destCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);

        return (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mapa de Calor — Origens dos Atendimentos</CardTitle>
              </CardHeader>
              <CardContent>
                {heatPoints.length === 0 ? (
                  <p className="text-muted-foreground text-center py-12">Nenhuma coordenada registrada</p>
                ) : (
                  <Suspense fallback={<div className="h-[450px] flex items-center justify-center text-muted-foreground">Carregando mapa…</div>}>
                      <ServiceHeatmap points={heatPoints} />
                    </Suspense>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top Origens</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {topOrigins.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Sem dados</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {topOrigins.map(([address, count], i) => (
                        <div key={i} className="flex items-center justify-between px-6 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{i + 1}</span>
                            <span className="text-sm truncate">{address}</span>
                          </div>
                          <span className="text-sm font-semibold text-primary shrink-0 ml-2">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top Destinos</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {topDests.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">Sem dados</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {topDests.map(([address, count], i) => (
                        <div key={i} className="flex items-center justify-between px-6 py-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{i + 1}</span>
                            <span className="text-sm truncate">{address}</span>
                          </div>
                          <span className="text-sm font-semibold text-primary shrink-0 ml-2">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        );
      })()}

      {/* NPS Panel */}
      <Suspense fallback={<div className="text-muted-foreground text-center py-8">Carregando NPS…</div>}>
        <NpsPanel
          clientFilter={clientFilter}
          periodDays={days}
          requestClientMap={requestClientMap}
        />
      </Suspense>
    </div>
  );
}
