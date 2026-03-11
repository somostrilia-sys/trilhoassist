import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProviderData } from "@/hooks/useProviderData";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState, useMemo, useRef } from "react";
import { Printer, FileText } from "lucide-react";

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

type PeriodMode = "month" | "custom";

export default function ProviderFinancial() {
  const { provider, dispatches, isLoading } = useProviderData();
  const printRef = useRef<HTMLDivElement>(null);

  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Generate available months from dispatches
  const months = useMemo(() => Array.from(
    new Set(dispatches.map((d) => {
      const dt = new Date(d.created_at);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    }))
  ).sort().reverse(), [dispatches]);

  // Filter dispatches by period
  const periodDispatches = useMemo(() => {

    return dispatches.filter((d) => {
      const dt = new Date(d.created_at);
      if (periodMode === "month") {
        const m = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        return m === selectedMonth;
      } else {
        const dStr = dt.toISOString().split("T")[0];
        if (dateFrom && dStr < dateFrom) return false;
        if (dateTo && dStr > dateTo) return false;
        return true;
      }
    });
  }, [dispatches, periodMode, selectedMonth, dateFrom, dateTo]);

  // Only completed
  const completedDispatches = periodDispatches.filter((d) => d.status === "completed");

  // Group by client
  const byClient = completedDispatches.reduce((acc: Record<string, {
    client_name: string;
    items: typeof completedDispatches;
    total_quoted: number;
    total_final: number;
  }>, dispatch) => {
    const sr = dispatch.service_requests as any;
    const clientId = sr?.client_id || "sem_cliente";
    const clientName = sr?.clients?.name || "Sem Cliente";

    if (!acc[clientId]) {
      acc[clientId] = { client_name: clientName, items: [], total_quoted: 0, total_final: 0 };
    }
    acc[clientId].items.push(dispatch);
    acc[clientId].total_quoted += Number(dispatch.quoted_amount || 0);
    acc[clientId].total_final += Number(dispatch.final_amount || dispatch.quoted_amount || 0);
    return acc;
  }, {});

  const clientEntries = Object.entries(byClient);
  const grandTotalQuoted = clientEntries.reduce((s, [, v]) => s + v.total_quoted, 0);
  const grandTotalFinal = clientEntries.reduce((s, [, v]) => s + v.total_final, 0);
  const totalCompleted = completedDispatches.length;
  const totalPeriod = periodDispatches.length;

  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-");
    const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${names[parseInt(mo) - 1]} ${y}`;
  };

  const periodLabel = periodMode === "month"
    ? monthLabel(selectedMonth)
    : `${dateFrom ? new Date(dateFrom + "T12:00:00").toLocaleDateString("pt-BR") : "..."} a ${dateTo ? new Date(dateTo + "T12:00:00").toLocaleDateString("pt-BR") : "..."}`;

  const handlePrint = () => {
    if (!printRef.current) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Fechamento - ${provider?.name || "Prestador"}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 30px; color: #333; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            h2 { font-size: 16px; color: #666; margin-top: 24px; }
            .header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
            .meta { font-size: 13px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background: #f5f5f5; font-weight: 600; }
            .total-row { font-weight: bold; background: #f9f9f9; }
            .footer { margin-top: 24px; border-top: 2px solid #333; padding-top: 12px; text-align: right; }
            .grand-total { font-size: 18px; font-weight: bold; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${provider?.name || "Prestador"}</h1>
            <p class="meta">${provider?.cnpj ? `CPF/CNPJ: ${provider.cnpj}` : ""}</p>
            <p class="meta">Período: ${periodLabel}</p>
          </div>
          ${clientEntries.map(([, data]) => `
            <h2>${data.client_name}</h2>
            <table>
              <thead>
                <tr>
                  <th>Protocolo</th>
                  <th>Data</th>
                  <th>Serviço</th>
                  <th>Placa</th>
                  <th>V. Cotado</th>
                  <th>V. Final</th>
                </tr>
              </thead>
              <tbody>
                ${data.items.map((d) => {
                  const sr = (d as any).service_requests;
                  return `<tr>
                    <td>${sr?.protocol || "-"}</td>
                    <td>${new Date(d.created_at).toLocaleDateString("pt-BR")}</td>
                    <td>${SERVICE_LABELS[sr?.service_type] || sr?.service_type || "-"}</td>
                    <td>${sr?.vehicle_plate || "-"}</td>
                    <td>${fmt(Number(d.quoted_amount || 0))}</td>
                    <td>${fmt(Number(d.final_amount || d.quoted_amount || 0))}</td>
                  </tr>`;
                }).join("")}
                <tr class="total-row">
                  <td colspan="4">Subtotal (${data.items.length} serviço(s))</td>
                  <td>${fmt(data.total_quoted)}</td>
                  <td>${fmt(data.total_final)}</td>
                </tr>
              </tbody>
            </table>
          `).join("")}
          <div class="footer">
            <p>Total de serviços concluídos: ${totalCompleted}</p>
            <p class="grand-total">TOTAL: ${fmt(grandTotalFinal)}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fechamento Financeiro</h1>
          <p className="text-muted-foreground">Extrato por período e associação</p>
        </div>
        <Button onClick={handlePrint} variant="outline" className="gap-2">
          <Printer className="h-4 w-4" />
          Imprimir / PDF
        </Button>
      </div>

      {/* Period Selection */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Tipo de período</Label>
              <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mensal</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {periodMode === "month" ? (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mês</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                    ))}
                    {months.length === 0 && (
                      <SelectItem value={selectedMonth}>{monthLabel(selectedMonth)}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">De</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Até</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total no Período</p>
            <p className="text-2xl font-bold">{totalPeriod}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Concluídos</p>
            <p className="text-2xl font-bold">{totalCompleted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Valor Cotado</p>
            <p className="text-2xl font-bold text-primary">{fmt(grandTotalQuoted)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Valor Final</p>
            <p className="text-2xl font-bold text-primary">{fmt(grandTotalFinal)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Provider Info Header */}
      {provider && (
        <Card className="bg-muted/30">
          <CardContent className="pt-5 pb-4 flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Prestador: </span>
              <span className="font-semibold">{provider.name}</span>
            </div>
            {provider.cnpj && (
              <div>
                <span className="text-muted-foreground">CPF/CNPJ: </span>
                <span className="font-mono">{provider.cnpj}</span>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Período: </span>
              <span className="font-semibold">{periodLabel}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* By Client Detail */}
      <div ref={printRef}>
        {clientEntries.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Nenhum serviço concluído neste período.
            </CardContent>
          </Card>
        ) : (
          clientEntries.map(([clientId, data]) => (
            <Card key={clientId} className="mb-4">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{data.client_name}</CardTitle>
                    <CardDescription>
                      {data.items.length} serviço(s) concluído(s)
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-primary">{fmt(data.total_final)}</p>
                    {data.total_quoted !== data.total_final && (
                      <p className="text-xs text-muted-foreground">Cotado: {fmt(data.total_quoted)}</p>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left p-2 font-medium">Protocolo</th>
                        <th className="text-left p-2 font-medium">Data</th>
                        <th className="text-left p-2 font-medium">Serviço</th>
                        <th className="text-left p-2 font-medium">Placa</th>
                        <th className="text-left p-2 font-medium">V. Cotado</th>
                        <th className="text-left p-2 font-medium">V. Final</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((dispatch) => {
                        const sr = dispatch.service_requests as any;
                        return (
                          <tr key={dispatch.id} className="border-b hover:bg-muted/20">
                            <td className="p-2 font-mono text-xs">{sr?.protocol}</td>
                            <td className="p-2 text-muted-foreground">
                              {new Date(dispatch.created_at).toLocaleDateString("pt-BR")}
                            </td>
                            <td className="p-2">{SERVICE_LABELS[sr?.service_type] || sr?.service_type}</td>
                            <td className="p-2 font-mono">{sr?.vehicle_plate || "-"}</td>
                            <td className="p-2">{fmt(Number(dispatch.quoted_amount || 0))}</td>
                            <td className="p-2 font-medium">
                              {fmt(Number(dispatch.final_amount || dispatch.quoted_amount || 0))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-semibold bg-muted/30">
                        <td colSpan={4} className="p-2 text-right">Subtotal</td>
                        <td className="p-2">{fmt(data.total_quoted)}</td>
                        <td className="p-2">{fmt(data.total_final)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {/* Grand Total Footer */}
        {clientEntries.length > 0 && (
          <Card className="border-primary/30">
            <CardContent className="pt-5 pb-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {totalCompleted} serviço(s) concluído(s) · {clientEntries.length} empresa(s)
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Geral</p>
                <p className="text-2xl font-bold text-primary">{fmt(grandTotalFinal)}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
