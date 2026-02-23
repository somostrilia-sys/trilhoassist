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
  Share2, Truck, XCircle, PlayCircle, CheckCircle2, Loader2, Clock, History,
  FilePlus2, RotateCcw, Send, Camera, Mic, Video, File, Link as LinkIcon,
  DollarSign, CalendarIcon, AlertCircle, Search, ChevronsUpDown, Check,
} from "lucide-react";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup } from "@/components/ui/command";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import RouteMap, { type RoutePoint } from "@/components/RouteMap";
import { toast } from "sonner";
import CollisionMediaUpload from "@/components/collision/CollisionMediaUpload";
import { sendServiceLabel } from "@/lib/serviceLabel";
import { sendAutoNotify } from "@/lib/autoNotify";
import { maskPhone, maskCPF, maskCNPJ, maskCEP, unmask } from "@/lib/masks";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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
  collision: "Colisão",
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
  cancelled: ["open"],
  refunded: [],
};

export default function ServiceRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [request, setRequest] = useState<any>(null);
  const [beneficiary, setBeneficiary] = useState<any>(null);
  const [provider, setProvider] = useState<any>(null);
  const [dispatchId, setDispatchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);

  // Action modals
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [dispatchDialogOpen, setDispatchDialogOpen] = useState(false);
  const [providers, setProviders] = useState<any[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("");
  const [quotedAmount, setQuotedAmount] = useState("");
  const [chargedAmount, setChargedAmount] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [dispatchMode, setDispatchMode] = useState<"existing" | "quick">("existing");
  const [quickProvider, setQuickProvider] = useState({
    name: "", document: "", phone: "", cep: "", street: "", address_number: "",
    neighborhood: "", city: "", state: "",
  });
  const [providerSearch, setProviderSearch] = useState("");
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [collisionMedia, setCollisionMedia] = useState<any[]>([]);

  const logEvent = useCallback(async (eventType: string, description: string, oldValue?: string, newValue?: string) => {
    if (!id) return;
    await supabase.from("service_request_events").insert({
      service_request_id: id,
      event_type: eventType,
      description,
      old_value: oldValue || null,
      new_value: newValue || null,
      user_id: user?.id || null,
    });
  }, [id, user?.id]);

  const loadEvents = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("service_request_events")
      .select("*")
      .eq("service_request_id", id)
      .order("created_at", { ascending: false });
    const eventsData = data || [];

    // Fetch operator names from profiles
    const userIds = [...new Set(eventsData.map(e => e.user_id).filter(Boolean))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds as string[]);
      const nameMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);
      setEvents(eventsData.map(e => ({ ...e, _operator_name: e.user_id ? nameMap.get(e.user_id) || null : null })));
    } else {
      setEvents(eventsData.map(e => ({ ...e, _operator_name: null })));
    }
  }, [id]);

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

  const loadCollisionMedia = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("collision_media")
      .select("*")
      .eq("service_request_id", id)
      .order("created_at");
    setCollisionMedia(data || []);
  }, [id]);

  useEffect(() => { loadData(); loadEvents(); loadCollisionMedia(); }, [loadData, loadEvents, loadCollisionMedia]);

  // Load providers list for dispatch dialog, sorted by proximity to origin
  const loadProviders = useCallback(async () => {
    const { data } = await supabase
      .from("providers")
      .select("id, name, phone, city, state, services, latitude, longitude")
      .eq("active", true)
      .order("name");
    let list = data || [];

    // Sort by distance to origin if available
    const oLat = request?.origin_lat;
    const oLng = request?.origin_lng;
    if (oLat && oLng) {
      const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };
      list = list.map(p => ({
        ...p,
        _distance: p.latitude && p.longitude ? haversine(oLat, oLng, p.latitude, p.longitude) : 99999,
      })).sort((a, b) => (a as any)._distance - (b as any)._distance);
    }
    setProviders(list);
  }, [request?.origin_lat, request?.origin_lng]);

  // --- Actions ---
  const handleStatusChange = async () => {
    if (!newStatus || !id) return;
    setActionLoading(true);
    const oldStatus = request.status;
    const updates: any = { status: newStatus };
    if (newStatus === "completed") updates.completed_at = new Date().toISOString();
    const { error } = await supabase.from("service_requests").update(updates).eq("id", id);
    setActionLoading(false);
    if (error) {
      toast.error("Erro ao alterar status", { description: error.message });
    } else {
      await logEvent("status_change", `Status alterado de ${statusMap[oldStatus]?.label || oldStatus} para ${statusMap[newStatus]?.label || newStatus}`, oldStatus, newStatus);
      // Send completion label to group
      if (newStatus === "completed") {
        sendServiceLabel(id, "completion");
        // Send NPS/completion message to beneficiary with NPS link
        const npsUrl = request.beneficiary_token
          ? `${window.location.origin}/nps/${request.beneficiary_token}`
          : undefined;
        sendAutoNotify(id, "beneficiary_completion", { nps_link: npsUrl });
      }
      toast.success("Status alterado!", { description: `Novo status: ${statusMap[newStatus]?.label || newStatus}` });
      setStatusDialogOpen(false);
      loadData();
      loadEvents();
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
      await logEvent("cancel", `Atendimento cancelado. Motivo: ${cancelReason}`, request.status, "cancelled");
      // Send cancellation label
      sendServiceLabel(id, "cancellation", { cancel_reason: cancelReason });
      toast.success("Atendimento cancelado");
      setCancelDialogOpen(false);
      setCancelReason("");
      loadData();
      loadEvents();
    }
  };

  const handleDispatch = async () => {
    if (dispatchMode === "existing" && !selectedProviderId) return;
    if (dispatchMode === "quick" && (!quickProvider.name.trim() || !quickProvider.phone.trim())) {
      toast.error("Preencha os campos obrigatórios", { description: "Razão Social e Telefone são obrigatórios para cadastro rápido." });
      return;
    }
    if (!quotedAmount || !chargedAmount) {
      toast.error("Preencha os valores obrigatórios", { description: "Valor do Prestador e Valor Cobrado são obrigatórios." });
      return;
    }
    setActionLoading(true);

    let finalProviderId = selectedProviderId;
    let finalProviderName = providers.find(p => p.id === selectedProviderId)?.name || "Prestador";
    let finalProviderPhone = providers.find(p => p.id === selectedProviderId)?.phone || "";

    // Quick registration flow
    if (dispatchMode === "quick") {
      // Geocode address if provided
      let lat: number | null = null;
      let lng: number | null = null;
      if (quickProvider.street && quickProvider.city) {
        try {
          const addr = `${quickProvider.street} ${quickProvider.address_number}, ${quickProvider.neighborhood}, ${quickProvider.city}, ${quickProvider.state}, Brazil`;
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}&limit=1`);
          const geo = await res.json();
          if (geo?.[0]) { lat = parseFloat(geo[0].lat); lng = parseFloat(geo[0].lon); }
        } catch { /* ignore geocoding errors */ }
      }

      const doc = unmask(quickProvider.document);
      const { data: newProv, error: provErr } = await supabase.from("providers").insert({
        name: quickProvider.name.trim(),
        cnpj: doc || null,
        phone: unmask(quickProvider.phone),
        street: quickProvider.street || null,
        address_number: quickProvider.address_number || null,
        neighborhood: quickProvider.neighborhood || null,
        city: quickProvider.city || null,
        state: quickProvider.state || null,
        zip_code: unmask(quickProvider.cep) || null,
        latitude: lat,
        longitude: lng,
        tenant_id: request.tenant_id,
        active: true,
      }).select("id").single();

      if (provErr) {
        setActionLoading(false);
        toast.error("Erro ao cadastrar prestador", { description: provErr.message });
        return;
      }
      finalProviderId = newProv.id;
      finalProviderName = quickProvider.name.trim();
      finalProviderPhone = unmask(quickProvider.phone);
    }

    // Generate tokens
    const providerToken = crypto.randomUUID();
    const beneficiaryToken = crypto.randomUUID();

    const { data: newDispatch, error: dErr } = await supabase.from("dispatches").insert({
      service_request_id: id,
      provider_id: finalProviderId,
      quoted_amount: quotedAmount ? parseFloat(quotedAmount) : null,
      notes: dispatchNotes || null,
      status: "sent",
      provider_token: providerToken,
    }).select("id").single();

    if (dErr) {
      setActionLoading(false);
      toast.error("Erro ao acionar prestador", { description: dErr.message });
      return;
    }

    // Update service request with beneficiary token and financial values
    await supabase.from("service_requests").update({
      status: "dispatched",
      beneficiary_token: beneficiaryToken,
      provider_cost: parseFloat(quotedAmount),
      charged_amount: parseFloat(chargedAmount),
    }).eq("id", id);

    await logEvent("dispatch", `Prestador acionado: ${finalProviderName} — Valor Prestador: R$ ${parseFloat(quotedAmount).toFixed(2)} — Valor Cobrado: R$ ${parseFloat(chargedAmount).toFixed(2)}${dispatchMode === "quick" ? " (cadastro rápido)" : ""}`, request.status, "dispatched");

    // Send WhatsApp tracking links via auto-notify (fire and forget)
    const baseUrl = window.location.origin;
    const providerTrackingUrl = `${baseUrl}/tracking/provider/${providerToken}`;
    const beneficiaryTrackingUrl = `${baseUrl}/tracking/${beneficiaryToken}`;

    // Notify provider via WhatsApp with tracking link
    if (finalProviderPhone) {
      sendAutoNotify(id!, "provider_dispatch", {
        provider_name: finalProviderName,
        provider_phone: finalProviderPhone,
        provider_tracking_url: providerTrackingUrl,
      });
    }

    // Notify beneficiary via WhatsApp: "prestador a caminho"
    sendAutoNotify(id!, "beneficiary_dispatch", {
      provider_name: finalProviderName,
      estimated_arrival_min: undefined,
      beneficiary_tracking_url: beneficiaryTrackingUrl,
    });

    // Send dispatch preview label to client WhatsApp group
    sendServiceLabel(id!, "dispatch_preview", {
      provider_id: finalProviderId,
      quoted_amount: parseFloat(chargedAmount),
    });

    setActionLoading(false);
    toast.success("Prestador acionado!", { description: dispatchMode === "quick" ? "Prestador cadastrado e acionado. Links enviados via WhatsApp." : "Links de rastreamento enviados via WhatsApp." });
    setDispatchDialogOpen(false);
    setSelectedProviderId("");
    setQuotedAmount("");
    setChargedAmount("");
    setDispatchNotes("");
    setDispatchMode("existing");
    setQuickProvider({ name: "", document: "", phone: "", cep: "", street: "", address_number: "", neighborhood: "", city: "", state: "" });
    loadData();
    loadEvents();
  };

  const handleReopen = async () => {
    if (!id || !reopenReason.trim()) return;
    setActionLoading(true);
    const { error } = await supabase
      .from("service_requests")
      .update({ status: "open", notes: request.notes ? `${request.notes}\n\n[REABERTURA] ${reopenReason}` : `[REABERTURA] ${reopenReason}` })
      .eq("id", id);
    setActionLoading(false);
    if (error) {
      toast.error("Erro ao reabrir", { description: error.message });
    } else {
      await logEvent("reopen", `Atendimento reaberto. Motivo: ${reopenReason}`, "cancelled", "open");
      toast.success("Atendimento reaberto!");
      setReopenDialogOpen(false);
      setReopenReason("");
      loadData();
      loadEvents();
    }
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
  const canReopen = request.status === "cancelled";

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
        {request.service_type === "collision" && request.share_token && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => {
              const url = `${window.location.origin}/collision/${request.share_token}`;
              navigator.clipboard.writeText(url);
              toast.success("Link da colisão copiado!", { description: "Compartilhe com o setor responsável." });
            }}
          >
            <LinkIcon className="h-4 w-4" />
            Copiar link colisão
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
            {canReopen && (
              <Button
                variant="outline"
                className="gap-2 border-primary text-primary hover:bg-primary/10"
                onClick={() => setReopenDialogOpen(true)}
              >
                <RotateCcw className="h-4 w-4" />
                Reabrir Atendimento
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

      {/* Collision Media */}
      {request.service_type === "collision" && (
        <>
          {/* Existing media display */}
          {collisionMedia.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Camera className="h-5 w-5" /> MÍDIAS DA COLISÃO ({collisionMedia.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Photos */}
                {collisionMedia.filter(m => m.file_type === "photo").length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Fotos</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {collisionMedia.filter(m => m.file_type === "photo").map((m: any) => (
                        <a key={m.id} href={m.file_url} target="_blank" rel="noopener noreferrer">
                          <img src={m.file_url} alt={m.file_name} className="w-full h-28 object-cover rounded-lg border hover:opacity-90 transition-opacity" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {/* Videos */}
                {collisionMedia.filter(m => m.file_type === "video").length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Vídeos</p>
                    {collisionMedia.filter(m => m.file_type === "video").map((m: any) => (
                      <video key={m.id} controls className="w-full rounded-lg border mb-2" preload="metadata">
                        <source src={m.file_url} type={m.mime_type || "video/mp4"} />
                      </video>
                    ))}
                  </div>
                )}
                {/* Audios */}
                {collisionMedia.filter(m => m.file_type === "audio").length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Áudios</p>
                    {collisionMedia.filter(m => m.file_type === "audio").map((m: any) => (
                      <div key={m.id} className="flex items-center gap-2 mb-2">
                        <audio controls className="flex-1"><source src={m.file_url} type={m.mime_type || "audio/mpeg"} /></audio>
                        <span className="text-xs text-muted-foreground">{m.file_name}</span>
                      </div>
                    ))}
                  </div>
                )}
                {/* Documents */}
                {collisionMedia.filter(m => m.file_type === "document").length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Documentos</p>
                    {collisionMedia.filter(m => m.file_type === "document").map((m: any) => (
                      <a key={m.id} href={m.file_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 p-2 rounded border hover:bg-muted/50 mb-1">
                        <File className="h-4 w-4 text-primary" />
                        <span className="text-sm truncate">{m.file_name}</span>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Upload more media */}
          <CollisionMediaUpload
            serviceRequestId={request.id}
            onMediaChange={() => loadCollisionMedia()}
          />
        </>
      )}

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

      {/* Financial & Payment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-5 w-5" /> FINANCEIRO
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="Custo Prestador" value={`R$ ${Number(request.provider_cost || 0).toFixed(2)}`} />
            <InfoRow label="Valor Cobrado" value={`R$ ${Number(request.charged_amount || 0).toFixed(2)}`} />
          </div>
          {/* Overdue payment alert */}
          {request.payment_method === "invoiced" && !request.payment_received_at && request.status === "completed" && (() => {
            const termDays = parseInt(request.payment_term || "0", 10);
            if (!termDays || !request.completed_at) return null;
            const dueDate = new Date(request.completed_at);
            dueDate.setDate(dueDate.getDate() + termDays);
            const now = new Date();
            if (now > dueDate) {
              const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
              return (
                <Alert variant="destructive" className="mt-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Pagamento faturado vencido há <strong>{overdueDays} dia{overdueDays !== 1 ? "s" : ""}</strong> (vencimento: {format(dueDate, "dd/MM/yyyy")}). Nenhum recebimento registrado.
                  </AlertDescription>
                </Alert>
              );
            }
            const remainingDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (remainingDays <= 5) {
              return (
                <Alert className="mt-2 border-yellow-500/50 bg-yellow-50 text-yellow-800 dark:border-yellow-500/30 dark:bg-yellow-950 dark:text-yellow-200">
                  <Clock className="h-4 w-4" />
                  <AlertDescription>
                    Pagamento faturado vence em <strong>{remainingDays} dia{remainingDays !== 1 ? "s" : ""}</strong> ({format(dueDate, "dd/MM/yyyy")}). Nenhum recebimento registrado.
                  </AlertDescription>
                </Alert>
              );
            }
            return null;
          })()}
          <Separator />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Payment Method */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Forma de Pagamento</Label>
              <Select
                value={request.payment_method || ""}
                onValueChange={async (val) => {
                  const { error } = await supabase
                    .from("service_requests")
                    .update({ payment_method: val })
                    .eq("id", id!);
                  if (error) {
                    toast.error("Erro ao salvar", { description: error.message });
                  } else {
                    await logEvent("payment_update", `Forma de pagamento definida: ${val === "cash" ? "À vista" : "Faturado"}`);
                    toast.success("Forma de pagamento atualizada");
                    loadData();
                    loadEvents();
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">À vista</SelectItem>
                  <SelectItem value="invoiced">Faturado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* Payment Term */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Prazo de Pagamento</Label>
              <Input
                placeholder="Ex: 30 dias, 15/30..."
                defaultValue={request.payment_term || ""}
                onBlur={async (e) => {
                  const val = e.target.value.trim();
                  if (val === (request.payment_term || "")) return;
                  const { error } = await supabase
                    .from("service_requests")
                    .update({ payment_term: val || null })
                    .eq("id", id!);
                  if (error) {
                    toast.error("Erro ao salvar", { description: error.message });
                  } else {
                    if (val) await logEvent("payment_update", `Prazo de pagamento definido: ${val}`);
                    toast.success("Prazo atualizado");
                    loadData();
                    loadEvents();
                  }
                }}
              />
            </div>
            {/* Payment Received Date */}
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Data de Recebimento</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !request.payment_received_at && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {request.payment_received_at
                      ? format(new Date(request.payment_received_at), "dd/MM/yyyy")
                      : "Selecione a data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={request.payment_received_at ? new Date(request.payment_received_at) : undefined}
                    onSelect={async (date) => {
                      const val = date ? date.toISOString() : null;
                      const { error } = await supabase
                        .from("service_requests")
                        .update({ payment_received_at: val })
                        .eq("id", id!);
                      if (error) {
                        toast.error("Erro ao salvar", { description: error.message });
                      } else {
                        if (date) await logEvent("payment_update", `Data de recebimento definida: ${format(date, "dd/MM/yyyy")}`);
                        toast.success("Data de recebimento atualizada");
                        loadData();
                        loadEvents();
                      }
                    }}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline / History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-5 w-5" /> HISTÓRICO DE EVENTOS
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-4">
                {events.map((evt, idx) => {
                  const iconMap: Record<string, React.ReactNode> = {
                    creation: <FilePlus2 className="h-4 w-4 text-green-600" />,
                    status_change: <PlayCircle className="h-4 w-4 text-primary" />,
                    dispatch: <Truck className="h-4 w-4 text-info" />,
                    cancel: <XCircle className="h-4 w-4 text-destructive" />,
                    reopen: <RotateCcw className="h-4 w-4 text-primary" />,
                    note: <FileText className="h-4 w-4 text-muted-foreground" />,
                  };
                  return (
                    <div key={evt.id} className="flex gap-3 relative">
                      <div className="flex items-center justify-center w-[30px] h-[30px] rounded-full bg-card border border-border z-10 shrink-0">
                        {iconMap[evt.event_type] || <Clock className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="text-sm font-medium">{evt.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(evt.created_at).toLocaleDateString("pt-BR")} às {new Date(evt.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          {(evt as any)._operator_name && (
                            <span className="ml-2">— por <span className="font-medium text-foreground">{(evt as any)._operator_name}</span></span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add note form */}
          <Separator className="my-4" />
          <div className="flex gap-2">
            <Textarea
              placeholder="Adicionar observação ao histórico..."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              className="flex-1 resize-none"
              maxLength={500}
            />
            <Button
              size="icon"
              className="shrink-0 self-end"
              disabled={!noteText.trim() || noteLoading}
              onClick={async () => {
                if (!noteText.trim() || !id) return;
                setNoteLoading(true);
                await logEvent("note", noteText.trim());
                setNoteText("");
                setNoteLoading(false);
                loadEvents();
                toast.success("Observação adicionada");
              }}
            >
              {noteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

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
      <Dialog open={dispatchDialogOpen} onOpenChange={(open) => {
        setDispatchDialogOpen(open);
        if (!open) {
          setDispatchMode("existing");
          setQuickProvider({ name: "", document: "", phone: "", cep: "", street: "", address_number: "", neighborhood: "", city: "", state: "" });
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Acionar Prestador</DialogTitle>
            <DialogDescription>
              Selecione um prestador cadastrado ou faça um cadastro rápido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs value={dispatchMode} onValueChange={(v) => setDispatchMode(v as "existing" | "quick")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">Selecionar Existente</TabsTrigger>
                <TabsTrigger value="quick">Cadastro Rápido</TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Prestador *</Label>
                  <Popover open={providerDropdownOpen} onOpenChange={setProviderDropdownOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                        {selectedProviderId
                          ? (() => {
                              const p = providers.find(p => p.id === selectedProviderId);
                              return p ? `${p.name}${p.city ? ` — ${p.city}/${p.state}` : ""}` : "Selecione...";
                            })()
                          : "Buscar prestador..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar por nome ou cidade..." />
                        <CommandList>
                          <CommandEmpty>Nenhum prestador encontrado.</CommandEmpty>
                          <CommandGroup>
                            {providers.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.name} ${p.city || ""} ${p.state || ""}`}
                                onSelect={() => {
                                  setSelectedProviderId(p.id);
                                  setProviderDropdownOpen(false);
                                }}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedProviderId === p.id ? "opacity-100" : "opacity-0")} />
                                <div className="flex flex-col">
                                  <span>{p.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {p.city ? `${p.city}/${p.state}` : "Sem cidade"}
                                    {(p as any)._distance != null && (p as any)._distance < 99999 && ` — ${(p as any)._distance.toFixed(1)} km`}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </TabsContent>

              <TabsContent value="quick" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Razão Social / Nome *</Label>
                  <Input
                    placeholder="Nome ou razão social do prestador"
                    value={quickProvider.name}
                    onChange={(e) => setQuickProvider(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>CPF ou CNPJ</Label>
                    <Input
                      placeholder="000.000.000-00"
                      value={quickProvider.document}
                      onChange={(e) => {
                        const raw = unmask(e.target.value);
                        const masked = raw.length <= 11 ? maskCPF(e.target.value) : maskCNPJ(e.target.value);
                        setQuickProvider(p => ({ ...p, document: masked }));
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone *</Label>
                    <Input
                      placeholder="(00) 00000-0000"
                      value={quickProvider.phone}
                      onChange={(e) => setQuickProvider(p => ({ ...p, phone: maskPhone(e.target.value) }))}
                    />
                  </div>
                </div>
                <Separator />
                <p className="text-xs text-muted-foreground">
                  Endereço <span className="font-medium">(opcional)</span> — para roteirização. Se não informado, será calculado origem → destino → origem + 10km.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input
                      placeholder="00000-000"
                      value={quickProvider.cep}
                      onChange={(e) => setQuickProvider(p => ({ ...p, cep: maskCEP(e.target.value) }))}
                      onBlur={async () => {
                        const cep = unmask(quickProvider.cep);
                        if (cep.length !== 8) return;
                        try {
                          const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                          const data = await res.json();
                          if (!data.erro) {
                            setQuickProvider(p => ({
                              ...p,
                              street: data.logradouro || p.street,
                              neighborhood: data.bairro || p.neighborhood,
                              city: data.localidade || p.city,
                              state: data.uf || p.state,
                            }));
                          }
                        } catch { /* ignore */ }
                      }}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Rua</Label>
                    <Input
                      value={quickProvider.street}
                      onChange={(e) => setQuickProvider(p => ({ ...p, street: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-2">
                    <Label>Nº</Label>
                    <Input
                      value={quickProvider.address_number}
                      onChange={(e) => setQuickProvider(p => ({ ...p, address_number: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bairro</Label>
                    <Input
                      value={quickProvider.neighborhood}
                      onChange={(e) => setQuickProvider(p => ({ ...p, neighborhood: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input
                      value={quickProvider.city}
                      onChange={(e) => setQuickProvider(p => ({ ...p, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>UF</Label>
                    <Input
                      maxLength={2}
                      value={quickProvider.state}
                      onChange={(e) => setQuickProvider(p => ({ ...p, state: e.target.value.toUpperCase() }))}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <Separator />

            <div className="space-y-2">
              <Label>Valor do Prestador (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={quotedAmount}
                onChange={(e) => setQuotedAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Valor cobrado pelo prestador</p>
            </div>
            <div className="space-y-2">
              <Label>Valor Cobrado (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={chargedAmount}
                onChange={(e) => setChargedAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Valor cobrado do cliente</p>
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
            <Button
              onClick={handleDispatch}
              disabled={
                (dispatchMode === "existing" && !selectedProviderId) ||
                (dispatchMode === "quick" && (!quickProvider.name.trim() || !quickProvider.phone.trim())) ||
                !quotedAmount || !chargedAmount || actionLoading
              }
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {dispatchMode === "quick" ? "Cadastrar e Acionar" : "Acionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Dialog */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir Atendimento</DialogTitle>
            <DialogDescription>
              O atendimento <strong>{request.protocol}</strong> será reaberto. Informe a justificativa:
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Justificativa para reabertura..."
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>Voltar</Button>
            <Button onClick={handleReopen} disabled={!reopenReason.trim() || actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirmar Reabertura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
