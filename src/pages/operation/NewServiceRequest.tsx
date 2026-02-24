import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { maskPhone, maskCEP, unmask } from "@/lib/masks";
import { useAuth } from "@/contexts/AuthContext";
import { sendServiceLabel } from "@/lib/serviceLabel";
import { sendAutoNotify } from "@/lib/autoNotify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  User, Car, MapPin, AlertTriangle, CheckCircle2, Loader2,
  XCircle, MapPinned, Share2, DollarSign, ShieldAlert,
} from "lucide-react";
import CarVerification, { defaultCarVerification } from "@/components/service-request/CarVerification";
import MotorcycleVerification, { defaultMotorcycleVerification } from "@/components/service-request/MotorcycleVerification";
import TruckVerification, { defaultTruckVerification } from "@/components/service-request/TruckVerification";
import CollisionMediaUpload from "@/components/collision/CollisionMediaUpload";

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    const data = await res.json();
    if (data?.[0]) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (err) {
    console.error("Geocoding failed:", err);
  }
  return null;
}

type VehicleCategory = "car" | "motorcycle" | "truck";

export default function NewServiceRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tenantId, setTenantId] = useState<string | null>(null);
  
  const conversationId = searchParams.get("conversation_id");

  // Fetch the user's tenant_id
  useEffect(() => {
    if (user?.id) {
      supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", user.id)
        .limit(1)
        .single()
        .then(({ data }) => {
          if (data) setTenantId(data.tenant_id);
        });
    }
  }, [user?.id]);

  const originCoords = searchParams.get("origin_coords");
  const originFromCoords = originCoords ? `Lat: ${originCoords.split(",")[0]}, Lng: ${originCoords.split(",")[1]}` : "";
  const destinationCoords = searchParams.get("destination_coords");
  const destinationFromCoords = destinationCoords ? `Lat: ${destinationCoords.split(",")[0]}, Lng: ${destinationCoords.split(",")[1]}` : "";

  // Detect vehicle category from params
  const paramCategory = searchParams.get("vehicle_category") as VehicleCategory | null;
  const paramServiceType = searchParams.get("service_type");
  const initialCategory: VehicleCategory = paramCategory || (paramServiceType === "tow_motorcycle" ? "motorcycle" : paramServiceType === "tow_heavy" ? "truck" : "car");

  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>(initialCategory);

  const [form, setForm] = useState({
    requester_name: searchParams.get("name") || "",
    requester_phone: searchParams.get("phone") || "",
    requester_email: "",
    requester_phone_secondary: "",
    vehicle_plate: searchParams.get("plate") || "",
    vehicle_model: searchParams.get("model") || "",
    vehicle_year: searchParams.get("year") || "",
    vehicle_lowered: searchParams.get("vehicle_lowered") === "true",
    difficult_access: searchParams.get("difficult_access") === "true",
    service_type: paramServiceType || (initialCategory === "motorcycle" ? "tow_motorcycle" : initialCategory === "truck" ? "tow_heavy" : "tow_light"),
    event_type: searchParams.get("event_type") || "mechanical_failure",
    origin_cep: "",
    origin_address: originFromCoords,
    origin_number: "",
    origin_complement: "",
    destination_cep: "",
    destination_address: destinationFromCoords,
    destination_number: "",
    destination_complement: "",
    notes: searchParams.get("notes") || "",
    payment_method: "",
    payment_term: "",
    provider_cost: "",
    charged_amount: "",
  });

  // Parse verification answers from URL params
  const [carVerification, setCarVerification] = useState(() => {
    const raw = searchParams.get("car_verification");
    if (!raw) return defaultCarVerification;
    try {
      return { ...defaultCarVerification, ...JSON.parse(raw) };
    } catch {
      return defaultCarVerification;
    }
  });
  const [motoVerification, setMotoVerification] = useState(() => {
    const raw = searchParams.get("moto_verification");
    if (!raw) return defaultMotorcycleVerification;
    try {
      return { ...defaultMotorcycleVerification, ...JSON.parse(raw) };
    } catch {
      return defaultMotorcycleVerification;
    }
  });
  const [truckVerification, setTruckVerification] = useState(() => {
    const raw = searchParams.get("truck_verification");
    if (!raw) return defaultTruckVerification;
    try {
      return { ...defaultTruckVerification, ...JSON.parse(raw) };
    } catch {
      return defaultTruckVerification;
    }
  });

  // Usage control state
  const [usageCheck, setUsageCheck] = useState<{
    allowed: boolean; reason: string; usage: number; limit: number;
    period_type?: string; period_days?: number; has_exception?: boolean;
  } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [exceptionJustification, setExceptionJustification] = useState("");
  const [exceptionSaving, setExceptionSaving] = useState(false);

  // Beneficiary lookup
  const [beneficiaryFound, setBeneficiaryFound] = useState<{
    id: string; name: string; phone: string | null; cpf: string | null;
    vehicle_model: string | null; vehicle_year: number | null;
    client_name?: string; plan_name?: string;
  } | null>(null);
  const [plateSearching, setPlateSearching] = useState(false);
  const [cepLoading, setCepLoading] = useState<{ origin: boolean; destination: boolean }>({ origin: false, destination: false });
  const [geoStatus, setGeoStatus] = useState<{ origin: "idle" | "loading" | "success" | "error"; destination: "idle" | "loading" | "success" | "error" }>({
    origin: originCoords ? "success" : "idle",
    destination: destinationCoords ? "success" : "idle",
  });
  const [geoCoords, setGeoCoords] = useState<{ origin: { lat: number; lng: number } | null; destination: { lat: number; lng: number } | null }>({
    origin: originCoords ? { lat: parseFloat(originCoords.split(",")[0]), lng: parseFloat(originCoords.split(",")[1]) } : null,
    destination: destinationCoords ? { lat: parseFloat(destinationCoords.split(",")[0]), lng: parseFloat(destinationCoords.split(",")[1]) } : null,
  });
  const plateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cepDebounceRef = useRef<{ origin: ReturnType<typeof setTimeout> | null; destination: ReturnType<typeof setTimeout> | null }>({ origin: null, destination: null });
  const geoDebounceRef = useRef<{ origin: ReturnType<typeof setTimeout> | null; destination: ReturnType<typeof setTimeout> | null }>({ origin: null, destination: null });


  const searchBeneficiaryByPlate = useCallback(async (plate: string) => {
    const cleanPlate = plate.replace(/[^A-Z0-9]/g, "");
    if (cleanPlate.length < 7) { setBeneficiaryFound(null); return; }
    setPlateSearching(true);
    const { data } = await supabase
      .from("beneficiaries")
      .select("id, name, phone, cpf, vehicle_model, vehicle_year, vehicle_plate, client_id, plan_id, clients(name), plans(name)")
      .eq("vehicle_plate", cleanPlate)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    setPlateSearching(false);
    if (data) {
      const clientName = (data as any).clients?.name;
      const planName = (data as any).plans?.name;
      setBeneficiaryFound({
        id: data.id, name: data.name, phone: data.phone, cpf: data.cpf,
        vehicle_model: data.vehicle_model, vehicle_year: data.vehicle_year,
        client_name: clientName, plan_name: planName,
      });
      setForm((f) => ({
        ...f,
        requester_name: f.requester_name || data.name,
        requester_phone: f.requester_phone || (data.phone ? maskPhone(data.phone) : ""),
        vehicle_model: f.vehicle_model || data.vehicle_model || "",
        vehicle_year: f.vehicle_year || (data.vehicle_year ? String(data.vehicle_year) : ""),
      }));
    } else {
      setBeneficiaryFound(null);
    }
  }, []);

  const handlePlateChange = (value: string) => {
    const upper = value.toUpperCase();
    update("vehicle_plate", upper);
    if (plateDebounceRef.current) clearTimeout(plateDebounceRef.current);
    plateDebounceRef.current = setTimeout(() => searchBeneficiaryByPlate(upper), 500);
  };

  useEffect(() => {
    if (form.vehicle_plate && form.vehicle_plate.length >= 7) {
      searchBeneficiaryByPlate(form.vehicle_plate);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const triggerGeocode = useCallback(async (address: string, number: string, target: "origin" | "destination") => {
    const fullAddr = [address, number].filter(Boolean).join(", ");
    if (!fullAddr.trim() || fullAddr.trim().length < 5) {
      setGeoStatus((prev) => ({ ...prev, [target]: "idle" }));
      setGeoCoords((prev) => ({ ...prev, [target]: null }));
      return;
    }
    setGeoStatus((prev) => ({ ...prev, [target]: "loading" }));
    const result = await geocodeAddress(fullAddr);
    if (result) {
      setGeoStatus((prev) => ({ ...prev, [target]: "success" }));
      setGeoCoords((prev) => ({ ...prev, [target]: result }));
    } else {
      setGeoStatus((prev) => ({ ...prev, [target]: "error" }));
      setGeoCoords((prev) => ({ ...prev, [target]: null }));
    }
  }, []);

  const scheduleGeocode = useCallback((target: "origin" | "destination") => {
    if (geoDebounceRef.current[target]) clearTimeout(geoDebounceRef.current[target]!);
    geoDebounceRef.current[target] = setTimeout(() => {
      const addr = target === "origin" ? form.origin_address : form.destination_address;
      const num = target === "origin" ? form.origin_number : form.destination_number;
      triggerGeocode(addr, num, target);
    }, 800);
  }, [form.origin_address, form.origin_number, form.destination_address, form.destination_number, triggerGeocode]);

  const fetchCep = useCallback(async (cep: string, target: "origin" | "destination") => {
    const digits = unmask(cep);
    if (digits.length !== 8) return;
    setCepLoading((prev) => ({ ...prev, [target]: true }));
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (!data.erro) {
        const addr = `${data.logradouro || ""}, ${data.bairro || ""}, ${data.localidade || ""} - ${data.uf || ""}`.replace(/^, |, $/g, "");
        const field = target === "origin" ? "origin_address" : "destination_address";
        setForm((f) => ({ ...f, [field]: addr }));
        setErrors((prev) => ({ ...prev, [field]: "" }));
        const num = target === "origin" ? form.origin_number : form.destination_number;
        triggerGeocode(addr, num, target);
      } else {
        toast({ title: "CEP não encontrado", description: "Verifique o CEP digitado.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao buscar CEP", variant: "destructive" });
    } finally {
      setCepLoading((prev) => ({ ...prev, [target]: false }));
    }
  }, [toast, form.origin_number, form.destination_number, triggerGeocode]);

  const handleCepChange = (value: string, target: "origin" | "destination") => {
    const masked = maskCEP(value);
    update(target === "origin" ? "origin_cep" : "destination_cep", masked);
    if (cepDebounceRef.current[target]) clearTimeout(cepDebounceRef.current[target]!);
    cepDebounceRef.current[target] = setTimeout(() => fetchCep(masked, target), 500);
  };

  const handleCategoryChange = (cat: VehicleCategory) => {
    setVehicleCategory(cat);
    if (cat === "motorcycle") update("service_type", "tow_motorcycle");
    else if (cat === "truck") update("service_type", "tow_heavy");
    else update("service_type", "tow_light");
  };

  useEffect(() => {
    if (!beneficiaryFound?.id || !form.service_type) { setUsageCheck(null); return; }
    let cancelled = false;
    const check = async () => {
      setUsageLoading(true);
      const { data, error } = await supabase.rpc("check_beneficiary_usage", {
        _beneficiary_id: beneficiaryFound.id, _service_type: form.service_type,
      });
      if (!cancelled) {
        setUsageLoading(false);
        if (!error && data) setUsageCheck(data as any);
        else setUsageCheck(null);
      }
    };
    check();
    return () => { cancelled = true; };
  }, [beneficiaryFound?.id, form.service_type]);

  const handleGrantException = async () => {
    if (!beneficiaryFound?.id || !exceptionJustification.trim()) return;
    setExceptionSaving(true);
    const { error } = await supabase.from("plan_usage_exceptions" as any).insert({
      beneficiary_id: beneficiaryFound.id, service_type: form.service_type,
      justification: exceptionJustification.trim(), granted_by: user?.id,
    });
    setExceptionSaving(false);
    if (error) {
      toast({ title: "Erro ao conceder exceção", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Exceção concedida com sucesso!" });
      setExceptionDialogOpen(false);
      setExceptionJustification("");
      const { data } = await supabase.rpc("check_beneficiary_usage", {
        _beneficiary_id: beneficiaryFound.id, _service_type: form.service_type,
      });
      if (data) setUsageCheck(data as any);
    }
  };

  const getVerificationAnswers = () => {
    if (vehicleCategory === "car") return { category: "car", ...carVerification };
    if (vehicleCategory === "motorcycle") return { category: "motorcycle", ...motoVerification };
    return { category: "truck", ...truckVerification };
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!form.requester_name.trim()) errs.requester_name = "Nome do solicitante é obrigatório";
    if (!form.requester_phone.trim()) errs.requester_phone = "Telefone do solicitante é obrigatório";
    if (!form.origin_address.trim()) errs.origin_address = form.service_type === "collision" ? "Local do ocorrido é obrigatório" : "Endereço de origem é obrigatório";
    if (form.service_type !== "collision" && !form.destination_address.trim()) errs.destination_address = "Endereço de destino é obrigatório";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      // scroll to top to show errors
      toast({ title: "Preencha os campos obrigatórios", description: "Verifique os campos destacados em vermelho.", variant: "destructive" });
      return;
    }
    setLoading(true);

    // Geocode service addresses
    const fullOrigin = [form.origin_address, form.origin_number].filter(Boolean).join(", ");
    const fullDest = [form.destination_address, form.destination_number].filter(Boolean).join(", ");
    const [originGeo, destGeo] = await Promise.all([
      geoCoords.origin ? Promise.resolve(geoCoords.origin) : geocodeAddress(fullOrigin),
      geoCoords.destination ? Promise.resolve(geoCoords.destination) : geocodeAddress(fullDest),
    ]);

    const providerCostNum = form.provider_cost ? parseFloat(form.provider_cost) : 0;
    const chargedAmountNum = form.charged_amount ? parseFloat(form.charged_amount) : 0;

    const beneficiaryToken = crypto.randomUUID();

    const { data: inserted, error } = await supabase.from("service_requests").insert({
      requester_name: form.requester_name,
      requester_phone: form.requester_phone,
      requester_email: form.requester_email || null,
      requester_phone_secondary: form.requester_phone_secondary || null,
      vehicle_plate: form.vehicle_plate || null,
      vehicle_model: form.vehicle_model || null,
      vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year) : null,
      vehicle_lowered: form.vehicle_lowered,
      difficult_access: form.difficult_access,
      service_type: form.service_type as any,
      event_type: form.event_type as any,
      origin_address: form.origin_address || null,
      origin_lat: originGeo?.lat || null,
      origin_lng: originGeo?.lng || null,
      destination_address: form.destination_address || null,
      destination_lat: destGeo?.lat || null,
      destination_lng: destGeo?.lng || null,
      notes: form.notes || null,
      payment_method: form.payment_method || null,
      payment_term: form.payment_term || null,
      provider_cost: providerCostNum,
      charged_amount: chargedAmountNum,
      operator_id: user?.id,
      tenant_id: tenantId,
      beneficiary_id: beneficiaryFound?.id || null,
      protocol: "temp",
      vehicle_category: vehicleCategory,
      verification_answers: getVerificationAnswers() as any,
      beneficiary_token: beneficiaryToken,
    }).select("id").single();

    if (!error && inserted) {
      // Log creation event
      await supabase.from("service_request_events").insert({
        service_request_id: inserted.id,
        event_type: "creation",
        description: "Atendimento criado — aguardando acionamento de prestador",
        user_id: user?.id || null,
      });

      sendServiceLabel(inserted.id, "creation");

      const beneficiaryTrackingUrl = `${window.location.origin}/tracking/${beneficiaryToken}`;
      sendAutoNotify(inserted.id, "beneficiary_creation", {
        beneficiary_tracking_url: beneficiaryTrackingUrl,
      });

      if (conversationId) {
        await supabase
          .from("whatsapp_conversations")
          .update({ status: "service_created", service_request_id: inserted.id })
          .eq("id", conversationId);
      }

      if (form.service_type === "collision") {
        const { data: reqData } = await supabase
          .from("service_requests")
          .select("share_token")
          .eq("id", inserted.id)
          .single();
        setCreatedRequestId(inserted.id);
        setShareToken(reqData?.share_token || null);
        setLoading(false);
        toast({ title: "Registro de colisão criado!", description: "Agora anexe as mídias obrigatórias." });
        return;
      }
    }

    setLoading(false);

    if (error) {
      toast({ title: "Erro ao criar atendimento", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Atendimento criado com sucesso!" });
      navigate("/operation/requests");
    }
  };

  const allServiceTypeOptions = [
    { value: "tow_light", label: "Reboque Leve" },
    { value: "tow_heavy", label: "Reboque Pesado" },
    { value: "tow_motorcycle", label: "Reboque Moto" },
    { value: "locksmith", label: "Chaveiro" },
    { value: "tire_change", label: "Troca de Pneu" },
    { value: "battery", label: "Bateria" },
    { value: "fuel", label: "Combustível" },
    { value: "lodging", label: "Hospedagem" },
    { value: "collision", label: "Colisão" },
    { value: "other", label: "Outro" },
  ];

  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const isCollision = form.service_type === "collision";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Novo Atendimento</h1>
        <p className="text-sm text-muted-foreground">Cadastre um novo atendimento de assistência</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
            {/* ═══════════════ DADOS DO SOLICITANTE ═══════════════ */}
            {/* Requester Data */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-5 w-5" /> DADOS DO SOLICITANTE
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Solicitante *</Label>
                  <Input value={form.requester_name} onChange={(e) => { update("requester_name", e.target.value); setErrors(prev => ({ ...prev, requester_name: "" })); }} className={errors.requester_name ? "border-destructive" : ""} />
                  {errors.requester_name && <p className="text-xs text-destructive">{errors.requester_name}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Telefone do Solicitante *</Label>
                  <Input value={form.requester_phone} onChange={(e) => { update("requester_phone", maskPhone(e.target.value)); setErrors(prev => ({ ...prev, requester_phone: "" })); }} placeholder="(00) 00000-0000" className={errors.requester_phone ? "border-destructive" : ""} />
                  {errors.requester_phone && <p className="text-xs text-destructive">{errors.requester_phone}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Telefone Secundário</Label>
                  <Input value={form.requester_phone_secondary} onChange={(e) => update("requester_phone_secondary", maskPhone(e.target.value))} placeholder="(00) 00000-0000" />
                </div>
              </CardContent>
            </Card>

            {/* Vehicle + Category */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Car className="h-5 w-5" /> VEÍCULO
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Categoria do Veículo *</Label>
                  <div className="flex gap-2">
                    {(["car", "motorcycle", "truck"] as VehicleCategory[]).map((cat) => (
                      <Button key={cat} type="button" variant={vehicleCategory === cat ? "default" : "outline"} onClick={() => handleCategoryChange(cat)} className="flex-1">
                        {cat === "car" ? "Carro" : cat === "motorcycle" ? "Moto" : "Caminhão"}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Placa</Label>
                    <div className="relative">
                      <Input value={form.vehicle_plate} onChange={(e) => handlePlateChange(e.target.value)} maxLength={7} className="pr-9" />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {plateSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        {!plateSearching && beneficiaryFound && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        {!plateSearching && !beneficiaryFound && form.vehicle_plate.length >= 7 && <XCircle className="h-4 w-4 text-amber-500" />}
                      </div>
                    </div>
                    {!plateSearching && !beneficiaryFound && form.vehicle_plate.length >= 7 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm">
                        <div className="flex items-center gap-2 font-medium text-amber-800">
                          <AlertTriangle className="h-4 w-4" />
                          Caso Avulso (99)
                          <Badge variant="outline" className="text-xs border-amber-300 text-amber-700">Sem vínculo</Badge>
                        </div>
                      </div>
                    )}
                    {beneficiaryFound && (
                      <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm space-y-1">
                        <div className="flex items-center gap-2 font-medium text-green-800">
                          <CheckCircle2 className="h-4 w-4" /> Beneficiário encontrado
                        </div>
                        <p className="text-green-700">{beneficiaryFound.name}{beneficiaryFound.cpf ? ` — CPF: ${beneficiaryFound.cpf}` : ""}</p>
                        {beneficiaryFound.client_name && (
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs">{beneficiaryFound.client_name}</Badge>
                            {beneficiaryFound.plan_name && <Badge variant="outline" className="text-xs">{beneficiaryFound.plan_name}</Badge>}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Usage control */}
                    {beneficiaryFound && usageLoading && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Verificando uso do plano…
                      </div>
                    )}
                    {beneficiaryFound && usageCheck && !usageLoading && (
                      <>
                        {usageCheck.reason === "limit_reached" && !usageCheck.allowed && (
                          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm space-y-2">
                            <div className="flex items-center gap-2 font-medium text-destructive">
                              <ShieldAlert className="h-4 w-4" /> Limite do plano atingido
                            </div>
                            <p className="text-destructive/80">
                              Uso: {usageCheck.usage}/{usageCheck.limit} no período ({usageCheck.period_type === "calendar_month" ? "mês corrente" : `últimos ${usageCheck.period_days} dias`}).
                            </p>
                            <Button type="button" variant="outline" size="sm" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setExceptionDialogOpen(true)}>
                              Conceder Exceção
                            </Button>
                          </div>
                        )}
                        {usageCheck.reason === "service_not_covered" && (
                          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                            <div className="flex items-center gap-2 font-medium text-amber-800">
                              <AlertTriangle className="h-4 w-4" /> Serviço não coberto pelo plano
                            </div>
                          </div>
                        )}
                        {usageCheck.reason === "exception_granted" && (
                          <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm">
                            <div className="flex items-center gap-2 font-medium text-blue-800">
                              <CheckCircle2 className="h-4 w-4" /> Exceção concedida — uso liberado ({usageCheck.usage}/{usageCheck.limit})
                            </div>
                          </div>
                        )}
                        {usageCheck.reason === "within_limit" && (
                          <div className="text-xs text-muted-foreground">Uso do plano: {usageCheck.usage}/{usageCheck.limit}</div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Modelo</Label>
                    <Input value={form.vehicle_model} onChange={(e) => update("vehicle_model", e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Ano</Label>
                    <Input type="number" value={form.vehicle_year} onChange={(e) => update("vehicle_year", e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Event + Service type */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-5 w-5" /> MOTIVO DA PANE / SERVIÇO
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Motivo da Pane *</Label>
                  <Select value={form.event_type} onValueChange={(v) => update("event_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mechanical_failure">Pane Mecânica</SelectItem>
                      <SelectItem value="accident">Acidente</SelectItem>
                      <SelectItem value="theft">Roubo/Furto</SelectItem>
                      <SelectItem value="flat_tire">Pneu Furado</SelectItem>
                      <SelectItem value="locked_out">Chave Trancada</SelectItem>
                      <SelectItem value="battery_dead">Bateria Descarregada</SelectItem>
                      <SelectItem value="fuel_empty">Sem Combustível</SelectItem>
                      <SelectItem value="other">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Serviço *</Label>
                  <Select value={form.service_type} onValueChange={(v) => update("service_type", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allServiceTypeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Conditional Verification */}
            <div className={vehicleCategory !== "car" ? "hidden" : ""}>
              <CarVerification data={carVerification} onChange={(field, value) => setCarVerification((prev) => ({ ...prev, [field]: value }))} />
            </div>
            <div className={vehicleCategory !== "motorcycle" ? "hidden" : ""}>
              <MotorcycleVerification data={motoVerification} onChange={(field, value) => setMotoVerification((prev) => ({ ...prev, [field]: value }))} />
            </div>
            <div className={vehicleCategory !== "truck" ? "hidden" : ""}>
              <TruckVerification data={truckVerification} onChange={(field, value) => setTruckVerification((prev) => ({ ...prev, [field]: value }))} />
            </div>

            {/* Addresses */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-5 w-5" /> ENDEREÇOS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>CEP Origem</Label>
                    <div className="relative">
                      <Input value={form.origin_cep} onChange={(e) => handleCepChange(e.target.value, "origin")} placeholder="00000-000" maxLength={9} className="pr-9" />
                      {cepLoading.origin && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>CEP Destino</Label>
                    <div className="relative">
                      <Input value={form.destination_cep} onChange={(e) => handleCepChange(e.target.value, "destination")} placeholder="00000-000" maxLength={9} className="pr-9" />
                      {cepLoading.destination && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Endereço de Origem *</Label>
                    <div className="relative">
                      <Input value={form.origin_address} onChange={(e) => { update("origin_address", e.target.value); setErrors(prev => ({ ...prev, origin_address: "" })); }} onBlur={() => scheduleGeocode("origin")} placeholder="Rua, Bairro, Cidade - UF" className={`pr-9 ${errors.origin_address ? "border-destructive" : ""}`} />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {geoStatus.origin === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        {geoStatus.origin === "success" && <MapPinned className="h-4 w-4 text-green-600" />}
                        {geoStatus.origin === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                      </div>
                    </div>
                    {errors.origin_address && <p className="text-xs text-destructive">{errors.origin_address}</p>}
                    {geoStatus.origin === "success" && geoCoords.origin && (
                      <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Geocodificado: {geoCoords.origin.lat.toFixed(4)}, {geoCoords.origin.lng.toFixed(4)}</p>
                    )}
                    {geoStatus.origin === "error" && (
                      <p className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> Endereço não encontrado no mapa</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Endereço de Destino *</Label>
                    <div className="relative">
                      <Input value={form.destination_address} onChange={(e) => { update("destination_address", e.target.value); setErrors(prev => ({ ...prev, destination_address: "" })); }} onBlur={() => scheduleGeocode("destination")} placeholder="Rua, Bairro, Cidade - UF" className={`pr-9 ${errors.destination_address ? "border-destructive" : ""}`} />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {geoStatus.destination === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                        {geoStatus.destination === "success" && <MapPinned className="h-4 w-4 text-green-600" />}
                        {geoStatus.destination === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                      </div>
                    </div>
                    {errors.destination_address && <p className="text-xs text-destructive">{errors.destination_address}</p>}
                    {geoStatus.destination === "success" && geoCoords.destination && (
                      <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Geocodificado: {geoCoords.destination.lat.toFixed(4)}, {geoCoords.destination.lng.toFixed(4)}</p>
                    )}
                    {geoStatus.destination === "error" && (
                      <p className="text-xs text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> Endereço não encontrado no mapa</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Nº Origem</Label>
                    <Input value={form.origin_number} onChange={(e) => update("origin_number", e.target.value)} onBlur={() => scheduleGeocode("origin")} placeholder="Nº" />
                  </div>
                  <div className="space-y-2">
                    <Label>Complemento Origem</Label>
                    <Input value={form.origin_complement} onChange={(e) => update("origin_complement", e.target.value)} placeholder="Apto, Bloco..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Nº Destino</Label>
                    <Input value={form.destination_number} onChange={(e) => update("destination_number", e.target.value)} onBlur={() => scheduleGeocode("destination")} placeholder="Nº" />
                  </div>
                  <div className="space-y-2">
                    <Label>Complemento Destino</Label>
                    <Input value={form.destination_complement} onChange={(e) => update("destination_complement", e.target.value)} placeholder="Apto, Bloco..." />
                  </div>
                </div>
                {/* Additional options */}
                <div className="flex flex-wrap gap-6 pt-2">
                  <div className="flex items-center gap-2">
                    <Checkbox id="lowered" checked={form.vehicle_lowered} onCheckedChange={(v) => update("vehicle_lowered", !!v)} />
                    <Label htmlFor="lowered" className="text-sm">Veículo rebaixado</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="difficult" checked={form.difficult_access} onCheckedChange={(v) => update("difficult_access", !!v)} />
                    <Label htmlFor="difficult" className="text-sm">Acesso difícil</Label>
                  </div>
                </div>
              </CardContent>
            </Card>


            {/* ═══════════════ VALORES E PAGAMENTO ═══════════════ */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <DollarSign className="h-5 w-5" /> VALORES E PAGAMENTO
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor Cobrado do Cliente (R$)</Label>
                    <Input type="number" step="0.01" min="0" value={form.charged_amount} onChange={(e) => update("charged_amount", e.target.value)} placeholder="0,00" />
                    <p className="text-xs text-muted-foreground">Valor que será cobrado na fatura</p>
                  </div>
                </div>

                <div className="border-t pt-4 mt-2" />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Forma de Pagamento</Label>
                    <Select value={form.payment_method} onValueChange={(v) => update("payment_method", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">À Vista</SelectItem>
                        <SelectItem value="invoiced">Faturado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Prazo de Pagamento</Label>
                    <Input value={form.payment_term} onChange={(e) => update("payment_term", e.target.value)} placeholder="Ex: 30 dias, à vista..." />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Informações adicionais sobre o atendimento..." rows={4} />
                </div>
              </CardContent>
            </Card>

            {/* Collision Media Upload (shown after creation) */}
            {isCollision && createdRequestId && (
              <div className="space-y-4">
                <CollisionMediaUpload serviceRequestId={createdRequestId} />
                {shareToken && (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3">
                        <Share2 className="h-5 w-5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Link público da colisão:</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {window.location.origin}/collision/{shareToken}
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/collision/${shareToken}`);
                          toast({ title: "Link copiado!" });
                        }}>
                          Copiar Link
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
                <div className="flex justify-end">
                  <Button type="button" onClick={() => navigate("/operation/requests")}>
                    Finalizar e Voltar
                  </Button>
                </div>
              </div>
            )}

            {/* Summary + Submit */}
            {!createdRequestId && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="text-sm space-y-2">
                    <p className="font-medium text-primary">Resumo do Atendimento</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                      <span>Solicitante:</span><span className="font-medium text-foreground">{form.requester_name || "—"}</span>
                      <span>Veículo:</span><span className="font-medium text-foreground">{form.vehicle_plate || "—"} {form.vehicle_model}</span>
                      <span>Serviço:</span><span className="font-medium text-foreground">{allServiceTypeOptions.find(o => o.value === form.service_type)?.label || "—"}</span>
                      <span>Status:</span><span className="font-medium text-foreground">Aguardando acionamento</span>
                      {form.provider_cost && <><span>Custo prestador:</span><span className="font-medium text-foreground">R$ {parseFloat(form.provider_cost).toFixed(2)}</span></>}
                      {form.charged_amount && <><span>Valor cobrado:</span><span className="font-medium text-foreground">R$ {parseFloat(form.charged_amount).toFixed(2)}</span></>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {!createdRequestId && (
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => navigate("/operation/requests")}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Salvando..." : isCollision ? "Criar Registro de Colisão" : "Criar Atendimento"}
                </Button>
              </div>
            )}
      </form>

      {/* Exception Dialog */}
      <Dialog open={exceptionDialogOpen} onOpenChange={setExceptionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conceder Exceção de Uso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O beneficiário <strong>{beneficiaryFound?.name}</strong> atingiu o limite de uso para este serviço
              ({usageCheck?.usage}/{usageCheck?.limit}). Informe a justificativa para liberar uma exceção.
            </p>
            <div className="space-y-2">
              <Label>Justificativa *</Label>
              <Textarea value={exceptionJustification} onChange={(e) => setExceptionJustification(e.target.value)} placeholder="Descreva o motivo da exceção..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExceptionDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleGrantException} disabled={!exceptionJustification.trim() || exceptionSaving}>
              {exceptionSaving ? "Salvando..." : "Conceder Exceção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
