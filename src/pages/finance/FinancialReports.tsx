import React, { useState, useMemo } from "react";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart3, TrendingUp, DollarSign, FileText, Calendar as CalendarIcon, Car, Phone,
  User, Search, Download, Filter, Users, Building2, CheckCircle2, Clock,
  Banknote, Receipt, AlertTriangle, ChevronsUpDown, Check, X,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useTenantId, formatCurrency, SERVICE_TYPE_LABELS } from "@/hooks/useFinancialData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { maskCPF, maskPhone } from "@/lib/masks";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
  "hsl(218, 58%, 26%)",
  "hsl(48, 92%, 52%)",
  "hsl(354, 82%, 42%)",
  "hsl(142, 60%, 45%)",
  "hsl(218, 58%, 40%)",
  "hsl(215, 10%, 52%)",
  "hsl(280, 60%, 50%)",
  "hsl(30, 80%, 55%)",
];

const STATUS_LABELS: Record<string, string> = {
  open: "Aberto",
  awaiting_dispatch: "Aguardando Despacho",
  dispatched: "Despachado",
  in_progress: "Em Andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  mechanical_failure: "Pane Mecânica",
  accident: "Acidente",
  theft: "Roubo/Furto",
  flat_tire: "Pneu Furado",
  locked_out: "Chave Trancada",
  battery_dead: "Bateria",
  fuel_empty: "Sem Combustível",
  other: "Outro",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "À vista",
  invoiced: "Faturado",
};

function usePeriodRange(months: number, customFrom?: Date, customTo?: Date) {
  return useMemo(() => {
    if (customFrom && customTo) {
      return {
        start: customFrom,
        end: customTo,
        startStr: format(customFrom, "yyyy-MM-dd"),
        endStr: format(customTo, "yyyy-MM-dd"),
      };
    }
    const end = endOfMonth(new Date());
    const start = startOfMonth(subMonths(new Date(), months - 1));
    return { start, end, startStr: format(start, "yyyy-MM-dd"), endStr: format(end, "yyyy-MM-dd") };
  }, [months, customFrom, customTo]);
}

