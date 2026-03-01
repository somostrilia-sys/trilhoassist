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
  ClipboardCopy, Phone, Star, MapPinned, Trash2,
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
import { ProviderInvoiceReview } from "@/components/provider/ProviderInvoiceReview";
import AddressAutocomplete from "@/components/service-request/AddressAutocomplete";

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
    wheel_locked_count: "Quantas rodas travadas?",
  steering_locked: "Direção travada?",
  armored: "Veículo blindado?",
  vehicle_lowered: "Veículo rebaixado?",
  carrying_cargo: "Transportando carga ou excesso de peso?",
  cargo_description: "Tipo de carga",
    cargo_photo_url: "Foto da carga",
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
  people_count: "Há quantas pessoas no local?",
  docs_key_available: "Documentos e chave estão no local?",
  truck_type: "Tipo de caminhão",
  loaded: "Está carregado?",
  cargo_type: "Qual carga?",
  moves: "O caminhão movimenta ou não?",
  truck_type_other: "Descrição do tipo",
  has_trailer: "Possui carreta/reboque?",
  trailer_type: "Tipo de carreta",
  total_weight: "Peso total estimado",
  axle_count: "Quantidade de eixos",
  special_cargo: "Carga especial?",
  special_cargo_description: "Descrição da carga especial",
  needs_crane: "Necessita guincho/munck?",
};

const verificationFieldsByCategory: Record<string, string[]> = {
  car: [
    "wheel_locked",
    "wheel_locked_count",
    "steering_locked",
    "armored",
    "vehicle_lowered",
    "carrying_cargo",
    "cargo_description",
    "cargo_photo_url",
    "easy_access",
    "vehicle_location",
    "vehicle_location_other",
    "height_restriction",
    "height_restriction_value",
    "key_available",
    "documents_available",
    "has_passengers",
    "passenger_count",
    "had_collision",
    "risk_area",
    "vehicle_starts",
  ],
  motorcycle: ["wheel_locked", "people_count", "easy_access", "docs_key_available"],
  truck: ["truck_type", "loaded", "cargo_type", "moves"],
};

const vehicleLocationLabels: Record<string, string> = {
  underground_garage: "Garagem subterrânea",
  parking: "Estacionamento",
  highway: "Rodovia",
  difficult_access: "Local de difícil acesso",
  other: "Outro",
};

