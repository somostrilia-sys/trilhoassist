import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientData } from "@/hooks/useClientData";
import { FileText, CheckCircle, DollarSign, Car, AlertTriangle, Clock, TrendingUp, Users } from "lucide-react";

export default function ClientDashboard() {
  const { clients, financialSummary, activePlates, inactivePlates, monthlyData, serviceRequests, beneficiaries, dispatches, isLoading } = useClientData();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const clientName = clients[0]?.name || "Associação";
  const clientCnpj = clients[0]?.cnpj || "";

  // Avg service time
  const completedWithTime = serviceRequests.filter(
    (sr) => sr.status === "completed" && sr.completed_at
  );
  let avgMinutes = 0;
  if (completedWithTime.length > 0) {
    const totalMin = completedWithTime.reduce((acc, sr) => {
      const mins = (new Date(sr.completed_at!).getTime() - new Date(sr.created_at).getTime()) / 60000;
      return acc + (mins > 0 ? mins : 0);
    }, 0);
    avgMinutes = totalMin / completedWithTime.length;
  }
  const avgTimeLabel = avgMinutes > 0
    ? avgMinutes < 60 ? `${Math.round(avgMinutes)} min` : `${Math.floor(avgMinutes / 60)}h ${Math.round(avgMinutes % 60)}min`
    : "—";

  // Top service types
  const serviceTypeCounts: Record<string, number> = {};
  serviceRequests.forEach((sr) => {
    serviceTypeCounts[sr.service_type] = (serviceTypeCounts[sr.service_type] || 0) + 1;
  });
  const SERVICE_LABELS: Record<string, string> = {
    tow_light: "Guincho Leve", tow_heavy: "Guincho Pesado", tow_motorcycle: "Guincho Moto",
    locksmith: "Chaveiro", tire_change: "Troca de Pneu", battery: "Bateria",
    fuel: "Pane Seca", lodging: "Hospedagem", collision: "Colisão", other: "Outro",
  };
  const topServices = Object.entries(serviceTypeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Recent requests
  const recentRequests = serviceRequests.slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{clientName}</h1>
        <p className="text-muted-foreground">
          {clientCnpj ? `CNPJ: ${clientCnpj} · ` : ""}Portal da Associação
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Atendimentos</p>
                <p className="text-2xl font-bold">{financialSummary.totalRequests}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Concluídos</p>
                <p className="text-2xl font-bold">{financialSummary.completed}</p>
                <p className="text-xs text-muted-foreground">
                  {financialSummary.active} em andamento
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Beneficiários</p>
                <p className="text-2xl font-bold">{activePlates}</p>
                <p className="text-xs text-muted-foreground">
                  {inactivePlates} inativos
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tempo Médio</p>
                <p className="text-2xl font-bold">{avgTimeLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Services */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Serviços Mais Solicitados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topServices.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum atendimento registrado.</p>
            ) : (
              <div className="space-y-3">
                {topServices.map(([type, count]) => {
                  const pct = financialSummary.totalRequests > 0 ? (count / financialSummary.totalRequests) * 100 : 0;
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{SERVICE_LABELS[type] || type}</span>
                        <span className="font-medium">{count} ({pct.toFixed(0)}%)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resumo Mensal</CardTitle>
            <CardDescription>Atendimentos e custos por mês</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyData.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum atendimento registrado.</p>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {monthlyData.map((m) => {
                  const [y, mo] = m.month.split("-");
                  const names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                  const label = `${names[parseInt(mo) - 1]} ${y}`;
                  return (
                    <div key={m.month} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.completed} concluído(s) de {m.requests}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-primary">{fmt(m.charged)}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Requests */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos Atendimentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Protocolo</th>
                  <th className="text-left p-3 font-medium">Serviço</th>
                  <th className="text-left p-3 font-medium">Solicitante</th>
                  <th className="text-left p-3 font-medium">Placa</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {recentRequests.length === 0 ? (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum atendimento.</td></tr>
                ) : (
                  recentRequests.map((sr) => (
                    <tr key={sr.id} className="border-b hover:bg-muted/30">
                      <td className="p-3 font-mono text-xs">{sr.protocol}</td>
                      <td className="p-3">{SERVICE_LABELS[sr.service_type] || sr.service_type}</td>
                      <td className="p-3">{sr.requester_name}</td>
                      <td className="p-3 font-mono">{sr.vehicle_plate || "—"}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          sr.status === "completed" ? "bg-primary/10 text-primary" :
                          sr.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {sr.status === "completed" ? "Concluído" :
                           sr.status === "cancelled" ? "Cancelado" :
                           sr.status === "open" ? "Aberto" :
                           sr.status === "in_progress" ? "Em Andamento" :
                           sr.status === "dispatched" ? "Acionado" :
                           sr.status === "awaiting_dispatch" ? "Aguardando" : sr.status}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(sr.created_at).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