function exportToCsv(filename: string, headers: string[], rows: string[][]) {
  const BOM = "\uFEFF";
  const csvContent = BOM + [
    headers.join(";"),
    ...rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")),
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Independent client query for Combobox (not dependent on beneficiaries)
function useClients(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["report-clients-list", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, billing_model, api_endpoint")
        .eq("tenant_id", tenantId!)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

// Full service request data with beneficiary + client relations
function useDetailedRequests(tenantId: string | null | undefined, period: { startStr: string; endStr: string }) {
  return useQuery({
    queryKey: ["report-detailed-requests", tenantId, period.startStr, period.endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_requests")
        .select(`
          id, protocol, service_type, event_type, status,
          provider_cost, charged_amount, financial_status,
          payment_method, payment_term, payment_received_at,
          created_at, completed_at,
          requester_name, requester_phone, requester_phone_secondary, requester_email,
          vehicle_plate, vehicle_model, vehicle_year,
          origin_address, destination_address, estimated_km,
          difficult_access, vehicle_lowered, notes,
          client_id, clients (id, name),
          beneficiary_id, beneficiaries (id, name, cpf, phone, vehicle_plate, vehicle_model, vehicle_year, cooperativa, active)
        `)
        .eq("tenant_id", tenantId!)
        .gte("created_at", period.startStr)
        .lte("created_at", period.endStr + "T23:59:59")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!tenantId,
  });
}

// Beneficiaries with client + plan info
function useBeneficiaryReport(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ["report-beneficiaries", tenantId],
    queryFn: async () => {
      // First get client IDs for this tenant
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, billing_model, api_endpoint")
        .eq("tenant_id", tenantId!)
        .eq("active", true);

      if (!clients?.length) return { beneficiaries: [], clients: [] };

      const clientIds = clients.map((c) => c.id);
      
      // Fetch ALL beneficiaries using pagination to bypass 1000 row limit
      let allBens: any[] = [];
      const pageSize = 1000;
      
      for (const clientId of clientIds) {
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          const { data: bens, error } = await supabase
            .from("beneficiaries")
            .select(`
              id, name, cpf, phone, vehicle_plate, vehicle_model, vehicle_year,
              vehicle_chassis, cooperativa, active, created_at,
              client_id,
              plan_id, plans (id, name, plate_fee)
            `)
            .eq("client_id", clientId)
            .range(from, from + pageSize - 1)
            .order("name");
          if (error) throw error;
          allBens = allBens.concat(bens ?? []);
          hasMore = (bens?.length ?? 0) === pageSize;
          from += pageSize;
        }
      }
      
      return { beneficiaries: allBens, clients };
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
  const [searchRequests, setSearchRequests] = useState("");
  const [searchBeneficiaries, setSearchBeneficiaries] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [customDateFrom, setCustomDateFrom] = useState<Date | undefined>();
  const [customDateTo, setCustomDateTo] = useState<Date | undefined>();
  const [clientComboOpen, setClientComboOpen] = useState(false);
  const [clientComboOpenBen, setClientComboOpenBen] = useState(false);

  const { data: tenantId } = useTenantId();
  const period = usePeriodRange(periodMonths, customDateFrom, customDateTo);
  const { data: requests = [], isLoading: loadingReq } = useDetailedRequests(tenantId, period);
  const { data: benData, isLoading: loadingBen } = useBeneficiaryReport(tenantId);

  // Fetch dispatches to get provider info for each request
  const requestIds = useMemo(() => requests.map((r) => r.id), [requests]);
  const { data: dispatchProviderMap = {} } = useQuery({
    queryKey: ["dispatch-providers-for-reports", requestIds],
    queryFn: async () => {
      if (!requestIds.length) return {};
      const map: Record<string, string> = {};
      const batchSize = 200;
      for (let i = 0; i < requestIds.length; i += batchSize) {
        const batch = requestIds.slice(i, i + batchSize);
        const { data } = await supabase
          .from("dispatches")
          .select("service_request_id, providers (name)")
          .in("service_request_id", batch)
          .eq("status", "completed");
        (data ?? []).forEach((d: any) => {
          if (d.providers?.name) {
            map[d.service_request_id] = d.providers.name;
          }
        });
      }
      return map;
    },
    enabled: requestIds.length > 0,
  });
  const beneficiaries = benData?.beneficiaries ?? [];
  const clients = benData?.clients ?? [];
  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  // === Charts data ===
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

  const clientChartData = useMemo(() => {
    const map = new Map<string, { name: string; atendimentos: number; custo: number; faturado: number; ganho: number }>();
    requests.forEach((r) => {
      const name = (r.clients as any)?.name || "Sem cliente";
      const entry = map.get(name) || { name, atendimentos: 0, custo: 0, faturado: 0, ganho: 0 };
      entry.atendimentos += 1;
      entry.custo += Number(r.provider_cost) || 0;
      entry.faturado += Number(r.charged_amount) || 0;
      entry.ganho += (Number(r.charged_amount) || 0) - (Number(r.provider_cost) || 0);
      map.set(name, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.faturado - a.faturado);
  }, [requests]);

  // === KPIs ===
  const kpis = useMemo(() => {
    const totalAtendimentos = requests.length;
    const totalCusto = requests.reduce((s, r) => s + (Number(r.provider_cost) || 0), 0);
    const totalFaturado = requests.reduce((s, r) => s + (Number(r.charged_amount) || 0), 0);
    const totalMarkup = totalFaturado - totalCusto;
    const activeBens = beneficiaries.filter((b) => b.active && b.vehicle_plate);
    const totalPlacasAtivas = new Set(activeBens.map((b) => b.vehicle_plate!.toUpperCase().replace(/[^A-Z0-9]/g, ""))).size;
    return { totalAtendimentos, totalCusto, totalFaturado, totalMarkup, totalPlacasAtivas };
  }, [requests, beneficiaries]);

  // === Vehicle usage ranking (last 12 months, only valid statuses) ===
  const vehicleUsageRanking = useMemo(() => {
    const twelveMonthsAgo = subMonths(new Date(), 12);
    const map = new Map<string, { plate: string; model: string; beneficiary: string; client: string; clientId: string; count: number; lastDate: string; requestIds: string[] }>();
    requests.forEach((r) => {
      if (!r.vehicle_plate) return;
      if (new Date(r.created_at) < twelveMonthsAgo) return;
      if (["cancelled", "refunded"].includes(r.status)) return;
      const plate = r.vehicle_plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const entry = map.get(plate) || {
        plate: r.vehicle_plate,
        model: r.vehicle_model || "—",
        beneficiary: (r.beneficiaries as any)?.name || r.requester_name || "—",
        client: (r.clients as any)?.name || "Sem cliente",
        clientId: r.client_id || "",
        count: 0,
        lastDate: r.created_at,
        requestIds: [],
      };
      entry.count += 1;
      entry.requestIds.push(r.id);
      if (r.created_at > entry.lastDate) entry.lastDate = r.created_at;
      map.set(plate, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [requests]);

  const [expandedVehiclePlate, setExpandedVehiclePlate] = useState<string | null>(null);

  const expandedVehicleRequests = useMemo(() => {
    if (!expandedVehiclePlate) return [];
    const entry = vehicleUsageRanking.find((v) => v.plate === expandedVehiclePlate);
    if (!entry) return [];
    return requests
      .filter((r) => entry.requestIds.includes(r.id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [expandedVehiclePlate, vehicleUsageRanking, requests]);

  // === Filtered requests ===
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (clientFilter !== "all" && r.client_id !== clientFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (searchRequests) {
        const q = searchRequests.toLowerCase();
        const matches =
          r.protocol?.toLowerCase().includes(q) ||
          r.requester_name?.toLowerCase().includes(q) ||
          r.vehicle_plate?.toLowerCase().includes(q) ||
          r.requester_phone?.includes(q) ||
          (r.beneficiaries as any)?.name?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [requests, clientFilter, statusFilter, searchRequests]);

  // === Filtered beneficiaries ===
  const filteredBeneficiaries = useMemo(() => {
    return beneficiaries.filter((b) => {
      if (clientFilter !== "all" && b.client_id !== clientFilter) return false;
      if (searchBeneficiaries) {
        const q = searchBeneficiaries.toLowerCase();
        return (
          b.name?.toLowerCase().includes(q) ||
          b.cpf?.toLowerCase().includes(q) ||
          b.vehicle_plate?.toLowerCase().includes(q) ||
          b.phone?.includes(q) ||
          b.cooperativa?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [beneficiaries, clientFilter, searchBeneficiaries]);

  // Determine data origin per client
  const getDataOrigin = (clientId: string) => {
    const client = clientMap[clientId];
    if (!client) return "manual";
    return client.api_endpoint ? "erp" : "manual";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Relatórios
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Atendimentos, beneficiários, placas e dados financeiros
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          <Select value={String(periodMonths)} onValueChange={(v) => { setPeriodMonths(Number(v)); setCustomDateFrom(undefined); setCustomDateTo(undefined); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">Últimos 3 meses</SelectItem>
              <SelectItem value="6">Últimos 6 meses</SelectItem>
              <SelectItem value="12">Últimos 12 meses</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !customDateFrom && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {customDateFrom ? format(customDateFrom, "dd/MM/yyyy") : "De"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customDateFrom} onSelect={setCustomDateFrom} initialFocus locale={ptBR} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal", !customDateTo && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4" />
                {customDateTo ? format(customDateTo, "dd/MM/yyyy") : "Até"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customDateTo} onSelect={setCustomDateTo} initialFocus locale={ptBR} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          {(customDateFrom || customDateTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setCustomDateFrom(undefined); setCustomDateTo(undefined); }} className="gap-1">
              <X className="h-4 w-4" /> Limpar
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Atendimentos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{kpis.totalAtendimentos}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Placas Ativas</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{kpis.totalPlacasAtivas}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Custo Total</CardTitle>
            <DollarSign className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{formatCurrency(kpis.totalCusto)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Faturado</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{formatCurrency(kpis.totalFaturado)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Ganho</CardTitle>
            <TrendingUp className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" style={{ color: "hsl(142, 60%, 45%)" }}>
              {formatCurrency(kpis.totalMarkup)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="payments">Recebimentos</TabsTrigger>
          <TabsTrigger value="requests">Atendimentos</TabsTrigger>
          <TabsTrigger value="beneficiaries">Beneficiários / Placas</TabsTrigger>
          <TabsTrigger value="clients">Por Cliente</TabsTrigger>
          <TabsTrigger value="vehicle-usage">Veículos + Acionados</TabsTrigger>
        </TabsList>

        {/* ===== OVERVIEW TAB ===== */}
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
                        <XAxis dataKey="month" tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} />
                        <YAxis tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="atendimentos" name="Atendimentos" fill="hsl(218, 58%, 26%)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <EmptyChart />}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Custo vs Faturamento</CardTitle>
                <CardDescription>Comparativo mensal</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {monthlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} />
                        <YAxis tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend />
                        <Line type="monotone" dataKey="custo" name="Custo" stroke="hsl(354, 82%, 42%)" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="faturado" name="Faturado" stroke="hsl(218, 58%, 26%)" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="markup" name="Ganho" stroke="hsl(142, 60%, 45%)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : <EmptyChart />}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Tipos de Serviço</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  {serviceTypeData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={serviceTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                          label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine>
                          {serviceTypeData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <EmptyChart />}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking de Serviços</CardTitle>
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
                          <div className="h-2 rounded-full transition-all"
                            style={{ width: `${(item.value / max) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                        </div>
                      </div>
                    );
                  }) : <EmptyChart />}
                </div>
              </CardContent>
            </Card>

            {/* Ganho Mensal Chart - full width */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" style={{ color: "hsl(142, 60%, 45%)" }} />
                  Evolução do Ganho Mensal
                </CardTitle>
                <CardDescription>Lucro (cobrado − custo) mês a mês</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[320px]">
                  {monthlyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis dataKey="month" tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} />
                        <YAxis tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="markup" name="Ganho" radius={[4, 4, 0, 0]}>
                          {monthlyData.map((entry, i) => (
                            <Cell key={i} fill={entry.markup >= 0 ? "hsl(142, 60%, 45%)" : "hsl(354, 82%, 42%)"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <EmptyChart />}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ===== PAYMENTS / RECEBIMENTOS TAB ===== */}
        <TabsContent value="payments" className="space-y-4">
          <PaymentsTab
            requests={requests}
            clients={clients}
            period={period}
            loading={loadingReq}
          />
        </TabsContent>


        <TabsContent value="requests" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Protocolo, nome, placa, telefone..." value={searchRequests}
                onChange={(e) => setSearchRequests(e.target.value)} className="pl-9" />
            </div>
            <Popover open={clientComboOpen} onOpenChange={setClientComboOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={clientComboOpen} className="w-[240px] justify-between">
                  {clientFilter === "all" ? "Todos os clientes" : clients.find((c) => c.id === clientFilter)?.name || "Selecionar..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar cliente..." />
                  <CommandList>
                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="all" onSelect={() => { setClientFilter("all"); setClientComboOpen(false); }}>
                        <Check className={cn("mr-2 h-4 w-4", clientFilter === "all" ? "opacity-100" : "opacity-0")} />
                        Todos os clientes
                      </CommandItem>
                      {clients.map((c) => (
                        <CommandItem key={c.id} value={c.name} onSelect={() => { setClientFilter(c.id); setClientComboOpen(false); }}>
                          <Check className={cn("mr-2 h-4 w-4", clientFilter === c.id ? "opacity-100" : "opacity-0")} />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-xs">{filteredRequests.length} registros</Badge>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => {
              const headers = ["Protocolo","Data","Solicitante","Telefone","Beneficiário","CPF","Placa","Veículo","Serviço","Evento","Cliente","Prestador","Origem","Custo","Cobrado","Status","Dados"];
              const rows = filteredRequests.map((r) => {
                const ben = r.beneficiaries as any;
                const client = r.clients as any;
                const providerName = dispatchProviderMap[r.id] || "";
                return [
                  r.protocol, format(parseISO(r.created_at), "dd/MM/yyyy HH:mm"),
                  r.requester_name, r.requester_phone || "", ben?.name || "", ben?.cpf || "",
                  r.vehicle_plate || "", `${r.vehicle_model || ""}${r.vehicle_year ? ` ${r.vehicle_year}` : ""}`,
                  SERVICE_TYPE_LABELS[r.service_type] || r.service_type,
                  EVENT_TYPE_LABELS[r.event_type] || r.event_type,
                  client?.name || "", providerName, r.origin_address || "",
                  String(Number(r.provider_cost) || 0), String(Number(r.charged_amount) || 0),
                  STATUS_LABELS[r.status] || r.status, getDataOrigin(r.client_id || "") === "erp" ? "ERP" : "Manual",
                ];
              });
              exportToCsv("atendimentos", headers, rows);
            }}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingReq ? (
                <div className="p-8 text-center text-muted-foreground">Carregando...</div>
              ) : filteredRequests.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhum atendimento encontrado no período.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Protocolo</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Solicitante</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Beneficiário</TableHead>
                        <TableHead>Placa</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Serviço</TableHead>
                        <TableHead>Evento</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Prestador</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead className="text-right">Cobrado</TableHead>
                        <TableHead className="text-right">Ganho</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Dados</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.map((r) => {
                        const ben = r.beneficiaries as any;
                        const client = r.clients as any;
                        const origin = getDataOrigin(r.client_id || "");
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs font-medium whitespace-nowrap">{r.protocol}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {format(parseISO(r.created_at), "dd/MM/yy HH:mm")}
                            </TableCell>
                            <TableCell className="text-sm font-medium whitespace-nowrap">{r.requester_name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {r.requester_phone ? maskPhone(r.requester_phone) : "—"}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">
                              {ben?.name || "—"}
                              {ben?.cpf && <span className="block text-xs text-muted-foreground">{maskCPF(ben.cpf)}</span>}
                            </TableCell>
                            <TableCell>
                              {r.vehicle_plate ? (
                                <Badge variant="outline" className="font-mono text-xs gap-1">
                                  <Car className="h-3 w-3" />{r.vehicle_plate}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {r.vehicle_model || "—"}{r.vehicle_year ? ` ${r.vehicle_year}` : ""}
                            </TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs whitespace-nowrap">
                                {SERVICE_TYPE_LABELS[r.service_type] || r.service_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {EVENT_TYPE_LABELS[r.event_type] || r.event_type}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{client?.name || "—"}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{dispatchProviderMap[r.id] || "—"}</TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate" title={r.origin_address || ""}>
                              {r.origin_address || "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-destructive whitespace-nowrap">
                              {formatCurrency(Number(r.provider_cost) || 0)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-primary whitespace-nowrap">
                              {formatCurrency(Number(r.charged_amount) || 0)}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs whitespace-nowrap" style={{ color: (Number(r.charged_amount) || 0) - (Number(r.provider_cost) || 0) >= 0 ? "hsl(142, 60%, 45%)" : "hsl(354, 82%, 42%)" }}>
                              {formatCurrency((Number(r.charged_amount) || 0) - (Number(r.provider_cost) || 0))}
                            </TableCell>
                            <TableCell>
                              <Badge variant={r.status === "completed" ? "default" : r.status === "cancelled" ? "destructive" : "secondary"} className="text-xs whitespace-nowrap">
                                {STATUS_LABELS[r.status] || r.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs whitespace-nowrap">
                                {origin === "erp" ? "ERP" : "Manual"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                    <tfoot>
                      <TableRow className="bg-muted/50 font-bold border-t-2">
                        <TableCell colSpan={12} className="text-right text-sm">TOTAIS ({filteredRequests.length} atendimentos)</TableCell>
                        <TableCell className="text-right font-mono text-xs text-destructive whitespace-nowrap">
                          {formatCurrency(filteredRequests.reduce((s, r) => s + (Number(r.provider_cost) || 0), 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-primary whitespace-nowrap">
                          {formatCurrency(filteredRequests.reduce((s, r) => s + (Number(r.charged_amount) || 0), 0))}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs whitespace-nowrap" style={{ color: "hsl(142, 60%, 45%)" }}>
                          {formatCurrency(filteredRequests.reduce((s, r) => s + ((Number(r.charged_amount) || 0) - (Number(r.provider_cost) || 0)), 0))}
                        </TableCell>
                        <TableCell colSpan={2} />
                      </TableRow>
                    </tfoot>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== BENEFICIARIES / PLATES TAB ===== */}
        <TabsContent value="beneficiaries" className="space-y-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Nome, CPF, placa, telefone, cooperativa..." value={searchBeneficiaries}
                onChange={(e) => setSearchBeneficiaries(e.target.value)} className="pl-9" />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-[240px] justify-between">
                  {clientFilter === "all" ? "Todos os clientes" : clients.find((c) => c.id === clientFilter)?.name || "Selecionar..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[280px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar cliente..." />
                  <CommandList>
                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="all" onSelect={() => setClientFilter("all")}>
                        <Check className={cn("mr-2 h-4 w-4", clientFilter === "all" ? "opacity-100" : "opacity-0")} />
                        Todos os clientes
                      </CommandItem>
                      {clients.map((c) => (
                        <CommandItem key={c.id} value={c.name} onSelect={() => setClientFilter(c.id)}>
                          <Check className={cn("mr-2 h-4 w-4", clientFilter === c.id ? "opacity-100" : "opacity-0")} />
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Badge variant="outline" className="text-xs">{filteredBeneficiaries.length} beneficiários</Badge>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => {
              const headers = ["Nome","CPF","Telefone","Placa","Veículo","Ano","Chassi","Cooperativa","Cliente","Plano","Valor/Placa","Status","Origem","Cadastro"];
              const rows = filteredBeneficiaries.map((b) => {
                const client = clientMap[b.client_id];
                const plan = b.plans as any;
                const origin = getDataOrigin(b.client_id);
                return [
                  b.name, b.cpf || "", b.phone || "", b.vehicle_plate || "",
                  b.vehicle_model || "", String(b.vehicle_year || ""), b.vehicle_chassis || "",
                  b.cooperativa || "", client?.name || "", plan?.name || "",
                  plan?.plate_fee ? String(Number(plan.plate_fee)) : "",
                  b.active ? "Ativo" : "Inativo", origin === "erp" ? "ERP" : "Manual",
                  format(parseISO(b.created_at), "dd/MM/yyyy"),
                ];
              });
              exportToCsv("beneficiarios", headers, rows);
            }}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          {/* Plates summary per client */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {clients.map((client) => {
              const cBens = beneficiaries.filter((b) => b.client_id === client.id);
              const active = cBens.filter((b) => b.active).length;
              const inactive = cBens.filter((b) => !b.active).length;
              const origin = client.api_endpoint ? "ERP" : "Manual";
              return (
                <Card key={client.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        {client.name}
                      </CardTitle>
                      <Badge variant="outline" className="text-xs">{origin}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total: </span>
                        <span className="font-bold">{cBens.length}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ativas: </span>
                        <span className="font-bold" style={{ color: "hsl(142, 60%, 45%)" }}>{active}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Inativas: </span>
                        <span className="font-bold text-destructive">{inactive}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingBen ? (
                <div className="p-8 text-center text-muted-foreground">Carregando...</div>
              ) : filteredBeneficiaries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">Nenhum beneficiário encontrado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>CPF</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Placa</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Chassi</TableHead>
                        <TableHead>Cooperativa</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead className="text-right">Valor/Placa</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Origem</TableHead>
                        <TableHead>Cadastro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBeneficiaries.map((b) => {
                        const client = clientMap[b.client_id];
                        const plan = b.plans as any;
                        const origin = getDataOrigin(b.client_id);
                        return (
                          <TableRow key={b.id}>
                            <TableCell className="font-medium whitespace-nowrap">{b.name}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {b.cpf ? maskCPF(b.cpf) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {b.phone ? maskPhone(b.phone) : "—"}
                            </TableCell>
                            <TableCell>
                              {b.vehicle_plate ? (
                                <Badge variant="outline" className="font-mono text-xs gap-1">
                                  <Car className="h-3 w-3" />{b.vehicle_plate}
                                </Badge>
                              ) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {b.vehicle_model || "—"}{b.vehicle_year ? ` ${b.vehicle_year}` : ""}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {b.vehicle_chassis || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{b.cooperativa || "—"}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{client?.name || "—"}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{plan?.name || "—"}</TableCell>
                            <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                              {plan?.plate_fee ? formatCurrency(Number(plan.plate_fee)) : "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant={b.active ? "default" : "destructive"} className="text-xs">
                                {b.active ? "Ativo" : "Inativo"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {origin === "erp" ? "ERP" : "Manual"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(parseISO(b.created_at), "dd/MM/yy")}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== CLIENTS TAB ===== */}
        <TabsContent value="clients" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Faturamento por Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                {clientChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clientChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={150} tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend />
                      <Bar dataKey="custo" name="Custo" fill="hsl(354, 82%, 42%)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="faturado" name="Faturado" fill="hsl(218, 58%, 26%)" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="ganho" name="Ganho" fill="hsl(142, 60%, 45%)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <EmptyChart />}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Resumo por Cliente</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Modelo Cobrança</TableHead>
                      <TableHead className="text-right">Placas</TableHead>
                      <TableHead className="text-right">Atendimentos</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                      <TableHead className="text-right">Faturado</TableHead>
                      <TableHead className="text-right">Ganho</TableHead>
                      <TableHead>Dados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientChartData.map((c) => {
                      const clientObj = clients.find((cl) => cl.name === c.name);
                      const cBens = beneficiaries.filter((b) => b.client_id === clientObj?.id);
                      const billingLabel = clientObj?.billing_model === "plate_only" ? "Somente Placa" : "Placa + Serviço";
                      const origin = clientObj?.api_endpoint ? "ERP" : "Manual";
                      return (
                        <TableRow key={c.name}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-xs"><Badge variant="secondary">{billingLabel}</Badge></TableCell>
                          <TableCell className="text-right">{cBens.filter((b) => b.active).length}</TableCell>
                          <TableCell className="text-right">{c.atendimentos}</TableCell>
                          <TableCell className="text-right text-destructive font-mono text-sm">{formatCurrency(c.custo)}</TableCell>
                          <TableCell className="text-right text-primary font-mono text-sm">{formatCurrency(c.faturado)}</TableCell>
                          <TableCell className="text-right font-mono text-sm" style={{ color: c.ganho >= 0 ? "hsl(142, 60%, 45%)" : "hsl(354, 82%, 42%)" }}>
                            {formatCurrency(c.ganho)}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{origin}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                    {clientChartData.length > 0 && (
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell>Total</TableCell>
                        <TableCell />
                        <TableCell className="text-right">{beneficiaries.filter((b) => b.active).length}</TableCell>
                        <TableCell className="text-right">{clientChartData.reduce((s, c) => s + c.atendimentos, 0)}</TableCell>
                        <TableCell className="text-right text-destructive font-mono text-sm">{formatCurrency(clientChartData.reduce((s, c) => s + c.custo, 0))}</TableCell>
                        <TableCell className="text-right text-primary font-mono text-sm">{formatCurrency(clientChartData.reduce((s, c) => s + c.faturado, 0))}</TableCell>
                        <TableCell className="text-right font-mono text-sm" style={{ color: "hsl(142, 60%, 45%)" }}>{formatCurrency(clientChartData.reduce((s, c) => s + c.ganho, 0))}</TableCell>
                        <TableCell />
                      </TableRow>
                    )}
                    {clientChartData.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Sem dados</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== VEHICLE USAGE TAB ===== */}
        <TabsContent value="vehicle-usage" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Veículos com Mais Acionamentos (Últimos 12 meses)
              </CardTitle>
              <CardDescription>
                Ranking de placas que mais utilizaram serviços nos últimos 12 meses. Atendimentos cancelados e estornados são excluídos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {vehicleUsageRanking.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado no período</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Placa</TableHead>
                        <TableHead>Modelo</TableHead>
                        <TableHead>Beneficiário</TableHead>
                        <TableHead>Empresa</TableHead>
                        <TableHead className="text-center">Acionamentos</TableHead>
                        <TableHead>Último Uso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {vehicleUsageRanking.slice(0, 50).map((v, idx) => (
                        <React.Fragment key={v.plate}>
                          <TableRow
                            className={`cursor-pointer hover:bg-muted/50 ${idx < 3 ? "bg-destructive/5" : ""} ${expandedVehiclePlate === v.plate ? "bg-muted/40" : ""}`}
                            onClick={() => setExpandedVehiclePlate(expandedVehiclePlate === v.plate ? null : v.plate)}
                          >
                            <TableCell className="font-bold text-muted-foreground">{idx + 1}</TableCell>
                            <TableCell className="font-mono font-bold">{v.plate}</TableCell>
                            <TableCell>{v.model}</TableCell>
                            <TableCell>{v.beneficiary}</TableCell>
                            <TableCell>{v.client}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={v.count >= 4 ? "destructive" : v.count >= 2 ? "secondary" : "outline"}>
                                {v.count}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {format(parseISO(v.lastDate), "dd/MM/yyyy")}
                            </TableCell>
                          </TableRow>
                          {expandedVehiclePlate === v.plate && (
                            <TableRow>
                              <TableCell colSpan={7} className="p-0">
                                <div className="bg-muted/20 p-4 border-t">
                                  <p className="text-sm font-medium mb-3">Histórico de Atendimentos — {v.plate}</p>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b">
                                          <th className="text-left p-2 font-medium">Data</th>
                                          <th className="text-left p-2 font-medium">Tipo de Serviço</th>
                                          <th className="text-left p-2 font-medium">KM</th>
                                          <th className="text-left p-2 font-medium">Origem</th>
                                          <th className="text-left p-2 font-medium">Destino</th>
                                          <th className="text-left p-2 font-medium">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {expandedVehicleRequests.map((r) => (
                                          <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                                            <td className="p-2 whitespace-nowrap">{format(parseISO(r.created_at), "dd/MM/yyyy HH:mm")}</td>
                                            <td className="p-2">{SERVICE_TYPE_LABELS[r.service_type] || r.service_type}</td>
                                            <td className="p-2">{r.estimated_km ? `${Number(r.estimated_km).toFixed(0)} km` : "—"}</td>
                                            <td className="p-2 max-w-[200px] truncate">{r.origin_address || "—"}</td>
                                            <td className="p-2 max-w-[200px] truncate">{r.destination_address || "—"}</td>
                                            <td className="p-2">
                                              <Badge variant="outline" className="text-[10px]">
                                                {r.status === "completed" ? "Concluído" : r.status === "cancelled" ? "Cancelado" : r.status}
                                              </Badge>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {vehicleUsageRanking.length > 0 && (
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => {
                      exportToCsv(
                        "veiculos-mais-acionados",
                        ["#", "Placa", "Modelo", "Beneficiário", "Empresa", "Acionamentos", "Último Uso"],
                        vehicleUsageRanking.map((v, i) => [
                          String(i + 1), v.plate, v.model, v.beneficiary, v.client,
                          String(v.count), format(parseISO(v.lastDate), "dd/MM/yyyy"),
                        ])
                      );
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaymentsTab({ requests, clients, period, loading }: {
  requests: any[];
  clients: any[];
  period: { startStr: string; endStr: string };
  loading: boolean;
}) {
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [searchPayments, setSearchPayments] = useState("");

  const completed = useMemo(() => requests.filter((r) => r.status === "completed"), [requests]);

  const filtered = useMemo(() => {
    return completed.filter((r) => {
      if (paymentFilter !== "all" && (r.payment_method || "") !== paymentFilter) return false;
      if (searchPayments) {
        const q = searchPayments.toLowerCase();
        return (
          r.protocol?.toLowerCase().includes(q) ||
          r.requester_name?.toLowerCase().includes(q) ||
          r.vehicle_plate?.toLowerCase().includes(q) ||
          (r.clients as any)?.name?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [completed, paymentFilter, searchPayments]);

  const kpis = useMemo(() => {
    const total = completed.reduce((s, r) => s + (Number(r.charged_amount) || 0), 0);
    const received = completed
      .filter((r) => r.payment_received_at)
      .reduce((s, r) => s + (Number(r.charged_amount) || 0), 0);
    const pending = total - received;
    const cashTotal = completed
      .filter((r) => r.payment_method === "cash")
      .reduce((s, r) => s + (Number(r.charged_amount) || 0), 0);
    const invoicedTotal = completed
      .filter((r) => r.payment_method === "invoiced")
      .reduce((s, r) => s + (Number(r.charged_amount) || 0), 0);
    const noMethod = completed
      .filter((r) => !r.payment_method)
      .reduce((s, r) => s + (Number(r.charged_amount) || 0), 0);
    return { total, received, pending, cashTotal, invoicedTotal, noMethod };
  }, [completed]);

  // Monthly received data
  const monthlyReceived = useMemo(() => {
    const map = new Map<string, { month: string; recebido: number; pendente: number; aVista: number; faturado: number }>();
    completed.forEach((r) => {
      const m = format(parseISO(r.created_at), "MMM/yy", { locale: ptBR });
      const entry = map.get(m) || { month: m, recebido: 0, pendente: 0, aVista: 0, faturado: 0 };
      const amt = Number(r.charged_amount) || 0;
      if (r.payment_received_at) {
        entry.recebido += amt;
      } else {
        entry.pendente += amt;
      }
      if (r.payment_method === "cash") entry.aVista += amt;
      if (r.payment_method === "invoiced") entry.faturado += amt;
      map.set(m, entry);
    });
    return Array.from(map.values());
  }, [completed]);

  // Pie data for payment method
  const methodPieData = useMemo(() => {
    const items: { name: string; value: number }[] = [];
    if (kpis.cashTotal > 0) items.push({ name: "À vista", value: kpis.cashTotal });
    if (kpis.invoicedTotal > 0) items.push({ name: "Faturado", value: kpis.invoicedTotal });
    if (kpis.noMethod > 0) items.push({ name: "Não definido", value: kpis.noMethod });
    return items;
  }, [kpis]);

  // Pie data for received status
  const receivedPieData = useMemo(() => {
    const items: { name: string; value: number }[] = [];
    if (kpis.received > 0) items.push({ name: "Recebido", value: kpis.received });
    if (kpis.pending > 0) items.push({ name: "Pendente", value: kpis.pending });
    return items;
  }, [kpis]);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Cobrado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(kpis.total)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Recebido</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{formatCurrency(kpis.received)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Pendente</CardTitle>
            <Clock className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-destructive">{formatCurrency(kpis.pending)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">À Vista</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(kpis.cashTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Faturado</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{formatCurrency(kpis.invoicedTotal)}</div></CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recebimentos por Mês</CardTitle>
            <CardDescription>Comparativo recebido vs pendente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {monthlyReceived.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyReceived}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="month" tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} />
                    <YAxis tick={{ fill: "hsl(215, 10%, 52%)", fontSize: 12 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="recebido" name="Recebido" fill="hsl(142, 60%, 45%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="pendente" name="Pendente" fill="hsl(354, 82%, 42%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-rows-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Por Forma de Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[120px]">
                {methodPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={methodPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} innerRadius={25}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                        {methodPieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyChart />}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recebido vs Pendente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[120px]">
                {receivedPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={receivedPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={50} innerRadius={25}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                        <Cell fill="hsl(142, 60%, 45%)" />
                        <Cell fill="hsl(354, 82%, 42%)" />
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <EmptyChart />}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filters + Table */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Protocolo, nome, placa, cliente..." value={searchPayments}
            onChange={(e) => setSearchPayments(e.target.value)} className="pl-9" />
        </div>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Forma de pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as formas</SelectItem>
            <SelectItem value="cash">À vista</SelectItem>
            <SelectItem value="invoiced">Faturado</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="text-xs">{filtered.length} registros</Badge>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => {
          const headers = ["Protocolo", "Data", "Cliente", "Solicitante", "Placa", "Serviço", "Cobrado", "Forma Pgto", "Prazo", "Dt Recebimento", "Status Pgto"];
          const rows = filtered.map((r) => [
            r.protocol,
            format(parseISO(r.created_at), "dd/MM/yyyy"),
            (r.clients as any)?.name || "",
            r.requester_name,
            r.vehicle_plate || "",
            SERVICE_TYPE_LABELS[r.service_type] || r.service_type,
            String(Number(r.charged_amount) || 0),
            PAYMENT_METHOD_LABELS[r.payment_method] || "Não definido",
            r.payment_term || "",
            r.payment_received_at ? format(parseISO(r.payment_received_at), "dd/MM/yyyy") : "",
            r.payment_received_at ? "Recebido" : "Pendente",
          ]);
          exportToCsv("recebimentos", headers, rows);
        }}>
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum atendimento concluído no período.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Protocolo</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Placa</TableHead>
                    <TableHead>Serviço</TableHead>
                    <TableHead className="text-right">Cobrado</TableHead>
                    <TableHead>Forma Pgto</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Dt Recebimento</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-medium whitespace-nowrap">{r.protocol}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{format(parseISO(r.created_at), "dd/MM/yy")}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{(r.clients as any)?.name || "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{r.requester_name}</TableCell>
                      <TableCell>
                        {r.vehicle_plate ? (
                          <Badge variant="outline" className="font-mono text-xs gap-1">
                            <Car className="h-3 w-3" />{r.vehicle_plate}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs whitespace-nowrap">
                          {SERVICE_TYPE_LABELS[r.service_type] || r.service_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-primary whitespace-nowrap">
                        {formatCurrency(Number(r.charged_amount) || 0)}
                      </TableCell>
                      <TableCell>
                        {r.payment_method ? (
                          <Badge variant={r.payment_method === "cash" ? "default" : "secondary"} className="text-xs">
                            {PAYMENT_METHOD_LABELS[r.payment_method]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{r.payment_term || "—"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.payment_received_at ? format(parseISO(r.payment_received_at), "dd/MM/yy") : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.payment_received_at ? "default" : "destructive"} className="text-xs">
                          {r.payment_received_at ? "Recebido" : "Pendente"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      Sem dados no período
    </div>
  );
}