function formatValue(key: string, value: string): string {
  if (value === "" || value === "null" || value === "undefined") return "Não informado";
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
  const [paymentMethod, setPaymentMethod] = useState("");
  const [dispatchNotes, setDispatchNotes] = useState("");
  const [estimatedArrival, setEstimatedArrival] = useState("");
  const [dispatchMode, setDispatchMode] = useState<"existing" | "quick" | "external">("existing");
  const [quickProvider, setQuickProvider] = useState({
    name: "", document: "", phone: "", cep: "", street: "", address_number: "",
    neighborhood: "", city: "", state: "",
  });
  const [providerSearch, setProviderSearch] = useState("");
  const [providerDropdownOpen, setProviderDropdownOpen] = useState(false);
  // Google Places external search
  const [externalSearchKeyword, setExternalSearchKeyword] = useState("guincho reboque auto socorro");
  const [externalSearchRadius, setExternalSearchRadius] = useState("30");
  const [externalResults, setExternalResults] = useState<any[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [externalError, setExternalError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [collisionMedia, setCollisionMedia] = useState<any[]>([]);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [labelText, setLabelText] = useState("");
  const [labelSending, setLabelSending] = useState(false);
  const [cancelProviderDialogOpen, setCancelProviderDialogOpen] = useState(false);
  const [cancelProviderReason, setCancelProviderReason] = useState("");
  const [cancelProviderCost, setCancelProviderCost] = useState("");
  const [cancelProviderChargedAmount, setCancelProviderChargedAmount] = useState("");
  const [cancelRequestProviderCost, setCancelRequestProviderCost] = useState("");
  const [cancelRequestChargedAmount, setCancelRequestChargedAmount] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingDestination, setEditingDestination] = useState(false);
  const [editDestAddress, setEditDestAddress] = useState("");
  const [savingDestination, setSavingDestination] = useState(false);
  const [editingOrigin, setEditingOrigin] = useState(false);
  const [editOriginAddress, setEditOriginAddress] = useState("");
  const [savingOrigin, setSavingOrigin] = useState(false);

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

  // Realtime: atualiza dados automaticamente quando service_requests, dispatches ou beneficiaries mudam
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`sr-detail-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_requests", filter: `id=eq.${id}` }, () => {
        loadData();
        loadEvents();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "dispatches", filter: `service_request_id=eq.${id}` }, () => {
        loadData();
        loadEvents();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "beneficiaries" }, () => {
        loadData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "collision_media", filter: `service_request_id=eq.${id}` }, () => {
        loadCollisionMedia();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, loadData, loadEvents, loadCollisionMedia]);

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
    const updates: any = {
      status: "cancelled",
      notes: request.notes ? `${request.notes}\n\n[CANCELAMENTO] ${cancelReason}` : `[CANCELAMENTO] ${cancelReason}`,
    };
    if (cancelRequestProviderCost) {
      updates.provider_cost = parseFloat(cancelRequestProviderCost);
    }
    if (cancelRequestChargedAmount) {
      updates.charged_amount = parseFloat(cancelRequestChargedAmount);
    }
    const { error } = await supabase
      .from("service_requests")
      .update(updates)
      .eq("id", id);
    setActionLoading(false);
    if (error) {
      toast.error("Erro ao cancelar", { description: error.message });
    } else {
      const costInfo = cancelRequestProviderCost ? ` | Custo prestador: R$ ${parseFloat(cancelRequestProviderCost).toFixed(2)}` : "";
      const chargeInfo = cancelRequestChargedAmount ? ` | Valor cobrado cliente: R$ ${parseFloat(cancelRequestChargedAmount).toFixed(2)}` : "";
      await logEvent("cancel", `Atendimento cancelado. Motivo: ${cancelReason}${costInfo}${chargeInfo}`, request.status, "cancelled");
      sendServiceLabel(id, "cancellation", { cancel_reason: cancelReason });
      toast.success("Atendimento cancelado");
      setCancelDialogOpen(false);
      setCancelReason("");
      setCancelRequestProviderCost("");
      setCancelRequestChargedAmount("");
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
    if (!quotedAmount || !chargedAmount || !paymentMethod) {
      toast.error("Preencha os valores obrigatórios", { description: "Valor cobrado do cliente e forma de pagamento são obrigatórios." });
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
    // Reuse existing beneficiary_token if already set (created at service request creation)
    const beneficiaryToken = request.beneficiary_token || crypto.randomUUID();

    const { data: newDispatch, error: dErr } = await supabase.from("dispatches").insert({
      service_request_id: id,
      provider_id: finalProviderId,
      quoted_amount: quotedAmount ? parseFloat(quotedAmount) : null,
      estimated_arrival_min: estimatedArrival ? parseInt(estimatedArrival) : null,
      notes: dispatchNotes || null,
      status: "sent",
      provider_token: providerToken,
    }).select("id").single();

    if (dErr) {
      setActionLoading(false);
      toast.error("Erro ao acionar prestador", { description: dErr.message });
      return;
    }

    // Update service request with financial values; only set beneficiary_token if not already present
    const updatePayload: any = {
      status: "dispatched",
      provider_cost: parseFloat(quotedAmount),
      charged_amount: parseFloat(chargedAmount),
      payment_method: paymentMethod,
    };
    if (!request.beneficiary_token) {
      updatePayload.beneficiary_token = beneficiaryToken;
    }

    // Phase 2: Recalculate km with provider base if provider has coordinates
    const selectedProvider = providers.find(p => p.id === finalProviderId);
    if (selectedProvider?.latitude && selectedProvider?.longitude && request.origin_lat && request.origin_lng && request.destination_lat && request.destination_lng) {
      try {
        const fetchDist = async (from: {lat:number,lng:number}, to: {lat:number,lng:number}) => {
          const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.code !== "Ok") return 0;
          return (data.routes[0]?.distance || 0) / 1000;
        };
        const provBase = { lat: selectedProvider.latitude, lng: selectedProvider.longitude };
        const orig = { lat: request.origin_lat, lng: request.origin_lng };
        const dest = { lat: request.destination_lat, lng: request.destination_lng };
        const [leg1, leg2, leg3] = await Promise.all([
          fetchDist(provBase, orig),
          fetchDist(orig, dest),
          fetchDist(dest, provBase),
        ]);
        updatePayload.estimated_km = leg1 + leg2 + leg3;
      } catch { /* keep existing estimated_km */ }
    }

    await supabase.from("service_requests").update(updatePayload).eq("id", id);

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
        // Extra fields used by some templates (kept permissive)
        charged_amount: parseFloat(chargedAmount),
        payment_method: paymentMethod,
        estimated_km: request.estimated_km,
      } as any);
    }

    // Notify beneficiary via WhatsApp: "prestador a caminho"
    sendAutoNotify(id!, "beneficiary_dispatch", {
      provider_name: finalProviderName,
      estimated_arrival_min: estimatedArrival ? parseInt(estimatedArrival) : undefined,
      beneficiary_tracking_url: beneficiaryTrackingUrl,
    });

    // Send dispatch preview label to client WhatsApp group
    sendServiceLabel(id!, "dispatch_preview", {
      provider_id: finalProviderId,
      charged_amount: parseFloat(chargedAmount),
      payment_method: paymentMethod,
      estimated_km: request.estimated_km,
    } as any);

    // Generate dispatch label for copy (without provider name)
    const benName = beneficiary?.name || request.requester_name;
    const clientName = (request as any).clients?.name || "";
    const baseTrackingUrl = "https://trilhoassist.com.br";
    const trackingLink = request.beneficiary_token
      ? `${baseTrackingUrl}/tracking/${request.beneficiary_token}`
      : "";

    const dispatchLabel = `*ACIONAMENTO CONFIRMADO* 🚗

*PROTOCOLO*: ${request.protocol}
*PLACA*: ${(request.vehicle_plate || "").toUpperCase()}
*VEÍCULO*: ${(request.vehicle_model || "").toUpperCase()}

*SERVIÇO*: ${serviceTypeMap[request.service_type] || request.service_type}
*TIPO DE EVENTO*: ${eventTypeMap[request.event_type] || request.event_type}

*ORIGEM*: ${(request.origin_address || "").toUpperCase()}
*DESTINO*: ${(request.destination_address || "—").toUpperCase()}

*VALOR COBRADO*: R$ ${parseFloat(chargedAmount).toFixed(2).replace(".", ",")}
${request.estimated_km ? `*DISTÂNCIA ESTIMADA*: APROX ${Math.round(request.estimated_km)} KM` : ""}
${trackingLink ? `\n📍 *LINK DE ACOMPANHAMENTO*:\n${trackingLink}` : ""}`.trim();

    setActionLoading(false);
    toast.success("Prestador acionado!", { description: dispatchMode === "quick" ? "Prestador cadastrado e acionado. Links enviados via WhatsApp." : "Links de rastreamento enviados via WhatsApp." });
    setDispatchDialogOpen(false);

    // Show dispatch label dialog
    setLabelText(dispatchLabel);
    setLabelDialogOpen(true);

    setSelectedProviderId("");
    setQuotedAmount("");
    setChargedAmount("");
    setPaymentMethod("");
    setEstimatedArrival("");
    setDispatchNotes("");
    setDispatchMode("existing");
    setQuickProvider({ name: "", document: "", phone: "", cep: "", street: "", address_number: "", neighborhood: "", city: "", state: "" });
    loadData();
    loadEvents();
  };

  const handleQuickCancelProvider = async () => {
    if (!id || !dispatchId) return;
    setActionLoading(true);
    const { error: dErr } = await supabase
      .from("dispatches")
      .update({ status: "cancelled", notes: "Troca de prestador (subsequente)" })
      .eq("id", dispatchId);
    if (dErr) {
      setActionLoading(false);
      toast.error("Erro ao cancelar prestador", { description: dErr.message });
      return;
    }
    await supabase.from("service_requests").update({ status: "awaiting_dispatch" }).eq("id", id);
    await logEvent("provider_cancelled", `Prestador cancelado: ${provider?.name || "—"} (troca subsequente)`, "dispatched", "awaiting_dispatch");
    setActionLoading(false);
    toast.success("Prestador cancelado! Selecione um novo prestador.");
    await loadData();
    await loadEvents();
    loadProviders();
    setDispatchDialogOpen(true);
  };

  const handleCancelProvider = async () => {
    if (!id || !dispatchId || !cancelProviderReason.trim()) return;
    setActionLoading(true);
    const dispatchUpdate: any = { status: "cancelled", notes: cancelProviderReason };
    if (cancelProviderCost) {
      dispatchUpdate.final_amount = parseFloat(cancelProviderCost);
    }
    const { error: dErr } = await supabase
      .from("dispatches")
      .update(dispatchUpdate)
      .eq("id", dispatchId);
    if (dErr) {
      setActionLoading(false);
      toast.error("Erro ao cancelar prestador", { description: dErr.message });
      return;
    }
    const srUpdate: any = { status: "awaiting_dispatch" };
    if (cancelProviderCost) {
      srUpdate.provider_cost = parseFloat(cancelProviderCost);
    }
    if (cancelProviderChargedAmount) {
      srUpdate.charged_amount = parseFloat(cancelProviderChargedAmount);
    }
    await supabase.from("service_requests").update(srUpdate).eq("id", id);

    const costInfo = cancelProviderCost ? ` | Custo prestador: R$ ${parseFloat(cancelProviderCost).toFixed(2)}` : "";
    const chargeInfo = cancelProviderChargedAmount ? ` | Valor mantido cliente: R$ ${parseFloat(cancelProviderChargedAmount).toFixed(2)}` : "";
    await logEvent("provider_cancelled", `Prestador cancelado: ${provider?.name || "—"}. Motivo: ${cancelProviderReason}${costInfo}${chargeInfo}`, "dispatched", "awaiting_dispatch");
    setActionLoading(false);
    setCancelProviderDialogOpen(false);
    setCancelProviderReason("");
    setCancelProviderCost("");
    setCancelProviderChargedAmount("");
    toast.success("Prestador cancelado! Selecione um novo prestador.");
    await loadData();
    await loadEvents();
    loadProviders();
    setDispatchDialogOpen(true);
  };

  // Check if there was already a previous provider swap (cancelled dispatch exists)
  const [hasPreviousSwap, setHasPreviousSwap] = useState(false);
  useEffect(() => {
    if (!id) return;
    supabase
      .from("dispatches")
      .select("id")
      .eq("service_request_id", id)
      .eq("status", "cancelled")
      .limit(1)
      .then(({ data }) => setHasPreviousSwap((data?.length || 0) > 0));
  }, [id, provider]);

  const handleSwapProviderClick = () => {
    if (hasPreviousSwap) {
      // Skip justification — already justified before
      handleQuickCancelProvider();
    } else {
      setCancelProviderDialogOpen(true);
    }
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

  const handleDeleteRequest = async () => {
    if (!id) return;
    setActionLoading(true);
    // Delete related records first (events, dispatches, collision_media)
    await supabase.from("service_request_events").delete().eq("service_request_id", id);
    await supabase.from("dispatches").delete().eq("service_request_id", id);
    await supabase.from("collision_media").delete().eq("service_request_id", id);
    const { error } = await supabase.from("service_requests").delete().eq("id", id);
    setActionLoading(false);
    if (error) {
      toast.error("Erro ao excluir atendimento", { description: error.message });
    } else {
      toast.success("Atendimento excluído permanentemente");
      navigate("/operation/requests");
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
  const categoryFields = verificationFieldsByCategory[verificationCategory] || [];
  const categoryEntries = categoryFields.map((key) => [key, verification?.[key] ?? ""] as [string, any]);
  const extraEntries = verification
    ? Object.entries(verification).filter(([key]) => key !== "category" && !categoryFields.includes(key))
    : [];
  const verificationEntries = [...categoryEntries, ...extraEntries];

  const canChangeStatus = (statusTransitions[request.status] || []).length > 0;
  const canCancel = request.status !== "cancelled" && request.status !== "completed" && request.status !== "refunded";
  const isCollisionWithoutTow = request.service_type === "collision" && !request.destination_address;
  const canDispatch = ["open", "awaiting_dispatch"].includes(request.status) && !isCollisionWithoutTow;
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
        {request.beneficiary_token && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={() => {
              const url = `${window.location.origin}/tracking/${request.beneficiary_token}`;
              navigator.clipboard.writeText(url);
              toast.success("Link do beneficiário copiado!", { description: "Link de acompanhamento em tempo real." });
            }}
          >
            <LinkIcon className="h-4 w-4" />
            Link Beneficiário
          </Button>
        )}
        {dispatchId && (
          <Button
            variant="outline"
            size="sm"
            className="gap-2 shrink-0"
            onClick={async () => {
              // Fetch provider_token from dispatch
              const { data: d } = await supabase
                .from("dispatches")
                .select("provider_token")
                .eq("id", dispatchId)
                .single();
              if (d?.provider_token) {
                const url = `${window.location.origin}/tracking/provider/${d.provider_token}`;
                navigator.clipboard.writeText(url);
                toast.success("Link do prestador copiado!", { description: "Link de navegação e rastreamento." });
              } else {
                toast.error("Token do prestador não encontrado.");
              }
            }}
          >
            <Share2 className="h-4 w-4" />
            Link Prestador
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
            Link Colisão
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
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                const benName = beneficiary?.name || request.requester_name;
                const clientName = (request as any).clients?.name || "";
                const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

                const baseTrackingUrl = "https://trilhoassist.com.br";
                const trackingUrl = request.beneficiary_token
                  ? `${baseTrackingUrl}/tracking/${request.beneficiary_token}`
                  : "";

                const label = `*ATENDIMENTO*

*BENEFICIÁRIO*: ${benName.toUpperCase()}
*VEÍCULO*: ${(request.vehicle_model || "").toUpperCase()} (${(request.vehicle_plate || "").toUpperCase()})
*COR DO VEÍCULO*: —
*SERVIÇO*: ${serviceTypeMap[request.service_type] || request.service_type}
*PROTOCOLO*: ${request.protocol}
*OBSERVAÇÕES*: ${eventTypeMap[request.event_type] || request.event_type}

*ORIGEM*: ${(request.origin_address || "").toUpperCase()}
*DESTINO*: ${(request.destination_address || "").toUpperCase()}

*ASSISTÊNCIA*: ${clientName.toUpperCase() || "—"}
*CENTRAL DE ASSISTÊNCIA*: TRILHO SOLUCOES
${request.estimated_km ? `*DISTÂNCIA*: APROX ${Math.round(request.estimated_km)}KM` : ""}
${trackingUrl ? `\n📍 *LINK DE ACOMPANHAMENTO*:\n${trackingUrl}` : ""}`.trim();

                setLabelText(label);
                setLabelDialogOpen(true);
              }}
            >
              <ClipboardCopy className="h-4 w-4" />
              Gerar Etiqueta
            </Button>
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
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </Button>
          </div>

          {/* Dispatch info */}
          {provider && (
            <div className="mt-3 p-3 rounded-md border bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
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
                {request.status !== "completed" && request.status !== "cancelled" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={handleSwapProviderClick}
                    disabled={actionLoading}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Trocar Prestador
                  </Button>
                )}
              </div>
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

      {/* Verification Checklist - only for tow services */}
      {verificationEntries.length > 0 && !["locksmith", "tire_change", "battery"].includes(request.service_type) && (
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
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">Endereço de Origem</span>
                {!editingOrigin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1"
                    onClick={() => {
                      setEditOriginAddress(request.origin_address || "");
                      setEditingOrigin(true);
                    }}
                  >
                    <MapPinned className="h-3 w-3" />
                    Editar
                  </Button>
                )}
              </div>
              {editingOrigin ? (
                <div className="space-y-2">
                  <AddressAutocomplete
                    value={editOriginAddress}
                    onChange={setEditOriginAddress}
                    onPlaceSelect={async (place) => {
                      setSavingOrigin(true);
                      const { error: updErr } = await supabase
                        .from("service_requests")
                        .update({
                          origin_address: place.formatted_address,
                          origin_lat: place.lat,
                          origin_lng: place.lng,
                        })
                        .eq("id", id);
                      if (updErr) {
                        toast.error("Erro ao atualizar origem");
                      } else {
                        toast.success("Origem atualizada!");
                        await logEvent("update", `Origem alterada para: ${place.formatted_address}`, request.origin_address || "—", place.formatted_address);
                        setRequest({ ...request, origin_address: place.formatted_address, origin_lat: place.lat, origin_lng: place.lng });
                      }
                      setSavingOrigin(false);
                      setEditingOrigin(false);
                    }}
                    placeholder="Buscar novo endereço de origem..."
                    tenantId={request.tenant_id}
                    types="address"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setEditingOrigin(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <p className="text-sm">{request.origin_address || "—"}</p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">Endereço de Destino</span>
                {!editingDestination && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs gap-1"
                    onClick={() => {
                      setEditDestAddress(request.destination_address || "");
                      setEditingDestination(true);
                    }}
                  >
                    <MapPinned className="h-3 w-3" />
                    Editar
                  </Button>
                )}
              </div>
              {editingDestination ? (
                <div className="space-y-2">
                  <AddressAutocomplete
                    value={editDestAddress}
                    onChange={setEditDestAddress}
                    onPlaceSelect={async (place) => {
                      setSavingDestination(true);
                      const { error: updErr } = await supabase
                        .from("service_requests")
                        .update({
                          destination_address: place.formatted_address,
                          destination_lat: place.lat,
                          destination_lng: place.lng,
                        })
                        .eq("id", id);
                      if (updErr) {
                        toast.error("Erro ao atualizar destino");
                      } else {
                        toast.success("Destino atualizado!");
                        await logEvent("update", `Destino alterado para: ${place.formatted_address}`, request.destination_address || "—", place.formatted_address);
                        setRequest({ ...request, destination_address: place.formatted_address, destination_lat: place.lat, destination_lng: place.lng });
                      }
                      setSavingDestination(false);
                      setEditingDestination(false);
                    }}
                    placeholder="Buscar novo destino..."
                    tenantId={request.tenant_id}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setEditingDestination(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <p className="text-sm">{request.destination_address || "—"}</p>
              )}
            </div>
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

      {/* Financial */}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <InfoRow label="Forma de pagamento" value={request.payment_method || "—"} />
            <InfoRow label="Recebido em" value={request.payment_received_at ? new Date(request.payment_received_at).toLocaleDateString("pt-BR") : "—"} />
          </div>
          <p className="text-xs text-muted-foreground">
            Forma de pagamento e valor cobrado são definidos na etapa de <strong>Acionar Prestador</strong>.
          </p>
        </CardContent>
      </Card>

      {/* Provider Invoice / NF */}
      {dispatchId && (
        <ProviderInvoiceReview dispatchId={dispatchId} />
      )}

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
          <div className="space-y-4">
            <Textarea
              placeholder="Motivo do cancelamento..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
            />
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">Houve custo com o prestador?</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor pago ao prestador (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={cancelRequestProviderCost}
                  onChange={(e) => setCancelRequestProviderCost(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor cobrado do cliente (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={cancelRequestChargedAmount}
                  onChange={(e) => setCancelRequestChargedAmount(e.target.value)}
                />
              </div>
            </div>
          </div>
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
          setExternalResults([]);
          setExternalError("");
        }
      }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Acionar Prestador</DialogTitle>
            <DialogDescription>
              Selecione um prestador cadastrado, busque externamente ou faça um cadastro rápido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Tabs value={dispatchMode} onValueChange={(v) => setDispatchMode(v as "existing" | "quick" | "external")}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="existing">Cadastrados</TabsTrigger>
                <TabsTrigger value="external">Buscar Externos</TabsTrigger>
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
                              if (!p) return "Selecione...";
                              const dist = (p as any)._distance;
                              const distLabel = dist != null && dist < 99999 ? ` — ${dist.toFixed(1)} km` : "";
                              return `${p.name}${p.city ? ` (${p.city}/${p.state})` : ""}${distLabel}`;
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

              <TabsContent value="external" className="space-y-4 mt-4">
                {!(request?.origin_lat && request?.origin_lng) ? (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Este atendimento não possui coordenadas de origem. Informe o endereço de origem com GPS para buscar prestadores externos por proximidade.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Palavras-chave</Label>
                      <Input
                        placeholder="guincho reboque auto socorro"
                        value={externalSearchKeyword}
                        onChange={(e) => setExternalSearchKeyword(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-3 items-end">
                      <div className="space-y-2 flex-1">
                        <Label>Raio (km)</Label>
                        <Input
                          type="number"
                          min="1"
                          max="50"
                          value={externalSearchRadius}
                          onChange={(e) => setExternalSearchRadius(e.target.value)}
                        />
                      </div>
                      <Button
                        type="button"
                        onClick={async () => {
                          setExternalLoading(true);
                          setExternalError("");
                          setExternalResults([]);
                          try {
                            const { data, error } = await supabase.functions.invoke("google-places", {
                              body: {
                                latitude: request.origin_lat,
                                longitude: request.origin_lng,
                                radius: Number(externalSearchRadius) * 1000,
                                keyword: externalSearchKeyword,
                                tenant_id: request.tenant_id,
                              },
                            });
                            if (error) throw error;
                            if (!data.success) {
                              setExternalError(data.error || "Erro ao buscar.");
                            } else {
                              setExternalResults(data.results || []);
                              if ((data.results || []).length === 0) {
                                setExternalError("Nenhum resultado encontrado nesse raio.");
                              }
                            }
                          } catch (err: any) {
                            setExternalError(err.message || "Erro na busca externa.");
                          } finally {
                            setExternalLoading(false);
                          }
                        }}
                        disabled={externalLoading || !externalSearchKeyword.trim()}
                      >
                        {externalLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                        Buscar
                      </Button>
                    </div>

                    {externalError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{externalError}</AlertDescription>
                      </Alert>
                    )}

                    {externalResults.length > 0 && (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        <p className="text-xs text-muted-foreground">{externalResults.length} resultado(s) encontrado(s)</p>
                        {externalResults.map((place) => (
                          <div
                            key={place.place_id}
                            className="border rounded-lg p-3 hover:bg-accent/30 transition-colors space-y-2"
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm">{place.name}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <MapPinned className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{place.address}</span>
                                </p>
                              </div>
                              <div className="text-right shrink-0 space-y-1">
                                <Badge variant="outline" className="text-xs font-mono">
                                  {place.distance_km.toFixed(1)} km
                                </Badge>
                                {place.rating && (
                                  <p className="text-xs flex items-center justify-end gap-0.5">
                                    <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                                    {place.rating} <span className="text-muted-foreground">({place.user_ratings_total})</span>
                                  </p>
                                )}
                              </div>
                            </div>

                            {/* Phone section */}
                            {place._phone ? (
                              <a
                                href={`tel:${place._phone}`}
                                className="flex items-center gap-2 bg-primary/10 text-primary rounded-md px-3 py-2 font-semibold text-sm hover:bg-primary/20 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="h-4 w-4" />
                                {place._phone}
                              </a>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full gap-2 text-xs"
                                disabled={place._phoneLoading}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  // Fetch phone via place details
                                  setExternalResults(prev => prev.map(p =>
                                    p.place_id === place.place_id ? { ...p, _phoneLoading: true } : p
                                  ));
                                  try {
                                    const { data, error } = await supabase.functions.invoke("google-places", {
                                      body: {
                                        action: "place_details",
                                        place_id: place.place_id,
                                        tenant_id: request.tenant_id,
                                      },
                                    });
                                    const phone = data?.place?.phone || null;
                                    setExternalResults(prev => prev.map(p =>
                                      p.place_id === place.place_id
                                        ? { ...p, _phone: phone, _phoneLoading: false, _phoneError: !phone }
                                        : p
                                    ));
                                    if (!phone) toast.info("Telefone não disponível no Google para este local.");
                                  } catch {
                                    setExternalResults(prev => prev.map(p =>
                                      p.place_id === place.place_id ? { ...p, _phoneLoading: false, _phoneError: true } : p
                                    ));
                                  }
                                }}
                              >
                                {place._phoneLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Phone className="h-3 w-3" />}
                                {place._phoneError ? "Telefone indisponível" : "Buscar Telefone"}
                              </Button>
                            )}

                            {place.open_now != null && (
                              <p className={`text-xs ${place.open_now ? "text-green-600" : "text-destructive"}`}>
                                {place.open_now ? "✓ Aberto agora" : "✗ Fechado"}
                              </p>
                            )}

                            {/* Action to use in quick registration */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full text-xs gap-1"
                              onClick={() => {
                                setQuickProvider(prev => ({
                                  ...prev,
                                  name: place.name,
                                  phone: place._phone ? maskPhone(place._phone.replace(/\D/g, "")) : prev.phone,
                                  street: place.address || "",
                                  city: "",
                                  state: "",
                                }));
                                setDispatchMode("quick");
                                toast.info("Dados preenchidos no cadastro rápido", { description: "Complete os dados e acione." });
                              }}
                            >
                              Usar no Cadastro Rápido →
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
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
              <Label>Forma de pagamento *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">PIX</SelectItem>
                  <SelectItem value="credit_card">Cartão de Crédito</SelectItem>
                  <SelectItem value="debit_card">Cartão de Débito</SelectItem>
                  <SelectItem value="cash">Dinheiro</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Previsão de chegada (minutos)</Label>
              <Input
                type="number"
                min="1"
                placeholder="Ex: 40"
                value={estimatedArrival}
                onChange={(e) => setEstimatedArrival(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Tempo estimado em minutos para o prestador chegar ao local</p>
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
                !quotedAmount || !chargedAmount || !paymentMethod || actionLoading
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

      {/* Label Dialog */}
      <Dialog open={labelDialogOpen} onOpenChange={setLabelDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Etiqueta do Atendimento</DialogTitle>
            <DialogDescription>Revise a etiqueta gerada e escolha como utilizá-la.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            rows={16}
            className="font-mono text-xs"
          />
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                navigator.clipboard.writeText(labelText);
                toast.success("Etiqueta copiada!");
              }}
            >
              <ClipboardCopy className="h-4 w-4" />
              Copiar Etiqueta
            </Button>
            <Button
              className="gap-2"
              disabled={labelSending}
              onClick={async () => {
                if (!id) return;
                setLabelSending(true);
                try {
                  await sendServiceLabel(id, "creation");
                  toast.success("Etiqueta enviada no WhatsApp!");
                  setLabelDialogOpen(false);
                } catch {
                  toast.error("Erro ao enviar etiqueta");
                } finally {
                  setLabelSending(false);
                }
              }}
            >
              {labelSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar no WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Provider Dialog */}
      <Dialog open={cancelProviderDialogOpen} onOpenChange={setCancelProviderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar Prestador</DialogTitle>
            <DialogDescription>
              O prestador atual ({provider?.name}) será cancelado e você poderá acionar outro. O link do beneficiário será mantido.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Motivo da troca *</Label>
              <Textarea
                placeholder="Informe o motivo da troca do prestador..."
                value={cancelProviderReason}
                onChange={(e) => setCancelProviderReason(e.target.value)}
                rows={3}
              />
            </div>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">Houve custo com o prestador cancelado?</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor cobrado pelo prestador (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={cancelProviderCost}
                  onChange={(e) => setCancelProviderCost(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor mantido para o cliente (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={cancelProviderChargedAmount}
                  onChange={(e) => setCancelProviderChargedAmount(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelProviderDialogOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={actionLoading || !cancelProviderReason.trim()}
              onClick={handleCancelProvider}
              className="gap-2"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Cancelar e Buscar Outro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir Atendimento
            </DialogTitle>
            <DialogDescription>
              Esta ação é <strong>irreversível</strong>. O atendimento <strong>{request?.protocol}</strong>, todos os despachos, eventos e mídias associados serão excluídos permanentemente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Voltar</Button>
            <Button variant="destructive" onClick={handleDeleteRequest} disabled={actionLoading} className="gap-2">
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir Permanentemente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
