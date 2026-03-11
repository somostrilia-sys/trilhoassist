import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClientData } from "@/hooks/useClientData";
import {
  Search, Download, MapPin, Route, DollarSign, FileText, Car,
  Filter, Clock, Truck, Users, AlertTriangle, BarChart3, Calendar,
} from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Aberto", variant: "outline" },
  awaiting_dispatch: { label: "Aguard. Acionamento", variant: "secondary" },
  dispatched: { label: "Acionado", variant: "secondary" },
  in_progress: { label: "Em Andamento", variant: "default" },
  completed: { label: "Concluído", variant: "default" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  refunded: { label: "Estornado", variant: "destructive" },
};

const SERVICE_LABELS: Record<string, string> = {
  tow_light: "Guincho Leve", tow_heavy: "Guincho Pesado", tow_motorcycle: "Guincho Moto",
  tow_utility: "Reboque Utilitário", locksmith: "Chaveiro", tire_change: "Troca de Pneu",
  battery: "Bateria", fuel: "Pane Seca", lodging: "Hospedagem", collision: "Colisão", other: "Outro",
};

const ATTENDANCE_TYPE_OPTIONS = [
  { value: "all", label: "Todos os Tipos" },
  { value: "particular", label: "Particular" },
  { value: "associado", label: "Associado (com plano)" },
];

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");
const fmtDateTime = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtTime = (d: string) => new Date(d).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export default function ClientReports() {
  const {
    serviceRequests, dispatchMap, cooperativas, providerNames,
    beneficiaries, activePlates, inactivePlates, totalBeneficiaries, isLoading,
  } = useClientData();

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="text-muted-foreground">Análise completa dos dados da sua associação</p>
      </div>

      <Tabs defaultValue="atendimentos" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="atendimentos" className="gap-1"><FileText className="h-3.5 w-3.5" /> Atendimentos</TabsTrigger>
          <TabsTrigger value="beneficiarios" className="gap-1"><Users className="h-3.5 w-3.5" /> Beneficiários</TabsTrigger>
          <TabsTrigger value="veiculos" className="gap-1"><Car className="h-3.5 w-3.5" /> Veículos</TabsTrigger>
          <TabsTrigger value="por-data" className="gap-1"><Calendar className="h-3.5 w-3.5" /> Por Data</TabsTrigger>
          <TabsTrigger value="por-status" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> Por Status</TabsTrigger>
          <TabsTrigger value="blacklist" className="gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Black List</TabsTrigger>
        </TabsList>

        {/* ===== ATENDIMENTOS TAB ===== */}
        <TabsContent value="atendimentos">
          <AtendimentosTab
            serviceRequests={serviceRequests}
            dispatchMap={dispatchMap}
            cooperativas={cooperativas}
            providerNames={providerNames}
          />
        </TabsContent>

        {/* ===== BENEFICIÁRIOS TAB ===== */}
        <TabsContent value="beneficiarios">
          <BeneficiariosTab
            beneficiaries={beneficiaries}
            activePlates={activePlates}
            inactivePlates={inactivePlates}
            totalBeneficiaries={totalBeneficiaries}
          />
        </TabsContent>

        {/* ===== VEÍCULOS TAB ===== */}
        <TabsContent value="veiculos">
          <VeiculosTab beneficiaries={beneficiaries} totalBeneficiaries={totalBeneficiaries} />
        </TabsContent>

        {/* ===== POR DATA TAB ===== */}
        <TabsContent value="por-data">
          <PorDataTab serviceRequests={serviceRequests} />
        </TabsContent>

        {/* ===== POR STATUS TAB ===== */}
        <TabsContent value="por-status">
          <PorStatusTab serviceRequests={serviceRequests} />
        </TabsContent>

        {/* ===== BLACK LIST TAB ===== */}
        <TabsContent value="blacklist">
          <BlackListTab serviceRequests={serviceRequests} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// ATENDIMENTOS TAB (existing logic preserved)
// ============================================================
function AtendimentosTab({ serviceRequests, dispatchMap, cooperativas, providerNames }: {
  serviceRequests: any[]; dispatchMap: Record<string, any>;
  cooperativas: string[]; providerNames: string[];
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [attendanceType, setAttendanceType] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return serviceRequests.filter((sr) => {
      if (statusFilter !== "all" && sr.status !== statusFilter) return false;
      if (serviceFilter !== "all" && sr.service_type !== serviceFilter) return false;
      if (attendanceType === "particular") { if (sr.beneficiary_id || sr.plan_id) return false; }
      else if (attendanceType === "associado") { if (!sr.beneficiary_id && !sr.plan_id) return false; }
      if (dateFrom && new Date(sr.created_at) < new Date(dateFrom)) return false;
      if (dateTo) { const to = new Date(dateTo); to.setHours(23, 59, 59, 999); if (new Date(sr.created_at) > to) return false; }
      if (providerFilter !== "all") {
        const d = dispatchMap[sr.id];
        if (((d?.providers as any)?.name || "") !== providerFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        return sr.protocol?.toLowerCase().includes(q) || sr.requester_name?.toLowerCase().includes(q) ||
          sr.vehicle_plate?.toLowerCase().includes(q) || sr.vehicle_model?.toLowerCase().includes(q) ||
          sr.origin_address?.toLowerCase().includes(q) || sr.destination_address?.toLowerCase().includes(q);
      }
      return true;
    });
  }, [serviceRequests, search, statusFilter, serviceFilter, dateFrom, dateTo, providerFilter, attendanceType, dispatchMap]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const totalCharged = filtered.reduce((s, r) => s + Number(r.charged_amount || 0), 0);
    const totalKm = filtered.reduce((s, r) => s + Number(r.estimated_km || 0), 0);
    const completed = filtered.filter((r) => r.status === "completed").length;
    return { total, totalCharged, totalKm, completed };
  }, [filtered]);

  const handleExportCSV = () => {
    const headers = ["Protocolo","Data","Hora","Solicitante","Telefone","Placa","Modelo","Serviço","Prestador","Status","Origem","Destino","KM","Valor Cobrado","Tempo Total","Obs"];
    const rows = filtered.map((sr) => {
      const dispatch = dispatchMap[sr.id];
      const pName = (dispatch?.providers as any)?.name || "Não atribuído";
      let tt = "";
      if (sr.completed_at) { const m = (new Date(sr.completed_at).getTime() - new Date(sr.created_at).getTime()) / 60000; tt = m < 60 ? `${Math.round(m)} min` : `${Math.floor(m/60)}h ${Math.round(m%60)}min`; }
      return [sr.protocol, fmtDate(sr.created_at), fmtTime(sr.created_at), sr.requester_name, sr.requester_phone, sr.vehicle_plate||"", sr.vehicle_model||"", SERVICE_LABELS[sr.service_type]||sr.service_type, pName, STATUS_LABELS[sr.status]?.label||sr.status, sr.origin_address||"", sr.destination_address||"", sr.estimated_km||"", Number(sr.charged_amount||0).toFixed(2).replace(".",","), tt, sr.notes||""];
    });
    const csv = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${c}"`).join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `relatorio-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={handleExportCSV} variant="outline" size="sm" className="gap-2">
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3"><Filter className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">Filtros</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Placa, protocolo, nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger><SelectValue placeholder="Tipo de Serviço" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Serviços</SelectItem>
                {Object.entries(SERVICE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={attendanceType} onValueChange={setAttendanceType}>
              <SelectTrigger><SelectValue placeholder="Tipo de Atendimento" /></SelectTrigger>
              <SelectContent>
                {ATTENDANCE_TYPE_OPTIONS.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            {providerNames.length > 0 && (
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger><SelectValue placeholder="Prestador" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Prestadores</SelectItem>
                  {providerNames.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">Atendimentos</span><FileText className="h-4 w-4 text-primary" /></div><p className="text-xl font-bold">{summary.total}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">Concluídos</span><Car className="h-4 w-4 text-primary" /></div><p className="text-xl font-bold">{summary.completed}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">Total Cobrado</span><DollarSign className="h-4 w-4 text-primary" /></div><p className="text-xl font-bold">{fmt(summary.totalCharged)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><div className="flex items-center justify-between mb-1"><span className="text-xs text-muted-foreground">KM Total</span><Route className="h-4 w-4 text-primary" /></div><p className="text-xl font-bold">{summary.totalKm.toFixed(0)} km</p></CardContent></Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Protocolo</th>
                  <th className="text-left p-3 font-medium">Data</th>
                  <th className="text-left p-3 font-medium">Solicitante</th>
                  <th className="text-left p-3 font-medium">Placa</th>
                  <th className="text-left p-3 font-medium">Serviço</th>
                  <th className="text-left p-3 font-medium">Prestador</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Valor</th>
                  <th className="text-left p-3 font-medium">KM</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhum atendimento encontrado.</td></tr>
                ) : filtered.map((sr) => {
                  const statusInfo = STATUS_LABELS[sr.status] || { label: sr.status, variant: "outline" as const };
                  const dispatch = dispatchMap[sr.id];
                  const providerName = (dispatch?.providers as any)?.name || "Não atribuído";
                  const isExpanded = expandedId === sr.id;
                  return (
                    <React.Fragment key={sr.id}>
                      <tr className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : sr.id)}>
                        <td className="p-3 font-mono text-xs">{sr.protocol}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{fmtDate(sr.created_at)}</td>
                        <td className="p-3">{sr.requester_name}</td>
                        <td className="p-3">{sr.vehicle_plate ? <span className="font-mono font-medium">{sr.vehicle_plate}</span> : <span className="text-muted-foreground">—</span>}</td>
                        <td className="p-3">{SERVICE_LABELS[sr.service_type] || sr.service_type}</td>
                        <td className="p-3"><span className="flex items-center gap-1 text-xs"><Truck className="h-3 w-3 text-muted-foreground" />{providerName}</span></td>
                        <td className="p-3"><Badge variant={statusInfo.variant}>{statusInfo.label}</Badge></td>
                        <td className="p-3 font-medium">{fmt(Number(sr.charged_amount || 0))}</td>
                        <td className="p-3">{sr.estimated_km ? `${Number(sr.estimated_km).toFixed(0)} km` : "—"}</td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-muted/20">
                          <td colSpan={9} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                              <div><p className="text-xs text-muted-foreground mb-1 font-medium">Solicitante</p><p>{sr.requester_name}</p><p className="text-muted-foreground">{sr.requester_phone}</p></div>
                              <div><p className="text-xs text-muted-foreground mb-1 font-medium">Veículo</p><p>{sr.vehicle_plate && <span className="font-mono font-medium">{sr.vehicle_plate}</span>}{sr.vehicle_model && <span className="ml-1">— {sr.vehicle_model}</span>}</p></div>
                              <div><p className="text-xs text-muted-foreground mb-1 font-medium">Financeiro</p><p>Cobrado: <span className="font-medium">{fmt(Number(sr.charged_amount || 0))}</span></p></div>
                              <div><p className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1"><MapPin className="h-3 w-3 text-primary" /> Origem</p><p>{sr.origin_address || "—"}</p></div>
                              <div><p className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1"><MapPin className="h-3 w-3 text-destructive" /> Destino</p><p>{sr.destination_address || "—"}</p></div>
                              <div><p className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1"><Truck className="h-3 w-3" /> Prestador</p><p className="font-medium">{providerName}</p></div>
                              <div className="md:col-span-2 lg:col-span-3 border-t pt-3 mt-1">
                                <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1"><Clock className="h-3 w-3" /> Cronologia</p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                  <div className="bg-muted/50 rounded-md p-2"><p className="text-xs text-muted-foreground">Acionamento</p><p className="text-sm font-medium">{fmtDateTime(sr.created_at)}</p></div>
                                  <div className="bg-muted/50 rounded-md p-2"><p className="text-xs text-muted-foreground">Atribuição</p><p className="text-sm font-medium">{dispatch?.accepted_at ? fmtDateTime(dispatch.accepted_at) : "—"}</p></div>
                                  <div className="bg-muted/50 rounded-md p-2"><p className="text-xs text-muted-foreground">Chegada</p><p className="text-sm font-medium">{dispatch?.provider_arrived_at ? fmtDateTime(dispatch.provider_arrived_at) : "—"}</p></div>
                                  <div className="bg-muted/50 rounded-md p-2"><p className="text-xs text-muted-foreground">Finalização</p><p className="text-sm font-medium">{sr.completed_at ? fmtDateTime(sr.completed_at) : "—"}</p></div>
                                </div>
                                {sr.completed_at && <p className="text-xs text-muted-foreground mt-2">Duração: {(() => { const m = (new Date(sr.completed_at).getTime()-new Date(sr.created_at).getTime())/60000; return m < 60 ? `${Math.round(m)} min` : `${Math.floor(m/60)}h ${Math.round(m%60)}min`; })()}</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {filtered.length > 0 && (
                <tfoot><tr className="border-t-2 bg-muted/30 font-medium"><td className="p-3" colSpan={7}>TOTAIS ({filtered.length} atendimentos)</td><td className="p-3">{fmt(summary.totalCharged)}</td><td className="p-3">{summary.totalKm.toFixed(0)} km</td></tr></tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// BENEFICIÁRIOS TAB
// ============================================================
function BeneficiariosTab({ beneficiaries, activePlates, inactivePlates, totalBeneficiaries }: {
  beneficiaries: any[]; activePlates: number; inactivePlates: number; totalBeneficiaries: number;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return beneficiaries;
    const q = search.toLowerCase();
    return beneficiaries.filter((b) =>
      b.name?.toLowerCase().includes(q) || b.cpf?.toLowerCase().includes(q) ||
      b.vehicle_plate?.toLowerCase().includes(q) || b.phone?.includes(q)
    );
  }, [beneficiaries, search]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{totalBeneficiaries}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Ativos</p><p className="text-2xl font-bold text-primary">{activePlates}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Inativos</p><p className="text-2xl font-bold text-destructive">{inactivePlates}</p></CardContent></Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome, CPF, placa..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Nome</th>
                <th className="text-left p-3 font-medium">CPF</th>
                <th className="text-left p-3 font-medium">Placa</th>
                <th className="text-left p-3 font-medium">Modelo</th>
                <th className="text-left p-3 font-medium">Telefone</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum beneficiário encontrado.</td></tr>
                ) : filtered.slice(0, 200).map((b) => (
                  <tr key={b.id} className="border-b hover:bg-muted/30">
                    <td className="p-3">{b.name}</td>
                    <td className="p-3 font-mono text-xs">{b.cpf || "—"}</td>
                    <td className="p-3 font-mono font-medium">{b.vehicle_plate || "—"}</td>
                    <td className="p-3">{b.vehicle_model || "—"}</td>
                    <td className="p-3 text-muted-foreground">{b.phone || "—"}</td>
                    <td className="p-3"><Badge variant={b.active ? "default" : "destructive"}>{b.active ? "Ativo" : "Inativo"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 200 && <p className="p-3 text-xs text-muted-foreground text-center">Mostrando 200 de {filtered.length}. Use a busca para filtrar.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// VEÍCULOS TAB
// ============================================================
function VeiculosTab({ beneficiaries, totalBeneficiaries }: { beneficiaries: any[]; totalBeneficiaries: number }) {
  const [search, setSearch] = useState("");

  const vehicles = useMemo(() => {
    return beneficiaries.filter((b) => b.vehicle_plate);
  }, [beneficiaries]);

  const filtered = useMemo(() => {
    if (!search) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter((b) =>
      b.vehicle_plate?.toLowerCase().includes(q) || b.vehicle_model?.toLowerCase().includes(q) || b.name?.toLowerCase().includes(q)
    );
  }, [vehicles, search]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Placas Cadastradas</p><p className="text-2xl font-bold">{totalBeneficiaries}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Com Placa Preenchida</p><p className="text-2xl font-bold text-primary">{vehicles.length}</p></CardContent></Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por placa, modelo..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Placa</th>
                <th className="text-left p-3 font-medium">Modelo</th>
                <th className="text-left p-3 font-medium">Ano</th>
                <th className="text-left p-3 font-medium">Cor</th>
                <th className="text-left p-3 font-medium">Proprietário</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Nenhum veículo encontrado.</td></tr>
                ) : filtered.slice(0, 200).map((b) => (
                  <tr key={b.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono font-bold">{b.vehicle_plate}</td>
                    <td className="p-3">{b.vehicle_model || "—"}</td>
                    <td className="p-3">{b.vehicle_year || "—"}</td>
                    <td className="p-3">{b.vehicle_color || "—"}</td>
                    <td className="p-3">{b.name}</td>
                    <td className="p-3"><Badge variant={b.active ? "default" : "destructive"}>{b.active ? "Ativo" : "Inativo"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 200 && <p className="p-3 text-xs text-muted-foreground text-center">Mostrando 200 de {filtered.length}.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// POR DATA TAB
// ============================================================
function PorDataTab({ serviceRequests }: { serviceRequests: any[] }) {
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("month");

  const data = useMemo(() => {
    const map: Record<string, { key: string; label: string; total: number; completed: number; cancelled: number }> = {};

    serviceRequests.forEach((sr) => {
      const dt = new Date(sr.created_at);
      let key: string, label: string;

      if (groupBy === "day") {
        key = dt.toISOString().slice(0, 10);
        label = dt.toLocaleDateString("pt-BR");
      } else if (groupBy === "week") {
        const d = new Date(dt); d.setDate(d.getDate() - d.getDay());
        key = d.toISOString().slice(0, 10);
        label = `Sem. ${d.toLocaleDateString("pt-BR")}`;
      } else {
        key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        const names = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
        label = `${names[dt.getMonth()]} ${dt.getFullYear()}`;
      }

      if (!map[key]) map[key] = { key, label, total: 0, completed: 0, cancelled: 0 };
      map[key].total += 1;
      if (sr.status === "completed") map[key].completed += 1;
      if (sr.status === "cancelled") map[key].cancelled += 1;
    });

    return Object.values(map).sort((a, b) => b.key.localeCompare(a.key));
  }, [serviceRequests, groupBy]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Agrupar por:</span>
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Dia</SelectItem>
            <SelectItem value="week">Semana</SelectItem>
            <SelectItem value="month">Mês</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/50">
                <th className="text-left p-3 font-medium">Período</th>
                <th className="text-center p-3 font-medium">Total</th>
                <th className="text-center p-3 font-medium">Concluídos</th>
                <th className="text-center p-3 font-medium">Cancelados</th>
                <th className="p-3 font-medium">Distribuição</th>
              </tr></thead>
              <tbody>
                {data.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Sem dados.</td></tr>
                ) : data.map((d) => {
                  const maxTotal = Math.max(...data.map((x) => x.total), 1);
                  const pct = (d.total / maxTotal) * 100;
                  return (
                    <tr key={d.key} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-medium">{d.label}</td>
                      <td className="p-3 text-center font-bold">{d.total}</td>
                      <td className="p-3 text-center text-primary">{d.completed}</td>
                      <td className="p-3 text-center text-destructive">{d.cancelled}</td>
                      <td className="p-3"><div className="h-3 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// POR STATUS TAB
// ============================================================
function PorStatusTab({ serviceRequests }: { serviceRequests: any[] }) {
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    serviceRequests.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count, label: STATUS_LABELS[status]?.label || status, variant: STATUS_LABELS[status]?.variant || "outline" as const }))
      .sort((a, b) => b.count - a.count);
  }, [serviceRequests]);

  const total = serviceRequests.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {statusData.map((s) => {
          const pct = total > 0 ? ((s.count / total) * 100).toFixed(1) : "0";
          return (
            <Card key={s.status}>
              <CardContent className="p-4">
                <Badge variant={s.variant as any} className="mb-2">{s.label}</Badge>
                <p className="text-3xl font-bold">{s.count}</p>
                <p className="text-xs text-muted-foreground">{pct}% do total</p>
                <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Service type breakdown */}
      <Card>
        <CardHeader><CardTitle className="text-base">Atendimentos por Tipo de Serviço</CardTitle></CardHeader>
        <CardContent>
          {(() => {
            const typeCounts: Record<string, number> = {};
            serviceRequests.forEach((r) => { typeCounts[r.service_type] = (typeCounts[r.service_type] || 0) + 1; });
            const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
            return (
              <div className="space-y-3">
                {sorted.map(([type, count]) => {
                  const pct = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex justify-between text-sm"><span>{SERVICE_LABELS[type] || type}</span><span className="font-medium">{count} ({pct.toFixed(0)}%)</span></div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// BLACK LIST TAB
// ============================================================
function BlackListTab({ serviceRequests }: { serviceRequests: any[] }) {
  const [expandedPlate, setExpandedPlate] = useState<string | null>(null);

  const ranking = useMemo(() => {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

    const map = new Map<string, {
      plate: string; name: string; model: string; count: number; totalKm: number;
      lastDate: string; requests: any[];
    }>();

    serviceRequests.forEach((r) => {
      if (!r.vehicle_plate) return;
      if (new Date(r.created_at) < twelveMonthsAgo) return;
      if (["cancelled", "refunded"].includes(r.status)) return;

      const plate = r.vehicle_plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const entry = map.get(plate) || {
        plate: r.vehicle_plate, name: r.requester_name || "—", model: r.vehicle_model || "—",
        count: 0, totalKm: 0, lastDate: r.created_at, requests: [],
      };
      entry.count += 1;
      entry.totalKm += Number(r.estimated_km || 0);
      entry.requests.push(r);
      if (r.created_at > entry.lastDate) entry.lastDate = r.created_at;
      map.set(plate, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 50);
  }, [serviceRequests]);

  const expandedRequests = useMemo(() => {
    if (!expandedPlate) return [];
    const entry = ranking.find((v) => v.plate === expandedPlate);
    if (!entry) return [];
    return [...entry.requests].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [expandedPlate, ranking]);

  if (ranking.length === 0) {
    return <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum dado nos últimos 12 meses.</CardContent></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Black List — Veículos com Mais Acionamentos (12 meses)
          </CardTitle>
          <CardDescription>
            Ranking de placas/solicitantes com mais acionamentos. Clique para ver o histórico.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium w-10">#</th>
                  <th className="text-left p-3 font-medium">Solicitante</th>
                  <th className="text-left p-3 font-medium">Placa</th>
                  <th className="text-left p-3 font-medium">Modelo</th>
                  <th className="text-center p-3 font-medium">Acionamentos</th>
                  <th className="text-left p-3 font-medium">KM Total</th>
                  <th className="text-left p-3 font-medium">Último Uso</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((v, idx) => (
                  <React.Fragment key={v.plate}>
                    <tr
                      className={`border-b cursor-pointer hover:bg-muted/30 transition-colors ${
                        idx < 5
                          ? "bg-destructive/10 border-l-4 border-l-destructive"
                          : expandedPlate === v.plate ? "bg-muted/40" : ""
                      }`}
                      onClick={() => setExpandedPlate(expandedPlate === v.plate ? null : v.plate)}
                    >
                      <td className="p-3 font-bold text-muted-foreground">{idx + 1}</td>
                      <td className="p-3 font-medium">{v.name}</td>
                      <td className="p-3 font-mono font-bold">{v.plate}</td>
                      <td className="p-3">{v.model}</td>
                      <td className="p-3 text-center">
                        <Badge variant={v.count >= 4 ? "destructive" : v.count >= 2 ? "secondary" : "outline"}>
                          {v.count}
                        </Badge>
                      </td>
                      <td className="p-3">{v.totalKm.toFixed(0)} km</td>
                      <td className="p-3 text-muted-foreground">{new Date(v.lastDate).toLocaleDateString("pt-BR")}</td>
                    </tr>
                    {expandedPlate === v.plate && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="bg-muted/20 p-4 border-t">
                            <p className="text-sm font-medium mb-3">Histórico — {v.plate}</p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead><tr className="border-b">
                                  <th className="text-left p-2 font-medium">Data</th>
                                  <th className="text-left p-2 font-medium">Serviço</th>
                                  <th className="text-left p-2 font-medium">KM</th>
                                  <th className="text-left p-2 font-medium">Origem</th>
                                  <th className="text-left p-2 font-medium">Destino</th>
                                  <th className="text-left p-2 font-medium">Status</th>
                                </tr></thead>
                                <tbody>
                                  {expandedRequests.map((r) => (
                                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                                      <td className="p-2 whitespace-nowrap">{fmtDateTime(r.created_at)}</td>
                                      <td className="p-2">{SERVICE_LABELS[r.service_type] || r.service_type}</td>
                                      <td className="p-2">{r.estimated_km ? `${Number(r.estimated_km).toFixed(0)} km` : "—"}</td>
                                      <td className="p-2 max-w-[200px] truncate">{r.origin_address || "—"}</td>
                                      <td className="p-2 max-w-[200px] truncate">{r.destination_address || "—"}</td>
                                      <td className="p-2"><Badge variant={STATUS_LABELS[r.status]?.variant || "outline"} className="text-[10px]">{STATUS_LABELS[r.status]?.label || r.status}</Badge></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
