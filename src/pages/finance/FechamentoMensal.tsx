import { useState, useMemo } from "react";
import { format, subMonths } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useListarFechamentos, useGerarFechamentos, useExportFechamentos, formatCurrencyBR } from "@/hooks/useTrilhoFinanceiro";
import { Download, RefreshCw, Search, Eye } from "lucide-react";
import FechamentoDetalhe from "@/components/finance/FechamentoDetalhe";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  aberto: { label: "🟡 Aberto", variant: "outline" },
  aprovado: { label: "🟢 Aprovado", variant: "default" },
  pago: { label: "🔵 Pago", variant: "secondary" },
  cancelado: { label: "🔴 Cancelado", variant: "destructive" },
};

function getMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = subMonths(now, i);
    opts.push({ value: format(d, "yyyy-MM"), label: format(d, "MMM yyyy").replace(/^./, (c) => c.toUpperCase()) });
  }
  return opts;
}

export default function FechamentoMensal() {
  const monthOptions = useMemo(getMonthOptions, []);
  const [mes, setMes] = useState(monthOptions[0].value);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useListarFechamentos(mes, search || undefined, statusFilter);
  const gerarMutation = useGerarFechamentos();
  const exportMutation = useExportFechamentos();

  const fechamentos: any[] = data?.fechamentos ?? data ?? [];

  const handleGerar = async () => {
    const [y, m] = mes.split("-");
    const dateFrom = `${mes}-01`;
    const lastDay = new Date(Number(y), Number(m), 0).getDate();
    const dateTo = `${mes}-${String(lastDay).padStart(2, "0")}`;
    try {
      await gerarMutation.mutateAsync({ mes_referencia: mes, date_from: dateFrom, date_to: dateTo });
      toast.success("Fechamentos gerados com sucesso!");
      refetch();
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar fechamentos");
    }
  };

  const handleExport = async () => {
    try {
      const result = await exportMutation.mutateAsync(mes);
      if (result?.csv_url) {
        window.open(result.csv_url, "_blank");
      } else {
        toast.success("Exportação gerada!");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro ao exportar");
    }
  };

  if (selectedId) {
    const item = fechamentos.find((f: any) => f.id === selectedId);
    return (
      <FechamentoDetalhe
        fechamento={item}
        fechamentoId={selectedId}
        onBack={() => { setSelectedId(null); refetch(); }}
      />
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">Fechamento Mensal</h1>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleGerar} disabled={gerarMutation.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${gerarMutation.isPending ? "animate-spin" : ""}`} />
            Gerar Fechamento do Mês
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={exportMutation.isPending}>
            <Download className="h-4 w-4 mr-2" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="aberto">Aberto</SelectItem>
                <SelectItem value="aprovado">Aprovado</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar prestador..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : fechamentos.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">Nenhum fechamento encontrado</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prestador</TableHead>
                    <TableHead className="hidden md:table-cell">Cidade</TableHead>
                    <TableHead className="text-center">Atend.</TableHead>
                    <TableHead className="text-right">Valor Bruto</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Descontos</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">Acréscimos</TableHead>
                    <TableHead className="text-right">Valor Líquido</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fechamentos.map((f: any) => {
                    const st = STATUS_MAP[f.status] || STATUS_MAP.aberto;
                    const isPago = f.status === "pago";
                    return (
                      <TableRow key={f.id} className={isPago ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""}>
                        <TableCell className="font-medium">{f.prestador_nome || f.nome || "—"}</TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">{f.cidade || "—"}</TableCell>
                        <TableCell className="text-center">{f.total_atendimentos ?? f.atendimentos ?? 0}</TableCell>
                        <TableCell className="text-right">{formatCurrencyBR(f.valor_bruto)}</TableCell>
                        <TableCell className="text-right hidden lg:table-cell text-destructive">{formatCurrencyBR(f.descontos)}</TableCell>
                        <TableCell className="text-right hidden lg:table-cell text-emerald-600">{formatCurrencyBR(f.acrescimos)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrencyBR(f.valor_liquido)}</TableCell>
                        <TableCell>
                          <Badge variant={st.variant}>{st.label}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button size="sm" variant="ghost" onClick={() => setSelectedId(f.id)}>
                            <Eye className="h-4 w-4" />
                          </Button>
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
    </div>
  );
}
