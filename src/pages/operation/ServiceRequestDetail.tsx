import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, User, Car, MapPin, AlertTriangle, ClipboardCheck, FileText,
  Share2, Truck, XCircle, PlayCircle, CheckCircle2, Loader2,
} from "lucide-react";
import RouteMap, { type RoutePoint } from "@/components/RouteMap";
import { toast } from "sonner";

const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  open: { label: "Aberto", variant: "default" },
  awaiting_dispatch: { label: "Aguardando Acionamento", variant: "outline" },
  dispatched: { label: "Acionado", variant: "secondary" },
  in_progress: { label: "Em Andamento", variant: "default" },
  completed: { label: "Finalizado", variant: "secondary" },
  cancelled: { label: "Cancelado", variant: "destructive" },
  refunded: { label: "Reembolso", variant: "destructive" },
};

const serviceTypeMap: Record<string, string> = {
  tow_light: "Reboque Leve",
  tow_heavy: "Reboque Pesado",
  tow_motorcycle: "Reboque Moto",
  locksmith: "Chaveiro",
  tire_change: "Troca de Pneu",
  battery: "Bateria",
  fuel: "Combustível",
  lodging: "Hospedagem",
  other: "Outro",
};

const eventTypeMap: Record<string, string> = {
  mechanical_failure: "Pane Mecânica",
  accident: "Acidente",
  theft: "Roubo/Furto",
  flat_tire: "Pneu Furado",
  locked_out: "Chave Trancada",
  battery_dead: "Bateria Descarregada",
  fuel_empty: "Sem Combustível",
  other: "Outro",
};

const categoryMap: Record<string, string> = {
  car: "Carro",
  motorcycle: "Moto",
  truck: "Caminhão",
};

const verificationLabels: Record<string, string> = {
  wheel_locked: "Alguma roda travada ou veículo não se movimenta?",
  steering_locked: "Direção travada?",
  armored: "Veículo blindado?",
  vehicle_lowered: "Veículo rebaixado?",
  carrying_cargo: "Transportando carga ou excesso de peso?",
  cargo_description: "Tipo de carga",
  easy_access: "Nível de rua e local de fácil acesso?",
  vehicle_location: "Local do veículo",
  vehicle_location_other: "Descrição do local",
  height_restriction: "Restrição de altura?",
  height_restriction_value: "Altura da restrição",
  key_available: "Chave disponível?",
  documents_available: "Documentos no local?",
  has_passengers: "Passageiros no veículo?",
  passenger_count: "Quantidade de passageiros",
  had_collision: "Sofreu colisão?",
  risk_area: "Área de risco ou emergencial?",
  vehicle_starts: "Veículo liga?",
  on_kickstand: "Na cavalete/descanso?",
  fallen_over: "Caída no chão?",
  has_sidecar: "Possui sidecar/baú?",
  truck_type: "Tipo de caminhão",
  truck_type_other: "Descrição do tipo",
  has_trailer: "Possui carreta/reboque?",
  trailer_type: "Tipo de carreta",
  total_weight: "Peso total estimado",
  axle_count: "Quantidade de eixos",
  special_cargo: "Carga especial?",
  special_cargo_description: "Descrição da carga especial",
  needs_crane: "Necessita guincho/munck?",
};

const vehicleLocationLabels: Record<string, string> = {
  underground_garage: "Garagem subterrânea",
  parking: "Estacionamento",
  highway: "Rodovia",
  difficult_access: "Local de difícil acesso",
  other: "Outro",
};

