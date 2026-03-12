import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Clock, CheckCircle, AlertCircle, XCircle, ChevronLeft, ChevronRight, CalendarIcon, X, Download, ArrowUpDown, ArrowUp, ArrowDown, UserCheck, Radio } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast as sonnerToast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import * as XLSX from "xlsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: any }> = {
  open: { label: "Aberto", variant: "default", icon: AlertCircle },
  awaiting_dispatch: { label: "Aguardando Acionamento", variant: "outline", icon: Clock },
  dispatched: { label: "Acionado", variant: "secondary", icon: Clock },
  in_progress: { label: "Em Andamento", variant: "default", icon: Clock },
  completed: { label: "Finalizado", variant: "secondary", icon: CheckCircle },
  cancelled: { label: "Cancelado", variant: "destructive", icon: XCircle },
  refunded: { label: "Reembolso", variant: "destructive", icon: XCircle },
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

type SortField = "created_at" | "charged_amount" | "status";
type SortDirection = "asc" | "desc";

export default function ServiceRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const previousIdsRef = useRef<Set<string>>(new Set());
  const isFirstLoadRef = useRef(true);
  const navigate = useNavigate();

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "charged_amount" ? "desc" : field === "created_at" ? "desc" : "asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-50" />;
    return sortDirection === "asc"
      ? <ArrowUp className="h-3.5 w-3.5 ml-1" />
      : <ArrowDown className="h-3.5 w-3.5 ml-1" />;
  };

  const loadCounts = useCallback(async () => {
    const { data } = await supabase
      .from("service_requests")
      .select("status");
    if (data) {
      const counts = data.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});
      setStatusCounts(counts);
      setTotalCount(data.length);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("service_requests")
      .select("*", { count: "exact" })
      .order(sortField, { ascending: sortDirection === "asc" });

    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter as any);
    }

    if (serviceTypeFilter !== "all") {
      query = query.eq("service_type", serviceTypeFilter as any);
    }

    if (paymentFilter !== "all") {
      if (paymentFilter === "pending") {
        query = query.is("payment_method", null);
      } else {
        query = query.eq("payment_method", paymentFilter);
      }
    }

    if (dateFrom) {
      query = query.gte("created_at", dateFrom.toISOString());
    }
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte("created_at", endOfDay.toISOString());
    }

    if (search) {
      query = query.or(
        `protocol.ilike.%${search}%,requester_name.ilike.%${search}%,vehicle_plate.ilike.%${search}%`
      );
    }

    const from = page * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);

    const { data, count } = await query;
    setRequests(data || []);
    if (count !== null && count !== undefined) {
      // Use filtered count for pagination
      setTotalCount(count);
    }
    setLoading(false);
  }, [page, pageSize, statusFilter, serviceTypeFilter, paymentFilter, search, dateFrom, dateTo, sortField, sortDirection]);

  useEffect(() => {
    loadCounts();
    const channel = supabase
      .channel("requests-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests" }, (payload) => {
        if (payload.eventType === "INSERT" && !isFirstLoadRef.current) {
          sonnerToast("Novo atendimento chegou!", { icon: "🔔" });
        }
        loadRequests();
        loadCounts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, serviceTypeFilter, paymentFilter, search, dateFrom, dateTo, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const allTotal = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  const buildExportQuery = async () => {
    let query = supabase
      .from("service_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (statusFilter !== "all") query = query.eq("status", statusFilter as any);
    if (serviceTypeFilter !== "all") query = query.eq("service_type", serviceTypeFilter as any);
    if (paymentFilter !== "all") {
      if (paymentFilter === "pending") query = query.is("payment_method", null);
      else query = query.eq("payment_method", paymentFilter);
    }
    if (dateFrom) query = query.gte("created_at", dateFrom.toISOString());
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      query = query.lte("created_at", endOfDay.toISOString());
    }
    if (search) {
      query = query.or(`protocol.ilike.%${search}%,requester_name.ilike.%${search}%,vehicle_plate.ilike.%${search}%`);
    }
    const { data } = await query;
    return (data || []).map((r) => ({
      Protocolo: r.protocol,
      Status: statusMap[r.status]?.label || r.status,
      "Tipo Serviço": serviceTypeMap[r.service_type] || r.service_type,
      Solicitante: r.requester_name,
      Telefone: r.requester_phone,
      Placa: r.vehicle_plate || "",
      Veículo: r.vehicle_model || "",
      Origem: r.origin_address || "",
      Destino: r.destination_address || "",
      "Valor Cobrado": r.charged_amount ?? 0,
      "Custo Prestador": r.provider_cost ?? 0,
      "Forma Pagamento": r.payment_method === "cash" ? "À Vista" : r.payment_method === "invoiced" ? "Faturado" : "",
      "Prazo Pagamento": r.payment_term || "",
      "KM Estimado": r.estimated_km ?? "",
      "Criado em": new Date(r.created_at).toLocaleString("pt-BR"),
    }));
  };

  const exportCSV = async () => {
    const rows = await buildExportQuery();
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(";"),
      ...rows.map((r) => headers.map((h) => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(";")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atendimentos_${format(new Date(), "yyyyMMdd_HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = async () => {
    const rows = await buildExportQuery();
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Atendimentos");
    XLSX.writeFile(wb, `atendimentos_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="page-header">
          <h1>Atendimentos</h1>
          <p>Visualize e acompanhe todos os atendimentos</p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportCSV}>Exportar CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={exportExcel}>Exportar Excel</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => navigate("/operation/new")} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Atendimento
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por protocolo, nome ou placa..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo de serviço" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {Object.entries(serviceTypeMap).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={paymentFilter} onValueChange={setPaymentFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos pagamentos</SelectItem>
            <SelectItem value="cash">À Vista</SelectItem>
            <SelectItem value="invoiced">Faturado</SelectItem>
            <SelectItem value="pending">Sem definição</SelectItem>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Data início"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateFrom}
              onSelect={setDateFrom}
              initialFocus
              locale={ptBR}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateTo ? format(dateTo, "dd/MM/yyyy") : "Data fim"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={dateTo}
              onSelect={setDateTo}
              initialFocus
              locale={ptBR}
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        {(dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }} className="gap-1">
            <X className="h-4 w-4" />
            Limpar datas
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={statusFilter === "all" ? "default" : "outline"}
          onClick={() => setStatusFilter("all")}
        >
          Todos ({allTotal})
        </Button>
        {Object.entries(statusMap).map(([key, val]) => {
          const count = statusCounts[key] || 0;
          if (count === 0) return null;
          return (
            <Button
              key={key}
              size="sm"
              variant={statusFilter === key ? "default" : "outline"}
              onClick={() => setStatusFilter(key)}
            >
              {val.label} ({count})
            </Button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Ordenar por:</span>
        <Button variant={sortField === "created_at" ? "secondary" : "ghost"} size="sm" onClick={() => toggleSort("created_at")} className="gap-1 h-7 text-xs">
          Data <SortIcon field="created_at" />
        </Button>
        <Button variant={sortField === "charged_amount" ? "secondary" : "ghost"} size="sm" onClick={() => toggleSort("charged_amount")} className="gap-1 h-7 text-xs">
          Valor <SortIcon field="charged_amount" />
        </Button>
        <Button variant={sortField === "status" ? "secondary" : "ghost"} size="sm" onClick={() => toggleSort("status")} className="gap-1 h-7 text-xs">
          Status <SortIcon field="status" />
        </Button>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-muted-foreground">Carregando...</p>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Nenhum atendimento encontrado.
            </CardContent>
          </Card>
        ) : (
          requests.map((req) => {
            const st = statusMap[req.status] || statusMap.open;
            const StatusIcon = st.icon;
            return (
              <Card
                key={req.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => navigate(`/operation/requests/${req.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <StatusIcon className={`h-5 w-5 mt-0.5 ${req.status === "completed" ? "text-success" : req.status === "cancelled" ? "text-destructive" : "text-primary"}`} />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{req.vehicle_plate || "Sem placa"}</span>
                          {req.vehicle_model && <span className="text-muted-foreground text-sm">- {req.vehicle_model}</span>}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                          <span>{new Date(req.created_at).toLocaleDateString("pt-BR")} {new Date(req.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                          <span>{serviceTypeMap[req.service_type] || req.service_type}</span>
                          {req.charged_amount > 0 && <span>R$ {Number(req.charged_amount).toFixed(2)}</span>}
                          {req.payment_method && (
                            <Badge variant="outline" className="text-xs">
                              {req.payment_method === "cash" ? "À Vista" : "Faturado"}
                            </Badge>
                          )}
                          <span>{req.requester_name}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={st.variant}>{st.label}</Badge>
                      <span className="text-sm font-mono text-muted-foreground">{req.protocol}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {!loading && requests.length > 0 && (
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Exibindo</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>de {totalCount} registros</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
