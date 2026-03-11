import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClientData } from "@/hooks/useClientData";
import {
  Search, Download, MapPin, Route, DollarSign, FileText, Car,
  ArrowRight, Calendar, Filter, Clock, Truck, Users,
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
  tow_light: "Guincho Leve",
  tow_heavy: "Guincho Pesado",
  tow_motorcycle: "Guincho Moto",
  tow_utility: "Reboque Utilitário",
  locksmith: "Chaveiro",
  tire_change: "Troca de Pneu",
  battery: "Bateria",
  fuel: "Pane Seca",
  lodging: "Hospedagem",
  collision: "Colisão",
  other: "Outro",
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
  const { serviceRequests, dispatchMap, cooperativas, providerNames, representatives, isLoading } = useClientData();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cooperativaFilter, setCooperativaFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [attendanceType, setAttendanceType] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return serviceRequests.filter((sr) => {
      if (statusFilter !== "all" && sr.status !== statusFilter) return false;
      if (serviceFilter !== "all" && sr.service_type !== serviceFilter) return false;

      // Attendance type filter: particular = no beneficiary/plan, associado = has beneficiary or plan
      if (attendanceType === "particular") {
        if (sr.beneficiary_id || sr.plan_id) return false;
      } else if (attendanceType === "associado") {
        if (!sr.beneficiary_id && !sr.plan_id) return false;
      }

      if (dateFrom) {
        const from = new Date(dateFrom);
        if (new Date(sr.created_at) < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(sr.created_at) > to) return false;
      }

      // Provider filter
      if (providerFilter !== "all") {
        const dispatch = dispatchMap[sr.id];
        const pName = (dispatch?.providers as any)?.name || "";
        if (pName !== providerFilter) return false;
      }

      if (search) {
        const q = search.toLowerCase();
        return (
          sr.protocol?.toLowerCase().includes(q) ||
          sr.requester_name?.toLowerCase().includes(q) ||
          sr.vehicle_plate?.toLowerCase().includes(q) ||
          sr.vehicle_model?.toLowerCase().includes(q) ||
          sr.origin_address?.toLowerCase().includes(q) ||
          sr.destination_address?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [serviceRequests, search, statusFilter, serviceFilter, dateFrom, dateTo, cooperativaFilter, providerFilter, attendanceType, dispatchMap]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const totalCharged = filtered.reduce((s, r) => s + Number(r.charged_amount || 0), 0);
    const totalKm = filtered.reduce((s, r) => s + Number(r.estimated_km || 0), 0);
    const completed = filtered.filter((r) => r.status === "completed").length;
    return { total, totalCharged, totalKm, completed };
  }, [filtered]);

  const handleExportCSV = () => {
    const headers = [
      "Protocolo", "Data", "Hora Acionamento", "Solicitante", "Associado", "Telefone",
      "Veículo (Placa)", "Veículo (Modelo)", "Tipo de Serviço", "Prestador",
      "Status", "Origem", "Destino", "KM Estimado",
      "Valor Cobrado", "Hora Atribuição", "Hora Início Atendimento", "Hora Finalização",
      "Tempo Total", "Observações",
    ];
    const rows = filtered.map((sr) => {
      const dispatch = dispatchMap[sr.id];
      const providerName = (dispatch?.providers as any)?.name || "Não atribuído";

      // Calculate total time
      let tempoTotal = "";
      if (sr.completed_at) {
        const mins = (new Date(sr.completed_at).getTime() - new Date(sr.created_at).getTime()) / 60000;
        if (mins < 60) {
          tempoTotal = `${Math.round(mins)} min`;
        } else {
          const h = Math.floor(mins / 60);
          const m = Math.round(mins % 60);
          tempoTotal = `${h}h ${m}min`;
        }
      }

      return [
        sr.protocol,
        fmtDate(sr.created_at),
        fmtTime(sr.created_at),
        sr.requester_name,
        sr.driver_name || sr.requester_name,
        sr.requester_phone,
        sr.vehicle_plate || "",
        sr.vehicle_model || "",
        SERVICE_LABELS[sr.service_type] || sr.service_type,
        providerName,
        STATUS_LABELS[sr.status]?.label || sr.status,
        sr.origin_address || "",
        sr.destination_address || "",
        sr.estimated_km || "",
        Number(sr.charged_amount || 0).toFixed(2).replace(".", ","),
        dispatch?.accepted_at ? fmtDateTime(dispatch.accepted_at) : "",
        dispatch?.provider_arrived_at ? fmtDateTime(dispatch.provider_arrived_at) : "",
        sr.completed_at ? fmtDateTime(sr.completed_at) : "",
        tempoTotal,
        sr.notes || "",
      ];
    });

    const csvContent = [headers.join(";"), ...rows.map((r) => r.map((c) => `"${c}"`).join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-atendimentos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Relatórios de Atendimentos</h1>
          <p className="text-muted-foreground">Consulte detalhes completos dos atendimentos da sua base</p>
        </div>
        <Button onClick={handleExportCSV} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Placa, protocolo, nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de Serviço" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Serviços</SelectItem>
                {Object.entries(SERVICE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={attendanceType} onValueChange={setAttendanceType}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de Atendimento" />
              </SelectTrigger>
              <SelectContent>
                {ATTENDANCE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="Data Início"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="Data Fim"
            />
            {providerNames.length > 0 && (
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Prestador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Prestadores</SelectItem>
                  {providerNames.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {cooperativas.length > 0 && (
              <Select value={cooperativaFilter} onValueChange={setCooperativaFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Cooperativa/Filial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Cooperativas</SelectItem>
                  {cooperativas.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Atendimentos</span>
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <p className="text-xl font-bold">{summary.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Concluídos</span>
              <Car className="h-4 w-4 text-success" />
            </div>
            <p className="text-xl font-bold text-success">{summary.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Total Cobrado</span>
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <p className="text-xl font-bold">{fmt(summary.totalCharged)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">KM Total</span>
              <Route className="h-4 w-4 text-info" />
            </div>
            <p className="text-xl font-bold">{summary.totalKm.toFixed(0)} km</p>
          </CardContent>
        </Card>
      </div>

      {/* Results Table */}
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
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-muted-foreground">
                      Nenhum atendimento encontrado com os filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((sr) => {
                    const statusInfo = STATUS_LABELS[sr.status] || { label: sr.status, variant: "outline" as const };
                    const dispatch = dispatchMap[sr.id];
                    const providerName = (dispatch?.providers as any)?.name || "Não atribuído";
                    const isExpanded = expandedId === sr.id;
                    return (
                      <>
                        <tr
                          key={sr.id}
                          className="border-b hover:bg-muted/30 cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : sr.id)}
                        >
                          <td className="p-3 font-mono text-xs">{sr.protocol}</td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            {fmtDate(sr.created_at)}
                          </td>
                          <td className="p-3">{sr.requester_name}</td>
                          <td className="p-3">
                            {sr.vehicle_plate ? (
                              <span className="font-mono font-medium">{sr.vehicle_plate}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-3">{SERVICE_LABELS[sr.service_type] || sr.service_type}</td>
                          <td className="p-3">
                            <span className="flex items-center gap-1 text-xs">
                              <Truck className="h-3 w-3 text-muted-foreground" />
                              {providerName}
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                          </td>
                          <td className="p-3 font-medium">{fmt(Number(sr.charged_amount || 0))}</td>
                          <td className="p-3">
                            {sr.estimated_km ? `${Number(sr.estimated_km).toFixed(0)} km` : "—"}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${sr.id}-detail`} className="bg-muted/20">
                            <td colSpan={9} className="p-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1 font-medium">Solicitante</p>
                                  <p>{sr.requester_name}</p>
                                  <p className="text-muted-foreground">{sr.requester_phone}</p>
                                  {sr.requester_email && (
                                    <p className="text-muted-foreground">{sr.requester_email}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1 font-medium">Veículo</p>
                                  <p>
                                    {sr.vehicle_plate && <span className="font-mono font-medium">{sr.vehicle_plate}</span>}
                                    {sr.vehicle_model && <span className="ml-1">— {sr.vehicle_model}</span>}
                                    {sr.vehicle_year && <span className="text-muted-foreground ml-1">({sr.vehicle_year})</span>}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1 font-medium">Financeiro</p>
                                  <p>Valor Cobrado: <span className="font-medium">{fmt(Number(sr.charged_amount || 0))}</span></p>
                                  {sr.payment_method && (
                                    <p className="text-muted-foreground">Pagamento: {sr.payment_method}</p>
                                  )}
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-success" /> Origem
                                  </p>
                                  <p>{sr.origin_address || "Não informado"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1">
                                    <MapPin className="h-3 w-3 text-destructive" /> Destino
                                  </p>
                                  <p>{sr.destination_address || "Não informado"}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1">
                                    <Truck className="h-3 w-3" /> Prestador
                                  </p>
                                  <p className="font-medium">{providerName}</p>
                                </div>

                                {/* Detailed Timestamps */}
                                <div className="md:col-span-2 lg:col-span-3 border-t pt-3 mt-1">
                                  <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> Cronologia do Atendimento
                                  </p>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="bg-muted/50 rounded-md p-2">
                                      <p className="text-xs text-muted-foreground">Acionamento</p>
                                      <p className="text-sm font-medium">{fmtDateTime(sr.created_at)}</p>
                                    </div>
                                    <div className="bg-muted/50 rounded-md p-2">
                                      <p className="text-xs text-muted-foreground">Atribuição</p>
                                      <p className="text-sm font-medium">
                                        {dispatch?.accepted_at ? fmtDateTime(dispatch.accepted_at) : "—"}
                                      </p>
                                    </div>
                                    <div className="bg-muted/50 rounded-md p-2">
                                      <p className="text-xs text-muted-foreground">Chegada Prestador</p>
                                      <p className="text-sm font-medium">
                                        {dispatch?.provider_arrived_at ? fmtDateTime(dispatch.provider_arrived_at) : "—"}
                                      </p>
                                    </div>
                                    <div className="bg-muted/50 rounded-md p-2">
                                      <p className="text-xs text-muted-foreground">Finalização</p>
                                      <p className="text-sm font-medium">
                                        {sr.completed_at ? fmtDateTime(sr.completed_at) : "—"}
                                      </p>
                                    </div>
                                  </div>
                                  {sr.completed_at && (
                                    <p className="text-xs text-muted-foreground mt-2">
                                      Duração total: {(() => {
                                        const mins = (new Date(sr.completed_at).getTime() - new Date(sr.created_at).getTime()) / 60000;
                                        if (mins < 60) return `${Math.round(mins)} min`;
                                        const h = Math.floor(mins / 60);
                                        const m = Math.round(mins % 60);
                                        return `${h}h ${m}min`;
                                      })()}
                                    </p>
                                  )}
                                </div>
                                {sr.notes && (
                                  <div className="md:col-span-2 lg:col-span-3">
                                    <p className="text-xs text-muted-foreground mb-1 font-medium">Observações</p>
                                    <p className="text-muted-foreground">{sr.notes}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-medium">
                    <td className="p-3" colSpan={7}>TOTAIS ({filtered.length} atendimentos)</td>
                    <td className="p-3">{fmt(summary.totalCharged)}</td>
                    <td className="p-3">{summary.totalKm.toFixed(0)} km</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
