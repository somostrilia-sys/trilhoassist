import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviderData } from "@/hooks/useProviderData";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search } from "lucide-react";

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

export default function ProviderServices() {
  const { dispatches, isLoading } = useProviderData();
  const [search, setSearch] = useState("");

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  const filtered = dispatches.filter((d) => {
    const sr = d.service_requests as any;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      sr?.protocol?.toLowerCase().includes(q) ||
      sr?.requester_name?.toLowerCase().includes(q) ||
      sr?.vehicle_plate?.toLowerCase().includes(q) ||
      sr?.origin_address?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meus Serviços</h1>
        <p className="text-muted-foreground">Histórico completo de atendimentos</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por protocolo, nome, placa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Protocolo</th>
                  <th className="text-left p-3 font-medium">Serviço</th>
                  <th className="text-left p-3 font-medium">Solicitante</th>
                  <th className="text-left p-3 font-medium">Veículo</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Valor</th>
                  <th className="text-left p-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
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
                        <td className="p-3">{SERVICE_LABELS[sr?.service_type] || sr?.service_type}</td>
                        <td className="p-3">{sr?.requester_name}</td>
                        <td className="p-3">
                          {sr?.vehicle_plate && <span className="font-mono">{sr.vehicle_plate}</span>}
                          {sr?.vehicle_model && <span className="text-muted-foreground ml-1">({sr.vehicle_model})</span>}
                        </td>
                        <td className="p-3">
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </td>
                        <td className="p-3 font-medium">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
                            Number(dispatch.final_amount || dispatch.quoted_amount || 0)
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {new Date(dispatch.created_at).toLocaleDateString("pt-BR")}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
