import { useState, useMemo } from "react";
import { format, subMonths, startOfMonth, endOfMonth, parseISO, isBefore, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BarChart3, TrendingUp, DollarSign, FileText, Calendar } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTenantId, formatCurrency, SERVICE_TYPE_LABELS } from "@/hooks/useFinancialData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const CHART_COLORS = [
  "hsl(218, 58%, 26%)",   // primary
  "hsl(48, 92%, 52%)",    // accent
  "hsl(354, 82%, 42%)",   // destructive
  "hsl(142, 60%, 45%)",   // success
  "hsl(218, 58%, 40%)",   // info
  "hsl(215, 10%, 52%)",   // muted
  "hsl(280, 60%, 50%)",
  "hsl(30, 80%, 55%)",
];

function usePeriodRange(months: number) {
  return useMemo(() => {
    const end = endOfMonth(new Date());
    const start = startOfMonth(subMonths(new Date(), months - 1));
    return { start, end, startStr: format(start, "yyyy-MM-dd"), endStr: format(end, "yyyy-MM-dd") };
  }, [months]);
}

function useReportData(tenantId: string | null | undefined, period: { startStr: string; endStr: string }) {
  return useQuery({
    queryKey: ["report-requests", tenantId, period.startStr, period.endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select(`
          id, service_type, status, provider_cost, charged_amount,
          created_at, completed_at, client_id,
          clients (id, name)
        `)
        .eq("tenant_id", tenantId!)
        .gte("created_at", period.startStr)
        .lte("created_at", period.endStr + "T23:59:59")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

function useInvoiceReport(tenantId: string | null | undefined, period: { startStr: string; endStr: string }) {
  return useQuery({
    queryKey: ["report-invoices", tenantId, period.startStr, period.endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`*, clients (id, name)`)
        .eq("tenant_id", tenantId!)
        .gte("created_at", period.startStr)
        .lte("created_at", period.endStr + "T23:59:59")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

function useClosingReport(tenantId: string | null | undefined, period: { startStr: string; endStr: string }) {
  return useQuery({
    queryKey: ["report-closings", tenantId, period.startStr, period.endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_closings")
        .select(`*, providers (id, name)`)
        .eq("tenant_id", tenantId!)
        .gte("created_at", period.startStr)
        .lte("created_at", period.endStr + "T23:59:59")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-md text-xs">
      <p className="font-medium text-card-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}:</span>
          <span className="font-mono font-medium">
            {typeof p.value === "number" && p.name !== "Atendimentos"
              ? formatCurrency(p.value)
              : p.value}
          </span>
        </p>
      ))}
    </div>
  );
};

export default function FinancialReports() {
  const [periodMonths, setPeriodMonths] = useState(6);
  const { data: tenantId } = useTenantId();
  const period = usePeriodRange(periodMonths);
  const { data: requests = [], isLoading: loadingReq } = useReportData(tenantId, period);
  const { data: invoices = [], isLoading: loadingInv } = useInvoiceReport(tenantId, period);
  const { data: closings = [], isLoading: loadingCl } = useClosingReport(tenantId, period);

  const isLoading = loadingReq || loadingInv || loadingCl;

  // Monthly aggregation for bar/line charts
  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; atendimentos: number; custo: number; faturado: number; markup: number }>();
    requests.forEach((r) => {
      const m = format(parseISO(r.created_at), "MMM/yy", { locale: ptBR });
      const entry = map.get(m) || { month: m, atendimentos: 0, custo: 0, faturado: 0, markup: 0 };
      entry.atendimentos += 1;
      entry.custo += Number(r.provider_cost) || 0;
      entry.faturado += Number(r.charged_amount) || 0;
      entry.markup += (Number(r.charged_amount) || 0) - (Number(r.provider_cost) || 0);
      map.set(m, entry);
    });
    return Array.from(map.values());
  }, [requests]);

  // Service type breakdown
  const serviceTypeData = useMemo(() => {
    const map = new Map<string, number>();
    requests.forEach((r) => {
      const label = SERVICE_TYPE_LABELS[r.service_type] || r.service_type;
      map.set(label, (map.get(label) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [requests]);

  // Client breakdown
  const clientData = useMemo(() => {
    const map = new Map<string, { name: string; atendimentos: number; custo: number; faturado: number }>();
    requests.forEach((r) => {
      const name = (r.clients as any)?.name || "Sem cliente";
      const entry = map.get(name) || { name, atendimentos: 0, custo: 0, faturado: 0 };
      entry.atendimentos += 1;
      entry.custo += Number(r.provider_cost) || 0;
      entry.faturado += Number(r.charged_amount) || 0;
      map.set(name, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.faturado - a.faturado);
  }, [requests]);

  // KPIs
  const kpis = useMemo(() => {
    const totalAtendimentos = requests.length;
    const totalCusto = requests.reduce((s, r) => s + (Number(r.provider_cost) || 0), 0);
    const totalFaturado = requests.reduce((s, r) => s + (Number(r.charged_amount) || 0), 0);
    const totalMarkup = totalFaturado - totalCusto;
    const totalInvoiced = invoices.reduce((s, i) => s + (Number(i.total_charged) || 0), 0);
    return { totalAtendimentos, totalCusto, totalFaturado, totalMarkup, totalInvoiced };
  }, [requests, invoices]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Relatórios Financeiros
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Análise de atendimentos, custos e faturamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Select value={String(periodMonths)} onValueChange={(v) => setPeriodMonths(Number(v))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Últimos 3 meses</SelectItem>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Atendimentos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalAtendimentos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Custo Total</CardTitle>
            <DollarSign className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(kpis.totalCusto)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Faturado</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(kpis.totalFaturado)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Margem</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "hsl(142, 60%, 45%)" }}>
              {formatCurrency(kpis.totalMarkup)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="services">Tipos de Serviço</TabsTrigger>
          <TabsTrigger value="clients">Por Cliente</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Atendimentos por Mês</CardTitle>
                <CardDescription>Quantidade de atendimentos no período</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {monthlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(215, 10%, 52%)" }} />
                        <YAxis className="text-xs" tick={{ fill: "hsl(215, 10%, 52%)" }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="atendimentos" name="Atendimentos" fill="hsl(218, 58%, 26%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Sem dados no período
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Custo vs Faturamento</CardTitle>
                <CardDescription>Comparativo mensal de custos e receita</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {monthlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(215, 10%, 52%)" }} />
                        <YAxis className="text-xs" tick={{ fill: "hsl(215, 10%, 52%)" }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="custo" name="Custo" stroke="hsl(354, 82%, 42%)" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="faturado" name="Faturado" stroke="hsl(218, 58%, 26%)" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="markup" name="Margem" stroke="hsl(142, 60%, 45%)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Sem dados no período
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Service Types Tab */}
        <TabsContent value="services" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribuição por Tipo de Serviço</CardTitle>
                <CardDescription>Quantidade de atendimentos por tipo</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[350px]">
                  {serviceTypeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={serviceTypeData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={120}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                          labelLine
                        >
                          {serviceTypeData.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Sem dados no período
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking de Serviços</CardTitle>
                <CardDescription>Tipos de serviço mais solicitados</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {serviceTypeData.length > 0 ? serviceTypeData.map((item, i) => {
                    const max = serviceTypeData[0]?.value || 1;
                    return (
                      <div key={item.name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium text-foreground">{item.name}</span>
                          <span className="text-muted-foreground">{item.value}</span>
                        </div>
                        <div className="h-2 rounded-full bg-secondary">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{
                              width: `${(item.value / max) * 100}%`,
                              backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    );
                  }) : (
                    <div className="text-center text-muted-foreground text-sm py-8">
                      Sem dados no período
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Clients Tab */}
        <TabsContent value="clients" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Faturamento por Cliente</CardTitle>
              <CardDescription>Comparativo de custo e faturamento por cliente</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                {clientData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clientData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="custo" name="Custo" fill="hsl(354, 82%, 42%)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="faturado" name="Faturado" fill="hsl(218, 58%, 26%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                    Sem dados no período
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Client table summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo por Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground">Cliente</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Atendimentos</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Custo</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Faturado</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientData.map((c) => (
                      <tr key={c.name} className="border-b last:border-0">
                        <td className="py-2 font-medium">{c.name}</td>
                        <td className="py-2 text-right">{c.atendimentos}</td>
                        <td className="py-2 text-right text-destructive">{formatCurrency(c.custo)}</td>
                        <td className="py-2 text-right text-primary">{formatCurrency(c.faturado)}</td>
                        <td className="py-2 text-right" style={{ color: c.faturado - c.custo >= 0 ? "hsl(142, 60%, 45%)" : "hsl(354, 82%, 42%)" }}>
                          {formatCurrency(c.faturado - c.custo)}
                        </td>
                      </tr>
                    ))}
                    {clientData.length === 0 && (
                      <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Sem dados no período</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
