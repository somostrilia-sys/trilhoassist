import { useState, useMemo } from "react";
import { format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Calculator, Download, FileText, X, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  tow_light: "Guincho Leve",
  tow_heavy: "Guincho Pesado",
  locksmith: "Chaveiro",
  electrician: "Eletricista",
  mechanic: "Mecânico",
  fuel: "Combustível",
  tire_change: "Troca de Pneu",
  collision: "Colisão",
  glass: "Vidraceiro",
};

const PROVIDER_TYPE_MAP: Record<string, string> = {
  tow_light: "Guincho",
  tow_heavy: "Guincho",
  locksmith: "Chaveiro",
  electrician: "Eletricista",
  mechanic: "Mecânico",
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Em aberto", variant: "outline" },
  approved: { label: "Aprovado", variant: "secondary" },
  paid: { label: "Pago", variant: "default" },
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

interface DispatchWithDetails {
  id: string;
  final_amount: number | null;
  quoted_amount: number | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  provider_id: string | null;
  providers: { id: string; name: string; city: string | null; services: string[] | null; phone: string } | null;
  service_requests: {
    id: string;
    protocol: string;
    service_type: string;
    origin_address: string | null;
    provider_cost: number | null;
    created_at: string;
    requester_name: string;
    vehicle_plate: string | null;
    vehicle_model: string | null;
    beneficiary_id: string | null;
    beneficiaries: { name: string; vehicle_plate: string | null; vehicle_model: string | null } | null;
  } | null;
}

interface ProviderGroup {
  id: string;
  name: string;
  city: string | null;
  phone: string;
  services: string[] | null;
  totalAtendimentos: number;
  totalValor: number;
  dispatches: DispatchWithDetails[];
  financialStatus: string;
}

export default function FechamentoPrestadores() {
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [appliedFrom, setAppliedFrom] = useState<Date>(startOfMonth(new Date()));
  const [appliedTo, setAppliedTo] = useState<Date>(new Date());
  const [selectedProvider, setSelectedProvider] = useState<ProviderGroup | null>(null);

  const { data: dispatches, isLoading } = useQuery({
    queryKey: ["fechamento-prestadores", appliedFrom.toISOString(), appliedTo.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatches")
        .select(`
          id, final_amount, quoted_amount, status, completed_at, created_at, provider_id,
          providers(id, name, city, services, phone),
          service_requests(id, protocol, service_type, origin_address, provider_cost, created_at, requester_name, vehicle_plate, vehicle_model, beneficiary_id,
            beneficiaries(name, vehicle_plate, vehicle_model)
          )
        `)
        .gte("created_at", appliedFrom.toISOString())
        .lte("created_at", appliedTo.toISOString())
        .not("provider_id", "is", null)
        .in("status", ["completed", "accepted", "provider_arrived", "en_route"]);

      if (error) throw error;
      return (data || []) as unknown as DispatchWithDetails[];
    },
  });

  const providerGroups = useMemo(() => {
    if (!dispatches) return [];
    const map = new Map<string, ProviderGroup>();

    for (const d of dispatches) {
      if (!d.provider_id || !d.providers) continue;
      const pid = d.provider_id;
      if (!map.has(pid)) {
        map.set(pid, {
          id: pid,
          name: d.providers.name,
          city: d.providers.city,
          phone: d.providers.phone,
          services: d.providers.services,
          totalAtendimentos: 0,
          totalValor: 0,
          dispatches: [],
          financialStatus: "pending",
        });
      }
      const g = map.get(pid)!;
      const valor = d.final_amount ?? d.quoted_amount ?? d.service_requests?.provider_cost ?? 0;
      g.totalAtendimentos++;
      g.totalValor += Number(valor);
      g.dispatches.push(d);
    }

    return Array.from(map.values()).sort((a, b) => b.totalValor - a.totalValor);
  }, [dispatches]);

  const summary = useMemo(() => {
    const byType: Record<string, number> = {};
    let total = 0;
    let count = 0;
    for (const g of providerGroups) {
      total += g.totalValor;
      count += g.totalAtendimentos;
      for (const d of g.dispatches) {
        const st = d.service_requests?.service_type || "other";
        const cat = PROVIDER_TYPE_MAP[st] || "Outros";
        byType[cat] = (byType[cat] || 0) + Number(d.final_amount ?? d.quoted_amount ?? d.service_requests?.provider_cost ?? 0);
      }
    }
    return { total, count, byType };
  }, [providerGroups]);

  const handleFilter = () => {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  };

  const getDispatchValue = (d: DispatchWithDetails) =>
    Number(d.final_amount ?? d.quoted_amount ?? d.service_requests?.provider_cost ?? 0);

  const exportExcel = (provider: ProviderGroup) => {
    const rows = provider.dispatches.map((d) => ({
      Data: format(new Date(d.service_requests?.created_at || d.created_at), "dd/MM/yyyy"),
      "Nº Solicitação": d.service_requests?.protocol || "-",
      Beneficiário: d.service_requests?.beneficiaries?.name || d.service_requests?.requester_name || "-",
      Placa: d.service_requests?.beneficiaries?.vehicle_plate || d.service_requests?.vehicle_plate || "-",
      Modelo: d.service_requests?.beneficiaries?.vehicle_model || d.service_requests?.vehicle_model || "-",
      "Tipo Serviço": SERVICE_TYPE_LABELS[d.service_requests?.service_type || ""] || d.service_requests?.service_type || "-",
      Cidade: d.providers?.city || "-",
      "Valor (R$)": getDispatchValue(d),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fechamento");
    XLSX.writeFile(wb, `fechamento_${provider.name.replace(/\s/g, "_")}.xlsx`);
    toast({ title: "Excel exportado com sucesso!" });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Calculator className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Fechamento Prestadores</h1>
      </div>

      {/* Filtro de período */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data Inicial</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Data Final</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Selecionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={handleFilter}>Filtrar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Atendimentos</p>
            <p className="text-2xl font-bold text-foreground">{summary.count}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Valor Total a Pagar</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(summary.total)}</p>
          </CardContent>
        </Card>
        {Object.entries(summary.byType).map(([type, valor]) => (
          <Card key={type}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">{type}</p>
              <p className="text-lg font-semibold text-foreground">{formatCurrency(valor)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista de prestadores */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : providerGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum atendimento encontrado no período selecionado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {providerGroups.map((g) => (
            <Card key={g.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{g.name}</p>
                    <p className="text-xs text-muted-foreground">{g.city || "—"}</p>
                  </div>
                  <Badge variant={STATUS_LABELS[g.financialStatus]?.variant || "outline"}>
                    {STATUS_LABELS[g.financialStatus]?.label || "Em aberto"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{g.totalAtendimentos} atendimento{g.totalAtendimentos !== 1 ? "s" : ""}</span>
                  <span className="font-bold text-primary">{formatCurrency(g.totalValor)}</span>
                </div>
                {g.services && g.services.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {g.services.slice(0, 3).map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px]">
                        {SERVICE_TYPE_LABELS[s] || s}
                      </Badge>
                    ))}
                  </div>
                )}
                <Button variant="outline" size="sm" className="w-full" onClick={() => setSelectedProvider(g)}>
                  Ver detalhes
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de detalhes */}
      <Dialog open={!!selectedProvider} onOpenChange={(open) => !open && setSelectedProvider(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          {selectedProvider && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selectedProvider.name}
                  <span className="text-sm font-normal text-muted-foreground">— {selectedProvider.city || ""}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-wrap gap-2 mb-4">
                <Button size="sm" variant="outline" onClick={() => exportExcel(selectedProvider)}>
                  <Download className="h-4 w-4 mr-1" /> Exportar Excel
                </Button>
              </div>

              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Nº Solicitação</TableHead>
                      <TableHead>Beneficiário</TableHead>
                      <TableHead>Veículo</TableHead>
                      <TableHead>Tipo Serviço</TableHead>
                      <TableHead>Cidade</TableHead>
                      <TableHead className="text-right">Valor (R$)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedProvider.dispatches.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs">
                          {format(new Date(d.service_requests?.created_at || d.created_at), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{d.service_requests?.protocol || "-"}</TableCell>
                        <TableCell className="text-xs">
                          {d.service_requests?.beneficiaries?.name || d.service_requests?.requester_name || "-"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {(d.service_requests?.beneficiaries?.vehicle_plate || d.service_requests?.vehicle_plate || "-")}
                          {" "}
                          <span className="text-muted-foreground">
                            {d.service_requests?.beneficiaries?.vehicle_model || d.service_requests?.vehicle_model || ""}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          {SERVICE_TYPE_LABELS[d.service_requests?.service_type || ""] || d.service_requests?.service_type || "-"}
                        </TableCell>
                        <TableCell className="text-xs">{selectedProvider.city || "-"}</TableCell>
                        <TableCell className="text-right text-xs font-semibold">{formatCurrency(getDispatchValue(d))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={6} className="font-bold">Total</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(selectedProvider.totalValor)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
