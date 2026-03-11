import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviderData } from "@/hooks/useProviderData";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useMemo } from "react";
import { Search, Truck, CheckCircle, DollarSign, Clock } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pendente", variant: "outline" },
  sent: { label: "Enviado", variant: "secondary" },
  accepted: { label: "Aceito", variant: "default" },
  rejected: { label: "Recusado", variant: "destructive" },
  expired: { label: "Expirado", variant: "destructive" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  completed: { label: "Concluído", variant: "default" },
};

const SERVICE_LABELS: Record<string, string> = {
  tow_light: "Guincho Leve",
  tow_heavy: "Guincho Pesado",
  tow_motorcycle: "Guincho Moto",
  locksmith: "Chaveiro",
  tire_change: "Troca de Pneu",
  battery: "Bateria",
  fuel: "Pane Seca",
  lodging: "Hospedagem",
  other: "Outro",
};

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export default function ProviderServices() {
  const { dispatches, isLoading } = useProviderData();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    return dispatches.filter((d) => {
      const sr = d.service_requests as any;

      // Status filter
      if (statusFilter !== "all" && d.status !== statusFilter) return false;

      // Date filter
      if (dateFrom) {
        const dDate = new Date(d.created_at).toISOString().split("T")[0];
        if (dDate < dateFrom) return false;
      }
      if (dateTo) {
        const dDate = new Date(d.created_at).toISOString().split("T")[0];
        if (dDate > dateTo) return false;
      }

      // Text search
      if (search) {
        const q = search.toLowerCase();
        return (
          sr?.protocol?.toLowerCase().includes(q) ||
          sr?.requester_name?.toLowerCase().includes(q) ||
          sr?.vehicle_plate?.toLowerCase().includes(q) ||
          sr?.origin_address?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [dispatches, search, statusFilter, dateFrom, dateTo]);

  // KPIs
  const totalAtendimentos = filtered.length;
  const completedCount = filtered.filter((d) => d.status === "completed").length;
  const totalQuoted = filtered
    .filter((d) => d.status === "completed")
    .reduce((s, d) => s + Number(d.quoted_amount || 0), 0);
  const totalFinal = filtered
    .filter((d) => d.status === "completed")
    .reduce((s, d) => s + Number(d.final_amount || d.quoted_amount || 0), 0);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meus Serviços</h1>
        <p className="text-muted-foreground">Histórico completo de atendimentos</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{totalAtendimentos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <CheckCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Concluídos</p>
                <p className="text-xl font-bold">{completedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cotado</p>
                <p className="text-lg font-bold">{fmt(totalQuoted)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Recebido</p>
                <p className="text-lg font-bold">{fmt(totalFinal)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por protocolo, nome, placa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="w-40">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="completed">Concluído</SelectItem>
              <SelectItem value="accepted">Aceito</SelectItem>
              <SelectItem value="sent">Enviado</SelectItem>
              <SelectItem value="cancelled">Cancelado</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">De</Label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Até</Label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
        </div>
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
                  <th className="text-left p-3 font-medium">Serviço</th>
                  <th className="text-left p-3 font-medium">Placa</th>
                  <th className="text-left p-3 font-medium hidden md:table-cell">Origem</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">Destino</th>
                  <th className="text-left p-3 font-medium hidden lg:table-cell">KM</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">V. Cotado</th>
                  <th className="text-left p-3 font-medium">V. Final</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-6 text-center text-muted-foreground">
                      Nenhum serviço encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((dispatch) => {
                    const sr = dispatch.service_requests as any;
                    const statusInfo = STATUS_LABELS[dispatch.status] || { label: dispatch.status, variant: "outline" as const };
                    return (
                      <tr key={dispatch.id} className="border-b hover:bg-muted/30">
                        <td className="p-3 font-mono text-xs">{sr?.protocol}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          {new Date(dispatch.created_at).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="p-3">{SERVICE_LABELS[sr?.service_type] || sr?.service_type}</td>
                        <td className="p-3 font-mono">{sr?.vehicle_plate || "-"}</td>
                        <td className="p-3 hidden md:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                          {sr?.origin_address || "-"}
                        </td>
                        <td className="p-3 hidden lg:table-cell text-xs text-muted-foreground max-w-[200px] truncate">
                          {sr?.destination_address || "-"}
                        </td>
                        <td className="p-3 hidden lg:table-cell">
                          {sr?.estimated_km ? `${Number(sr.estimated_km).toFixed(1)} km` : "-"}
                        </td>
                        <td className="p-3">
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </td>
                        <td className="p-3 font-medium">
                          {fmt(Number(dispatch.quoted_amount || 0))}
                        </td>
                        <td className="p-3 font-medium">
                          {dispatch.final_amount ? fmt(Number(dispatch.final_amount)) : "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td colSpan={8} className="p-3 text-right">Totais (concluídos):</td>
                    <td className="p-3">{fmt(totalQuoted)}</td>
                    <td className="p-3">{fmt(totalFinal)}</td>
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
