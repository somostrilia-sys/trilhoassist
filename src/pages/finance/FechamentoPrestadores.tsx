import { useState, useMemo } from "react";
import { format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Calculator, Download, FileText, X, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  payment_method: string | null;
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
    payment_method: string | null;
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
  totalAVista: number;
  totalFaturado: number;
  dispatches: DispatchWithDetails[];
  financialStatus: string;
}

/** Classify dispatch as 'avista' or 'faturado' based on payment_method */
function classifyPayment(d: DispatchWithDetails): "avista" | "faturado" {
  // Check dispatch payment_method first
  const pm = d.payment_method || d.service_requests?.payment_method || "";
  const pmLower = pm.toLowerCase();

  if (pmLower === "boleto" || d.status === "invoiced" || d.status === "billed") {
    return "faturado";
  }
  if (pmLower === "pix" || pmLower === "avista" || pmLower === "cash") {
    return "avista";
  }
  // If paid_at or no payment info → à vista by default
  return "avista";
}

export default function FechamentoPrestadores() {
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(new Date()));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [appliedFrom, setAppliedFrom] = useState<Date>(startOfMonth(new Date()));
  const [appliedTo, setAppliedTo] = useState<Date>(new Date());
  const [selectedProvider, setSelectedProvider] = useState<ProviderGroup | null>(null);
  const [search, setSearch] = useState("");
  const [nfFilter, setNfFilter] = useState("all");

  const { data: dispatches, isLoading } = useQuery({
    queryKey: ["fechamento-prestadores", appliedFrom.toISOString(), appliedTo.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatches")
        .select(`
          id, final_amount, quoted_amount, status, completed_at, created_at, provider_id, payment_method,
          providers(id, name, city, services, phone),
          service_requests(id, protocol, service_type, origin_address, provider_cost, created_at, requester_name, vehicle_plate, vehicle_model, beneficiary_id, payment_method,
            beneficiaries(name, vehicle_plate, vehicle_model)
          )
        `)
        .gte("created_at", appliedFrom.toISOString())
        .lte("created_at", appliedTo.toISOString())
        .not("provider_id", "is", null)
        .in("status", ["completed", "accepted"]);

      if (error) throw error;
      return (data || []) as unknown as DispatchWithDetails[];
    },
  });

  // Fetch provider invoices for NF filter
  const dispatchIds = useMemo(() => (dispatches || []).map(d => d.id), [dispatches]);
  const { data: providerInvoices } = useQuery({
    queryKey: ["provider-invoices-nf-check", dispatchIds],
    queryFn: async () => {
      if (dispatchIds.length === 0) return [];
      // Fetch in batches of 100
      const allInvoices: { dispatch_id: string }[] = [];
      for (let i = 0; i < dispatchIds.length; i += 100) {
        const batch = dispatchIds.slice(i, i + 100);
        const { data } = await supabase
          .from("provider_invoices")
          .select("dispatch_id")
          .in("dispatch_id", batch);
        if (data) allInvoices.push(...data);
      }
      return allInvoices;
    },
    enabled: dispatchIds.length > 0,
  });

  const dispatchesWithNf = useMemo(() => {
    const set = new Set((providerInvoices || []).map(i => i.dispatch_id));
    return set;
  }, [providerInvoices]);

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
          totalAVista: 0,
          totalFaturado: 0,
          dispatches: [],
          financialStatus: "pending",
        });
      }
      const g = map.get(pid)!;
      const valor = d.final_amount ?? d.quoted_amount ?? d.service_requests?.provider_cost ?? 0;
      const valorNum = Number(valor);
      const tipo = classifyPayment(d);

      g.totalAtendimentos++;
      g.totalValor += valorNum;
      if (tipo === "avista") g.totalAVista += valorNum;
      else g.totalFaturado += valorNum;
      g.dispatches.push(d);
    }

    return Array.from(map.values()).sort((a, b) => b.totalValor - a.totalValor);
  }, [dispatches]);

  // Apply search + NF filter
  const filteredGroups = useMemo(() => {
    let groups = providerGroups;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      groups = groups.filter((g) => {
        // Match provider name
        if (g.name.toLowerCase().includes(q)) return true;
        // Match dispatches: placa, protocolo, beneficiário, tipo serviço
        return g.dispatches.some((d) => {
          const sr = d.service_requests;
          const plate = (sr?.beneficiaries?.vehicle_plate || sr?.vehicle_plate || "").toLowerCase();
          const protocol = (sr?.protocol || "").toLowerCase();
          const beneficiary = (sr?.beneficiaries?.name || sr?.requester_name || "").toLowerCase();
          const serviceType = (SERVICE_TYPE_LABELS[sr?.service_type || ""] || sr?.service_type || "").toLowerCase();
          return plate.includes(q) || protocol.includes(q) || beneficiary.includes(q) || serviceType.includes(q);
        });
      });
    }

    // NF filter
    if (nfFilter === "pending_nf") {
      groups = groups.filter((g) =>
        g.dispatches.some((d) => !dispatchesWithNf.has(d.id))
      );
    } else if (nfFilter === "has_nf") {
      groups = groups.filter((g) =>
        g.dispatches.every((d) => dispatchesWithNf.has(d.id))
      );
    }

    return groups;
  }, [providerGroups, search, nfFilter, dispatchesWithNf]);

  const summary = useMemo(() => {
    const byType: Record<string, number> = {};
    let total = 0;
    let count = 0;
    let totalAVista = 0;
    let totalFaturado = 0;
    for (const g of filteredGroups) {
      total += g.totalValor;
      totalAVista += g.totalAVista;
      totalFaturado += g.totalFaturado;
      count += g.totalAtendimentos;
      for (const d of g.dispatches) {
        const st = d.service_requests?.service_type || "other";
        const cat = PROVIDER_TYPE_MAP[st] || "Outros";
        byType[cat] = (byType[cat] || 0) + Number(d.final_amount ?? d.quoted_amount ?? d.service_requests?.provider_cost ?? 0);
      }
    }
    return { total, count, byType, totalAVista, totalFaturado };
  }, [filteredGroups]);

  const handleFilter = () => {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  };

  const getDispatchValue = (d: DispatchWithDetails) =>
    Number(d.final_amount ?? d.quoted_amount ?? d.service_requests?.provider_cost ?? 0);

  // Global Excel export (all providers)
  const exportGlobalExcel = () => {
    const rows = filteredGroups.map((g) => ({
      "Prestador": g.name,
      "Cidade": g.city || "-",
      "Telefone": g.phone || "-",
      "Qtd Atendimentos": g.totalAtendimentos,
      "Total À Vista (R$)": g.totalAVista,
      "Total Faturado (R$)": g.totalFaturado,
      "Valor Total (R$)": g.totalValor,
      "Status NF": g.dispatches.every((d) => dispatchesWithNf.has(d.id)) ? "OK" : "Pendente",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Prestadores");
    XLSX.writeFile(wb, `fechamento_geral_${format(appliedFrom, "yyyyMMdd")}_${format(appliedTo, "yyyyMMdd")}.xlsx`);
    toast({ title: "Excel exportado com sucesso!" });
  };

  const getDispatchValue = (d: DispatchWithDetails) =>
    Number(d.final_amount ?? d.quoted_amount ?? d.service_requests?.provider_cost ?? 0);

  const buildRow = (d: DispatchWithDetails) => ({
    Data: format(new Date(d.service_requests?.created_at || d.created_at), "dd/MM/yyyy"),
    "Nº Solicitação": d.service_requests?.protocol || "-",
    Beneficiário: d.service_requests?.beneficiaries?.name || d.service_requests?.requester_name || "-",
    Placa: d.service_requests?.beneficiaries?.vehicle_plate || d.service_requests?.vehicle_plate || "-",
    Modelo: d.service_requests?.beneficiaries?.vehicle_model || d.service_requests?.vehicle_model || "-",
    "Tipo Serviço": SERVICE_TYPE_LABELS[d.service_requests?.service_type || ""] || d.service_requests?.service_type || "-",
    Cidade: d.providers?.city || "-",
    "Pagamento": classifyPayment(d) === "avista" ? "À Vista" : "Faturado",
    "Valor (R$)": getDispatchValue(d),
  });

  const exportExcel = (provider: ProviderGroup) => {
    const aVistaRows = provider.dispatches
      .filter((d) => classifyPayment(d) === "avista")
      .map(buildRow);
    const faturadoRows = provider.dispatches
      .filter((d) => classifyPayment(d) === "faturado")
      .map(buildRow);

    const wb = XLSX.utils.book_new();

    const wsAVista = XLSX.utils.json_to_sheet(aVistaRows.length > 0 ? aVistaRows : [{ Info: "Nenhum serviço à vista" }]);
    XLSX.utils.book_append_sheet(wb, wsAVista, "À Vista");

    const wsFaturado = XLSX.utils.json_to_sheet(faturadoRows.length > 0 ? faturadoRows : [{ Info: "Nenhum serviço faturado" }]);
    XLSX.utils.book_append_sheet(wb, wsFaturado, "Faturado");

    XLSX.writeFile(wb, `fechamento_${provider.name.replace(/\s/g, "_")}.xlsx`);
    toast({ title: "Excel exportado com sucesso!" });
  };

  const exportPDF = (provider: ProviderGroup) => {
    const doc = new jsPDF({ orientation: "landscape" });

    // Header with logo-like text (logo is a PNG asset, use text branding instead for PDF)
    doc.setFillColor(220, 38, 38); // red brand color
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("TRILHO SOLUÇÕES", 14, 13);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Fechamento — ${provider.name}`, 90, 13);

    const period = `Período: ${format(appliedFrom, "dd/MM/yyyy")} a ${format(appliedTo, "dd/MM/yyyy")}`;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(9);
    doc.text(period, 14, 27);
    doc.text(`Prestador: ${provider.name} | Cidade: ${provider.city || "—"}`, 14, 33);
    doc.text(
      `Total À Vista: ${formatCurrency(provider.totalAVista)}   |   Total Faturado: ${formatCurrency(provider.totalFaturado)}   |   Total Geral: ${formatCurrency(provider.totalValor)}`,
      14,
      39
    );

    const columns = ["Data", "Protocolo", "Beneficiário", "Placa", "Tipo Serviço", "Cidade", "Valor (R$)"];
    const makeBodyRows = (dispatches: DispatchWithDetails[]) =>
      dispatches.map((d) => [
        format(new Date(d.service_requests?.created_at || d.created_at), "dd/MM/yyyy"),
        d.service_requests?.protocol || "-",
        d.service_requests?.beneficiaries?.name || d.service_requests?.requester_name || "-",
        d.service_requests?.beneficiaries?.vehicle_plate || d.service_requests?.vehicle_plate || "-",
        SERVICE_TYPE_LABELS[d.service_requests?.service_type || ""] || d.service_requests?.service_type || "-",
        provider.city || "-",
        formatCurrency(getDispatchValue(d)),
      ]);

    const aVistaDispatches = provider.dispatches.filter((d) => classifyPayment(d) === "avista");
    const faturadoDispatches = provider.dispatches.filter((d) => classifyPayment(d) === "faturado");

    // À Vista sheet
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("À Vista", 14, 47);
    autoTable(doc, {
      startY: 50,
      head: [columns],
      body: aVistaDispatches.length > 0 ? makeBodyRows(aVistaDispatches) : [["Nenhum serviço à vista", "", "", "", "", "", ""]],
      foot: aVistaDispatches.length > 0 ? [["", "", "", "", "", "TOTAL", formatCurrency(provider.totalAVista)]] : undefined,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38] },
      footStyles: { fontStyle: "bold", fillColor: [240, 240, 240] },
    });

    // Faturado sheet (same page, new section)
    const finalY = (doc as any).lastAutoTable?.finalY ?? 100;
    doc.addPage();

    // Page header again
    doc.setFillColor(220, 38, 38);
    doc.rect(0, 0, doc.internal.pageSize.getWidth(), 20, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("TRILHO SOLUÇÕES", 14, 13);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Fechamento — ${provider.name}`, 90, 13);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Faturado", 14, 30);
    autoTable(doc, {
      startY: 34,
      head: [columns],
      body: faturadoDispatches.length > 0 ? makeBodyRows(faturadoDispatches) : [["Nenhum serviço faturado", "", "", "", "", "", ""]],
      foot: faturadoDispatches.length > 0 ? [["", "", "", "", "", "TOTAL", formatCurrency(provider.totalFaturado)]] : undefined,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 64, 175] },
      footStyles: { fontStyle: "bold", fillColor: [240, 240, 240] },
    });

    doc.save(`fechamento_${provider.name.replace(/\s/g, "_")}.pdf`);
    toast({ title: "PDF exportado com sucesso!" });
  };

  const renderServiceTable = (dispatchList: DispatchWithDetails[], total: number) => (
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
          {dispatchList.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                Nenhum serviço nesta categoria.
              </TableCell>
            </TableRow>
          ) : (
            dispatchList.map((d) => (
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
                <TableCell className="text-xs">{d.providers?.city || "-"}</TableCell>
                <TableCell className="text-right text-xs font-semibold">{formatCurrency(getDispatchValue(d))}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {dispatchList.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={6} className="font-bold">Total</TableCell>
              <TableCell className="text-right font-bold">{formatCurrency(total)}</TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );

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
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total À Vista</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalAVista)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Total Faturado</p>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(summary.totalFaturado)}</p>
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
                {/* À Vista / Faturado breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-green-50 border border-green-200 p-2 text-center">
                    <p className="text-green-700 font-medium">À Vista</p>
                    <p className="text-green-800 font-bold">{formatCurrency(g.totalAVista)}</p>
                  </div>
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-2 text-center">
                    <p className="text-blue-700 font-medium">Faturado</p>
                    <p className="text-blue-800 font-bold">{formatCurrency(g.totalFaturado)}</p>
                  </div>
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

              {/* Summary row */}
              <div className="grid grid-cols-3 gap-3 mb-2">
                <div className="rounded-md border p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Geral</p>
                  <p className="font-bold text-primary">{formatCurrency(selectedProvider.totalValor)}</p>
                </div>
                <div className="rounded-md border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-xs text-green-700">À Vista</p>
                  <p className="font-bold text-green-800">{formatCurrency(selectedProvider.totalAVista)}</p>
                </div>
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-center">
                  <p className="text-xs text-blue-700">Faturado</p>
                  <p className="font-bold text-blue-800">{formatCurrency(selectedProvider.totalFaturado)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <Button size="sm" variant="outline" onClick={() => exportExcel(selectedProvider)}>
                  <Download className="h-4 w-4 mr-1" /> Exportar Excel
                </Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF(selectedProvider)}>
                  <FileText className="h-4 w-4 mr-1" /> Exportar PDF
                </Button>
              </div>

              {/* Tabs: À Vista / Faturado */}
              <Tabs defaultValue="todos">
                <TabsList className="w-full mb-4">
                  <TabsTrigger value="todos" className="flex-1">
                    Serviços Realizados ({selectedProvider.dispatches.length})
                  </TabsTrigger>
                  <TabsTrigger value="avista" className="flex-1">
                    À Vista ({selectedProvider.dispatches.filter((d) => classifyPayment(d) === "avista").length})
                  </TabsTrigger>
                  <TabsTrigger value="faturado" className="flex-1">
                    Faturado ({selectedProvider.dispatches.filter((d) => classifyPayment(d) === "faturado").length})
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="todos">
                  {renderServiceTable(
                    selectedProvider.dispatches,
                    selectedProvider.totalValor
                  )}
                </TabsContent>
                <TabsContent value="avista">
                  {renderServiceTable(
                    selectedProvider.dispatches.filter((d) => classifyPayment(d) === "avista"),
                    selectedProvider.totalAVista
                  )}
                </TabsContent>
                <TabsContent value="faturado">
                  {renderServiceTable(
                    selectedProvider.dispatches.filter((d) => classifyPayment(d) === "faturado"),
                    selectedProvider.totalFaturado
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
