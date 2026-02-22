import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviderData } from "@/hooks/useProviderData";
import { Truck, CheckCircle, Clock, DollarSign, AlertCircle, XCircle } from "lucide-react";

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

export default function ProviderDashboard() {
  const { provider, dispatches, financialByClient, statusCounts, isLoading } = useProviderData();

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

  const totalServices = dispatches.length;
  const completedServices = statusCounts["completed"] || 0;
  const activeServices = (statusCounts["accepted"] || 0) + (statusCounts["sent"] || 0) + (statusCounts["pending"] || 0);
  const totalEarnings = financialByClient.reduce((s, f) => s + f.total_amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Olá, {provider?.name}</h1>
        <p className="text-muted-foreground">Acompanhe seus atendimentos e financeiro</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Serviços</p>
                <p className="text-2xl font-bold">{totalServices}</p>
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
                <p className="text-2xl font-bold">{completedServices}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Em Andamento</p>
                <p className="text-2xl font-bold">{activeServices}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Recebido</p>
                <p className="text-2xl font-bold">
                  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalEarnings)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Financial by Client */}
      <Card>
        <CardHeader>
          <CardTitle>Fechamento por Associação</CardTitle>
          <CardDescription>Resumo financeiro agrupado por empresa</CardDescription>
        </CardHeader>
        <CardContent>
          {financialByClient.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum serviço registrado ainda.</p>
          ) : (
            <div className="space-y-4">
              {financialByClient.map((item) => (
                <div key={item.client_id} className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <p className="font-medium">{item.client_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.completed_services} concluído(s) · {item.total_services} total
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.total_amount)}
                    </p>
                    {item.pending_amount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(item.pending_amount)} pendente
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Services */}
      <Card>
        <CardHeader>
          <CardTitle>Últimos Atendimentos</CardTitle>
          <CardDescription>Seus serviços mais recentes</CardDescription>
        </CardHeader>
        <CardContent>
          {dispatches.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum atendimento ainda.</p>
          ) : (
            <div className="space-y-3">
              {dispatches.slice(0, 10).map((dispatch) => {
                const sr = dispatch.service_requests as any;
                const statusInfo = STATUS_LABELS[dispatch.status] || { label: dispatch.status, variant: "outline" as const };
                return (
                  <div key={dispatch.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{sr?.protocol}</span>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </div>
                      <p className="text-sm font-medium">
                        {SERVICE_LABELS[sr?.service_type] || sr?.service_type} — {sr?.requester_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{sr?.origin_address}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                          Number(dispatch.final_amount || dispatch.quoted_amount || 0)
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(dispatch.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