function formatValue(key: string, value: string): string {
  if (!value) return "—";
  if (value === "yes") return "Sim";
  if (value === "no") return "Não";
  if (key === "vehicle_location") return vehicleLocationLabels[value] || value;
  return value;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2">
      <span className="text-sm text-muted-foreground sm:w-48 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

// Status flow: which statuses can transition to which
const statusTransitions: Record<string, string[]> = {
  open: ["awaiting_dispatch", "in_progress", "cancelled"],
  awaiting_dispatch: ["dispatched", "in_progress", "cancelled"],
  dispatched: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["refunded"],
  cancelled: [],
  refunded: [],
};

export default function ServiceRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [request, setRequest] = useState<any>(null);
  const [beneficiary, setBeneficiary] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [dispatchId, setDispatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Action modals
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [quotedAmount, setQuotedAmount] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("service_requests")
      .select("*, clients(name), plans(name)")
      .eq("id", id)
      .maybeSingle();
    setRequest(data);

    if (data?.beneficiary_id) {
      const { data: ben } = await supabase
        .from("beneficiaries")
        .select("*, clients(name), plans(name)")
        .eq("id", data.beneficiary_id)
        .maybeSingle();
      setBeneficiary(ben);
    }

    if (data) {
      const { data: dispatch } = await supabase
        .from("dispatches")
        .select("*, providers(name, latitude, longitude, street, address_number, neighborhood, city, state)")
        .eq("service_request_id", data.id)
        .in("status", ["accepted", "completed", "sent", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dispatch) {
        setDispatchId(dispatch.id);
        if ((dispatch as any).providers) {
          setProvider((dispatch as any).providers);
        }
      } else {
        setDispatchId(null);
        setProvider(null);
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load providers list for dispatch dialog
  const loadProviders = useCallback(async () => {
    const { data } = await supabase
      .from("providers")
      .select("id, name, phone, city, state, services")
      .eq("active", true)
      .order("name");
    setProviders(data || []);
  }, []);

  // --- Actions ---
  const handleStatusChange = async () => {
    if (!newStatus || !id) return;
    setActionLoading(true);
    const updates: any = { status: newStatus };
    if (newStatus === "completed") updates.completed_at = new Date().toISOString();
    const { error } = await supabase.from("service_requests").update(updates).eq("id", id);
    setActionLoading(false);
    if (error) {
      toast.error("Erro ao alterar status", { description: error.message });
    } else {
      toast.success("Status alterado!", { description: `Novo status: ${statusMap[newStatus]?.label || newStatus}` });
      setStatusDialogOpen(false);
      loadData();
    }
  };

  const handleCancel = async () => {
    if (!id) return;
    setActionLoading(true);
    const { error } = await supabase
      .from("service_requests")
      .update({ status: "cancelled", notes: request.notes ? `${request.notes}\n\n[CANCELAMENTO] ${cancelReason}` : `[CANCELAMENTO] ${cancelReason}` })
      .eq("id", id);
    setActionLoading(false);
    if (error) {
      toast.error("Erro ao cancelar", { description: error.message });
    } else {
      toast.success("Atendimento cancelado");
      setCancelDialogOpen(false);
      setCancelReason("");
      loadData();
    }
  };

  const handleDispatch = async () => {
    if (!selectedProviderId || !id) return;
    setActionLoading(true);
    const { data: newDispatch, error: dErr } = await supabase.from("dispatches").insert({
      service_request_id: id,
      provider_id: selectedProviderId,
      quoted_amount: quotedAmount ? parseFloat(quotedAmount) : null,
      notes: dispatchNotes || null,
      status: "sent",
    }).select("id").single();

    if (dErr) {
      setActionLoading(false);
      toast.error("Erro ao acionar prestador", { description: dErr.message });
      return;
    }

    // Update request status to dispatched
    await supabase.from("service_requests").update({ status: "dispatched" }).eq("id", id);
    setActionLoading(false);
    toast.success("Prestador acionado!", { description: "O acionamento foi registrado." });
    setDispatchDialogOpen(false);
    setSelectedProviderId("");
    setQuotedAmount("");
    setDispatchNotes("");
    loadData();
  };

  // Build route points
  const routePoints = useMemo<RoutePoint[]>(() => {
    if (!request) return [];
    const pts: RoutePoint[] = [];
    const hasOrigin = request.origin_lat && request.origin_lng;
    const hasDest = request.destination_lat && request.destination_lng;
    const hasProvider = provider?.latitude && provider?.longitude;

    if (!hasOrigin && !hasDest) return [];

    const providerLabel = provider?.name || "Prestador";

    if (hasProvider) {
      pts.push({ label: `${providerLabel} (saída)`, lat: provider.latitude, lng: provider.longitude, color: "#6366f1" });
    }
    if (hasOrigin) {
      pts.push({ label: "Origem", lat: request.origin_lat, lng: request.origin_lng, color: "#22c55e" });
    }
    if (hasDest) {
      pts.push({ label: "Destino", lat: request.destination_lat, lng: request.destination_lng, color: "#ef4444" });
    }
    if (hasProvider) {
      pts.push({ label: `${providerLabel} (retorno)`, lat: provider.latitude, lng: provider.longitude, color: "#6366f1" });
    }

    return pts;
  }, [request, provider]);

  if (loading) return <div className="p-8 text-muted-foreground">Carregando...</div>;
  if (!request) return <div className="p-8 text-muted-foreground">Atendimento não encontrado.</div>;

  const st = statusMap[request.status] || statusMap.open;
  const verification = request.verification_answers as Record<string, any> | null;
  const verificationCategory = verification?.category || request.vehicle_category || "car";
  const verificationEntries = verification
    ? Object.entries(verification).filter(([k, v]) => k !== "category" && v !== "" && v !== null && v !== undefined)
    : [];

  const canChangeStatus = (statusTransitions[request.status] || []).length > 0;
  const canCancel = request.status !== "cancelled" && request.status !== "completed" && request.status !== "refunded";
  const canDispatch = ["open", "awaiting_dispatch"].includes(request.status);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/operation/requests")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{request.protocol}</h1>
            <Badge variant={st.variant}>{st.label}</Badge>
            <Badge variant="outline">{categoryMap[request.vehicle_category] || "Carro"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Criado em {new Date(request.created_at).toLocaleDateString("pt-BR")} às {new Date(request.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        {dispatchId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => {
              const url = `${window.location.origin}/nav/${dispatchId}`;
              navigator.clipboard.writeText(url);
              toast.success("Link copiado!", { description: "Envie para o prestador via WhatsApp." });
            }}
          >
            <Share2 className="h-4 w-4" />
            Copiar link prestador
          </Button>
        )}
      </div>

      {/* Action Buttons */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2">
            {canDispatch && (
              <Button
                className="gap-2"
                onClick={() => {
                  loadProviders();
                  setDispatchDialogOpen(true);
                }}
              >
                <Truck className="h-4 w-4" />
                Acionar Prestador
              </Button>
            )}
            {canChangeStatus && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  setNewStatus("");
                  setStatusDialogOpen(true);
                }}
              >
                <PlayCircle className="h-4 w-4" />
                Alterar Status
              </Button>
            )}
            {canCancel && (
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => setCancelDialogOpen(true)}
              >
                <XCircle className="h-4 w-4" />
                Cancelar Atendimento
              </Button>
            )}
          </div>

          {/* Dispatch info */}
          {provider && (
            <div className="mt-3 p-3 rounded-md border bg-muted/50">
              <p className="text-sm font-medium flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Prestador acionado: <span className="text-primary">{provider.name}</span>
              </p>
              {provider.city && (
                <p className="text-xs text-muted-foreground mt-1">
                  {provider.city}{provider.state ? ` - ${provider.state}` : ""}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Requester */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-5 w-5" /> DADOS DO SOLICITANTE
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="Nome" value={request.requester_name} />
            <InfoRow label="Telefone" value={request.requester_phone} />
            <InfoRow label="Email" value={request.requester_email} />
            <InfoRow label="Telefone Secundário" value={request.requester_phone_secondary} />
          </div>
          {beneficiary && (
            <>
              <Separator className="my-4" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Beneficiário vinculado</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                  <InfoRow label="Nome" value={beneficiary.name} />
                  <InfoRow label="CPF" value={beneficiary.cpf} />
                  <InfoRow label="Cliente" value={(beneficiary as any).clients?.name} />
                  <InfoRow label="Plano" value={(beneficiary as any).plans?.name} />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Vehicle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Car className="h-5 w-5" /> VEÍCULO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8">
            <InfoRow label="Placa" value={request.vehicle_plate} />
            <InfoRow label="Modelo" value={request.vehicle_model} />
            <InfoRow label="Ano" value={request.vehicle_year} />
          </div>
        </CardContent>
      </Card>

      {/* Event & Service */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-5 w-5" /> MOTIVO DA PANE / SERVIÇO
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="Motivo da Pane" value={eventTypeMap[request.event_type] || request.event_type} />
            <InfoRow label="Tipo de Serviço" value={serviceTypeMap[request.service_type] || request.service_type} />
          </div>
        </CardContent>
      </Card>

      {/* Verification Checklist */}
      {verificationEntries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="h-5 w-5" /> VERIFICAÇÃO DO VEÍCULO ({categoryMap[verificationCategory] || verificationCategory})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {verificationEntries.map(([key, value]) => (
                <InfoRow
                  key={key}
                  label={verificationLabels[key] || key}
                  value={
                    <span className={value === "yes" ? "text-destructive font-semibold" : ""}>
                      {formatValue(key, String(value))}
                    </span>
                  }
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Addresses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-5 w-5" /> ENDEREÇOS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="Endereço de Origem" value={request.origin_address} />
            <InfoRow label="Endereço de Destino" value={request.destination_address} />
          </div>
        </CardContent>
      </Card>

      {/* Route Map */}
      {routePoints.length >= 2 && <RouteMap points={routePoints} />}

      {/* Notes */}
      {request.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5" /> OBSERVAÇÕES
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{request.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Financial */}
      {(request.provider_cost > 0 || request.charged_amount > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">FINANCEIRO</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              <InfoRow label="Custo Prestador" value={`R$ ${Number(request.provider_cost || 0).toFixed(2)}`} />
              <InfoRow label="Valor Cobrado" value={`R$ ${Number(request.charged_amount || 0).toFixed(2)}`} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- DIALOGS ---- */}

      {/* Status Change Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Status</DialogTitle>
            <DialogDescription>
              Status atual: <strong>{st.label}</strong>. Selecione o novo status:
            </DialogDescription>
          </DialogHeader>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o novo status" />
            </SelectTrigger>
            <SelectContent>
              {(statusTransitions[request.status] || []).map((s) => (
                <SelectItem key={s} value={s}>{statusMap[s]?.label || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleStatusChange} disabled={!newStatus || actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Atendimento</DialogTitle>
            <DialogDescription>
              Esta ação irá cancelar o atendimento <strong>{request.protocol}</strong>. Informe o motivo:
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Motivo do cancelamento..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={!cancelReason.trim() || actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispatch Dialog */}
      <Dialog open={dispatchDialogOpen} onOpenChange={setDispatchDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Acionar Prestador</DialogTitle>
            <DialogDescription>
              Selecione o prestador e informe os detalhes do acionamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Prestador *</Label>
              <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o prestador" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} {p.city ? `— ${p.city}/${p.state}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Valor Orçado (R$)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={quotedAmount}
                onChange={(e) => setQuotedAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Instruções para o prestador..."
                value={dispatchNotes}
                onChange={(e) => setDispatchNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispatchDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleDispatch} disabled={!selectedProviderId || actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Acionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
