import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useClientData } from "@/hooks/useClientData";
import { useState } from "react";
import { Search, Truck, Clock, CheckCircle2, PhoneCall, MapPin } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Aberto", variant: "outline" },
  awaiting_dispatch: { label: "Aguardando Acionamento", variant: "secondary" },
  dispatched: { label: "Acionado", variant: "secondary" },
  in_progress: { label: "Em Andamento", variant: "default" },
  completed: { label: "Concluído", variant: "default" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  refunded: { label: "Estornado", variant: "destructive" },
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

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function calcTempoTotal(createdAt: string, completedAt: string | null): string {
  if (!completedAt) return "—";
  const mins = (new Date(completedAt).getTime() - new Date(createdAt).getTime()) / 60000;
  if (mins < 0) return "—";
  if (mins < 60) return `${Math.round(mins)} min`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}min`;
}

interface TimelineStepProps {
  label: string;
  time: string | null;
  icon: React.ReactNode;
  isLast?: boolean;
  isActive?: boolean;
}

function TimelineStep({ label, time, icon, isLast, isActive }: TimelineStepProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
          isActive ? "bg-primary text-primary-foreground" : time ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
        }`}>
          {icon}
        </div>
        {!isLast && (
          <div className={`w-0.5 h-8 ${time ? "bg-primary/30" : "bg-muted"}`} />
        )}
      </div>
      <div className="pt-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className={`text-sm ${time ? "font-medium" : "text-muted-foreground"}`}>
          {time ? fmtDateTime(time) : "Aguardando"}
        </p>
      </div>
    </div>
  );
}

export default function ClientRequests() {
  const { serviceRequests, dispatchMap, isLoading } = useClientData();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  }

  const filtered = serviceRequests.filter((sr) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      sr.protocol?.toLowerCase().includes(q) ||
      sr.requester_name?.toLowerCase().includes(q) ||
      sr.vehicle_plate?.toLowerCase().includes(q)
    );
  });

  const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Atendimentos</h1>
        <p className="text-muted-foreground">Histórico de atendimentos da sua base</p>
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
                  <th className="text-left p-3 font-medium">Prestador</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Valor Cobrado</th>
                  <th className="text-left p-3 font-medium">Tempo Total</th>
                  <th className="text-left p-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-muted-foreground">
                      Nenhum atendimento encontrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((sr) => {
                    const statusInfo = STATUS_LABELS[sr.status] || { label: sr.status, variant: "outline" as const };
                    const dispatch = dispatchMap[sr.id];
                    const providerName = (dispatch?.providers as any)?.name || "Não atribuído";
                    const isExpanded = expandedId === sr.id;
                    const tempoTotal = calcTempoTotal(sr.created_at, sr.completed_at);

                    return (
                      <>
                        <tr
                          key={sr.id}
                          className="border-b hover:bg-muted/30 cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : sr.id)}
                        >
                          <td className="p-3 font-mono text-xs">{sr.protocol}</td>
                          <td className="p-3">{SERVICE_LABELS[sr.service_type] || sr.service_type}</td>
                          <td className="p-3">{sr.requester_name}</td>
                          <td className="p-3">
                            {sr.vehicle_plate && <span className="font-mono">{sr.vehicle_plate}</span>}
                            {sr.vehicle_model && <span className="text-muted-foreground ml-1">({sr.vehicle_model})</span>}
                          </td>
                          <td className="p-3">
                            <span className="flex items-center gap-1 text-xs">
                              <Truck className="h-3 w-3 text-muted-foreground" />
                              {providerName}
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                          </td>
                          <td className="p-3 font-medium">{fmt(Number(sr.charged_amount || 0))}</td>
                          <td className="p-3 whitespace-nowrap">
                            <span className="flex items-center gap-1 text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              {tempoTotal}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {new Date(sr.created_at).toLocaleDateString("pt-BR")}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${sr.id}-detail`} className="bg-muted/10">
                            <td colSpan={9} className="p-5">
                              <div className="flex flex-col md:flex-row gap-6">
                                {/* Timeline Stepper */}
                                <div className="md:w-64 shrink-0">
                                  <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                                    Cronologia
                                  </p>
                                  <TimelineStep
                                    label="Acionamento"
                                    time={sr.created_at}
                                    icon={<PhoneCall className="h-4 w-4" />}
                                    isActive={!dispatch?.accepted_at}
                                  />
                                  <TimelineStep
                                    label="Atribuição ao Prestador"
                                    time={dispatch?.accepted_at || null}
                                    icon={<Truck className="h-4 w-4" />}
                                    isActive={!!dispatch?.accepted_at && !dispatch?.provider_arrived_at}
                                  />
                                  <TimelineStep
                                    label="Início do Atendimento"
                                    time={dispatch?.provider_arrived_at || null}
                                    icon={<MapPin className="h-4 w-4" />}
                                    isActive={!!dispatch?.provider_arrived_at && !sr.completed_at}
                                  />
                                  <TimelineStep
                                    label="Finalização"
                                    time={sr.completed_at || null}
                                    icon={<CheckCircle2 className="h-4 w-4" />}
                                    isLast
                                    isActive={!!sr.completed_at}
                                  />
                                  {sr.completed_at && (
                                    <div className="mt-3 p-2 rounded-md bg-primary/10 text-center">
                                      <p className="text-xs text-muted-foreground">Tempo Total</p>
                                      <p className="text-sm font-bold text-primary">{tempoTotal}</p>
                                    </div>
                                  )}
                                </div>

                                {/* Details */}
                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1 font-medium">Solicitante</p>
                                    <p>{sr.requester_name}</p>
                                    <p className="text-muted-foreground">{sr.requester_phone}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1 font-medium">Prestador</p>
                                    <p className="font-medium">{providerName}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1 font-medium">Origem</p>
                                    <p>{sr.origin_address || "Não informado"}</p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground mb-1 font-medium">Destino</p>
                                    <p>{sr.destination_address || "Não informado"}</p>
                                  </div>
                                  {sr.notes && (
                                    <div className="sm:col-span-2">
                                      <p className="text-xs text-muted-foreground mb-1 font-medium">Observações</p>
                                      <p className="text-muted-foreground">{sr.notes}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
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
