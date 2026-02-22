import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviderData } from "@/hooks/useProviderData";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useState } from "react";

export default function ProviderFinancial() {
  const { dispatches, financialByClient, isLoading } = useProviderData();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  // Generate available months from dispatches
  const months = Array.from(
    new Set(dispatches.map((d) => {
      const dt = new Date(d.created_at);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    }))
  ).sort().reverse();

  if (months.length > 0 && !months.includes(selectedMonth)) {
    // If current month has no data, default to latest
  }

  // Filter dispatches by selected month
  const monthDispatches = dispatches.filter((d) => {
    const dt = new Date(d.created_at);
    const m = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    return m === selectedMonth;
  });

  // Compute monthly financial by client
  const monthlyByClient = monthDispatches.reduce((acc: Record<string, {
    client_name: string;
    total: number;
    completed: number;
    amount: number;
    items: typeof monthDispatches;
  }>, dispatch) => {
    const sr = dispatch.service_requests as any;
    const clientId = sr?.client_id || "sem_cliente";
    const clientName = sr?.clients?.name || "Sem Cliente";

    if (!acc[clientId]) {
      acc[clientId] = { client_name: clientName, total: 0, completed: 0, amount: 0, items: [] };
    }
    acc[clientId].total += 1;
    acc[clientId].items.push(dispatch);
    if (dispatch.status === "completed") {
      acc[clientId].completed += 1;
      acc[clientId].amount += Number(dispatch.final_amount || dispatch.quoted_amount || 0);
    }
    return acc;
  }, {});

  const clientEntries = Object.entries(monthlyByClient);
  const totalMonth = clientEntries.reduce((s, [, v]) => s + v.amount, 0);
  const totalCompleted = clientEntries.reduce((s, [, v]) => s + v.completed, 0);

  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-");
    const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return `${names[parseInt(mo) - 1]} ${y}`;
  };

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fechamento Financeiro</h1>
          <p className="text-muted-foreground">Resumo mensal por associação</p>
        </div>
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

      {/* Monthly Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total do Mês</p>
            <p className="text-2xl font-bold text-primary">{fmt(totalMonth)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Serviços Concluídos</p>
            <p className="text-2xl font-bold">{totalCompleted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Empresas Atendidas</p>
            <p className="text-2xl font-bold">{clientEntries.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* By Client */}
      {clientEntries.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Nenhum serviço neste mês.
          </CardContent>
        </Card>
      ) : (
        clientEntries.map(([clientId, data]) => (
          <Card key={clientId}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{data.client_name}</CardTitle>
                  <CardDescription>
                    {data.completed} concluído(s) de {data.total} serviço(s)
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary">{fmt(data.amount)}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.items.map((dispatch) => {
                  const sr = dispatch.service_requests as any;
                  return (
                    <div key={dispatch.id} className="flex items-center justify-between text-sm p-2 rounded border">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{sr?.protocol}</span>
                        <Badge variant={dispatch.status === "completed" ? "default" : "outline"}>
                          {dispatch.status === "completed" ? "Concluído" : dispatch.status}
                        </Badge>
                      </div>
                      <span className="font-medium">
                        {fmt(Number(dispatch.final_amount || dispatch.quoted_amount || 0))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
