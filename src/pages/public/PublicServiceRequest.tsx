import { useState, useCallback, useEffect } from "react";
import { maskPhone } from "@/lib/masks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  User, Car, MapPin, CheckCircle2, Loader2,
  Navigation, Send, Search, AlertTriangle, FileText,
  ShieldAlert, ArrowRight,
} from "lucide-react";
import logoTrilho from "@/assets/logo-trilho.png";
import CarVerification, { defaultCarVerification } from "@/components/service-request/CarVerification";
import MotorcycleVerification, { defaultMotorcycleVerification } from "@/components/service-request/MotorcycleVerification";
import TruckVerification, { defaultTruckVerification } from "@/components/service-request/TruckVerification";
import AddressAutocomplete from "@/components/service-request/AddressAutocomplete";
import RouteDistanceDisplay from "@/components/service-request/RouteDistanceDisplay";
import PublicCollisionMedia from "@/components/collision/PublicCollisionMedia";

type VehicleCategory = "car" | "motorcycle" | "truck";
type AttendanceType = "pane" | "collision";

// Motivos de pane — SEM "Acidente"
const eventTypeOptions = [
  { value: "mechanical_failure", label: "Pane Mecânica" },
  { value: "theft", label: "Roubo/Furto" },
  { value: "flat_tire", label: "Pneu Furado" },
  { value: "locked_out", label: "Chave Trancada" },
  { value: "battery_dead", label: "Bateria Descarregada" },
  { value: "fuel_empty", label: "Sem Combustível" },
  { value: "other", label: "Outro" },
];

async function reverseGeocode(lat: number, lng: number): Promise<{ address: string; city: string; state: string }> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const city = addr.city || addr.town || addr.village || addr.municipality || "";
    const state = addr.state || "";
    return {
      address: data.display_name || `${lat}, ${lng}`,
      city,
      state,
    };
  } catch {
    return { address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, city: "", state: "" };
  }
}

export default function PublicServiceRequest() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{ protocol: string; trackingUrl: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>("car");
  const [attendanceType, setAttendanceType] = useState<AttendanceType>("pane");
  const [needsTow, setNeedsTow] = useState<boolean | null>(null);
  const [plateLookupStatus, setPlateLookupStatus] = useState<"idle" | "loading" | "found" | "not_found">("idle");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsReminderShown, setGpsReminderShown] = useState(false);
  const [carVerification, setCarVerification] = useState(defaultCarVerification);
  const [motoVerification, setMotoVerification] = useState(defaultMotorcycleVerification);
  const [truckVerification, setTruckVerification] = useState(defaultTruckVerification);

  // Collision media state
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [collisionMediaFiles, setCollisionMediaFiles] = useState<any[]>([]);

  const [form, setForm] = useState({
    requester_name: "",
    requester_phone: "",
    requester_phone_secondary: "",
    vehicle_plate: "",
    vehicle_model: "",
    vehicle_year: "",
    service_type: "tow_light",
    event_type: "mechanical_failure",
    origin_address: "",
    origin_number: "",
    origin_city: "",
    origin_uf: "",
    destination_address: "",
    destination_number: "",
    destination_city: "",
    destination_uf: "",
    notes: "",
  });

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  // ═══ Service options driven by event_type (motivo) ═══
  const getTowTypeForCategory = (): string => {
    if (vehicleCategory === "motorcycle") return "tow_motorcycle";
    if (vehicleCategory === "truck") return "tow_heavy";
    return "tow_light";
  };

  const getTowLabelForCategory = (): string => {
    if (vehicleCategory === "motorcycle") return "Reboque Moto";
    if (vehicleCategory === "truck") return "Reboque Pesado";
    return "Reboque Leve";
  };

  const getServiceOptionsForEvent = (): { value: string; label: string }[] => {
    const towOption = { value: getTowTypeForCategory(), label: getTowLabelForCategory() };
    switch (form.event_type) {
      case "locked_out":
        return [{ value: "locksmith", label: "Chaveiro" }, towOption];
      case "battery_dead":
        return [{ value: "battery", label: "Recarga de Bateria" }, towOption];
      case "flat_tire":
        return [{ value: "tire_change", label: "Troca de Pneu" }, towOption];
      case "fuel_empty":
        return [{ value: "fuel", label: "Auxílio Combustível" }, towOption];
      default:
        return [towOption];
    }
  };

  // Auto-select service when event_type changes
  useEffect(() => {
    if (attendanceType !== "pane") return;
    const options = getServiceOptionsForEvent();
    if (!options.find(o => o.value === form.service_type)) {
      update("service_type", options[0].value);
    }
  }, [form.event_type, vehicleCategory, attendanceType]);

  const paneServiceOptions = getServiceOptionsForEvent();

  // ═══ Plate search: beneficiary DB then FIPE ═══
  const handlePlateChange = useCallback(async (value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
    update("vehicle_plate", upper);
    setErrors((p) => ({ ...p, vehicle_plate: "" }));

    if (upper.length === 7) {
      setPlateLookupStatus("loading");

      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/public-service-request`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ action: "lookup_plate", plate: upper }),
        });
        const data = await res.json();
        if (data?.beneficiary?.tenant_id) setTenantId(data.beneficiary.tenant_id);
        if (data.beneficiary) {
          setPlateLookupStatus("found");
          setForm((f) => ({
            ...f,
            requester_name: f.requester_name || data.beneficiary.name || "",
            requester_phone: f.requester_phone || (data.beneficiary.phone ? maskPhone(data.beneficiary.phone) : ""),
            vehicle_model: data.beneficiary.vehicle_model || f.vehicle_model,
            vehicle_year: data.beneficiary.vehicle_year ? String(data.beneficiary.vehicle_year) : f.vehicle_year,
          }));
          return;
        }
      } catch { /* continue to FIPE */ }

      try {
        const res = await fetch(`https://brasilapi.com.br/api/fipe/preco/v1/${upper}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setPlateLookupStatus("found");
            setForm((f) => ({
              ...f,
              vehicle_model: f.vehicle_model || data[0].modelo || "",
              vehicle_year: f.vehicle_year || (data[0].anoModelo ? String(data[0].anoModelo) : ""),
            }));
            return;
          }
        }
      } catch { /* fallback to manual */ }

      setPlateLookupStatus("not_found");
    } else {
      setPlateLookupStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (tenantId) return;
    (async () => {
      try {
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/public-service-request`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({ action: "get_default_tenant" }),
        });
        const data = await res.json();
        if (data?.tenant_id) setTenantId(data.tenant_id);
      } catch {}
    })();
  }, [tenantId]);

  const handleCategoryChange = (cat: VehicleCategory) => {
    setVehicleCategory(cat);
    if (attendanceType === "pane") {
      if (cat === "motorcycle") update("service_type", "tow_motorcycle");
      else if (cat === "truck") update("service_type", "tow_heavy");
      else update("service_type", "tow_light");
    }
  };

  const captureGPS = async () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS não disponível", description: "Seu navegador não suporta geolocalização.", variant: "destructive" });
      return;
    }
    setGpsLoading(true);

    const onSuccess = async (pos: GeolocationPosition) => {
      const { latitude, longitude } = pos.coords;
      setOriginCoords({ lat: latitude, lng: longitude });
      const geo = await reverseGeocode(latitude, longitude);
      setForm((f) => ({
        ...f,
        origin_address: geo.address,
        origin_city: geo.city,
        origin_uf: geo.state,
      }));
      setErrors((p) => ({ ...p, origin_address: "", origin_city: "" }));
      setGpsLoading(false);
      toast({ title: "Localização capturada!" });
    };

    const onError = (err: GeolocationPositionError) => {
      setGpsLoading(false);
      const friendlyMessages: Record<number, string> = {
        1: "Permissão de localização negada. Verifique as configurações do navegador e tente novamente.",
        2: "Não foi possível determinar sua localização. Verifique se o GPS está ativado.",
        3: "O tempo para obter a localização esgotou. Tente novamente em um local com melhor sinal.",
      };
      toast({
        title: "Não foi possível obter localização",
        description: friendlyMessages[err.code] || "Erro desconhecido. Tente novamente.",
        variant: "destructive",
      });
    };

    // Try high accuracy first; if it fails with timeout or unavailable, retry with low accuracy
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (err) => {
        if (err.code === 2 || err.code === 3) {
          // Retry without high accuracy (uses network/WiFi instead of GPS)
          navigator.geolocation.getCurrentPosition(onSuccess, onError, {
            enableHighAccuracy: false,
            timeout: 20000,
            maximumAge: 120000,
          });
        } else {
          onError(err);
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const getVerificationAnswers = () => {
    // Return checklist for pane OR collision with tow
    if (attendanceType === "collision" && !needsTow) return {};
    if (vehicleCategory === "car") return { category: "car", ...carVerification };
    if (vehicleCategory === "motorcycle") return { category: "motorcycle", ...motoVerification };
    return { category: "truck", ...truckVerification };
  };

  const validateChecklist = (): string | null => {
    // Checklist NOT required for collision without tow
    if (attendanceType === "collision" && !needsTow) return null;
    // Also not required for pane without tow (on-site services)
    if (attendanceType === "pane" && ["locksmith", "tire_change", "battery", "fuel"].includes(form.service_type)) return null;

    const requiredByCategory: Record<VehicleCategory, { fields: string[]; data: Record<string, string> }> = {
      car: {
        fields: ["wheel_locked", "steering_locked", "armored", "vehicle_lowered", "carrying_cargo", "easy_access", "key_available", "documents_available", "has_passengers", "had_collision", "risk_area", "vehicle_starts"],
        data: carVerification as any,
      },
      motorcycle: {
        fields: ["wheel_locked", "easy_access", "docs_key_available"],
        data: motoVerification as any,
      },
      truck: {
        fields: ["truck_type", "loaded", "moves"],
        data: truckVerification as any,
      },
    };
    const { fields, data } = requiredByCategory[vehicleCategory];
    const missing = fields.filter((f) => !data[f] || data[f].trim() === "");
    if (missing.length > 0) return "Preencha todos os campos obrigatórios do checklist de verificação.";

    // Conditional: if wheel_locked=yes, wheel_locked_count is required (car only)
    if (vehicleCategory === "car" && (carVerification as any).wheel_locked === "yes" && !(carVerification as any).wheel_locked_count) {
      return "Informe quantas rodas estão travadas.";
    }

    // Conditional: if easy_access=no, vehicle_location is required (car only)
    if (vehicleCategory === "car" && (carVerification as any).easy_access === "no" && !(carVerification as any).vehicle_location) {
      return "Informe onde o veículo está localizado.";
    }

    return null;
  };

  const effectiveServiceType = attendanceType === "collision"
    ? (needsTow ? (vehicleCategory === "motorcycle" ? "tow_motorcycle" : vehicleCategory === "truck" ? "tow_heavy" : "tow_light") : "collision")
    : form.service_type;

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!form.requester_name.trim()) errs.requester_name = "Nome é obrigatório";
    if (!form.requester_phone.trim()) errs.requester_phone = "Telefone é obrigatório";
    if (!form.vehicle_plate.trim() || form.vehicle_plate.length < 7) errs.vehicle_plate = "Placa é obrigatória (7 caracteres)";
    if (!form.vehicle_model.trim()) errs.vehicle_model = "Modelo do veículo é obrigatório";
    if (!form.vehicle_year.trim()) errs.vehicle_year = "Ano do veículo é obrigatório";
    if (!form.origin_address.trim()) errs.origin_address = attendanceType === "collision" ? "Local do ocorrido é obrigatório" : "Endereço de origem é obrigatório";
    if (!form.origin_number.trim()) errs.origin_number = "Número é obrigatório (ou S/N)";
    if (!form.origin_city.trim()) errs.origin_city = "Cidade de origem é obrigatória";
    if (!originCoords) errs.origin_geo = "Selecione o endereço nas sugestões ou use o GPS para geolocalização";

    if (attendanceType === "pane") {
      const onSiteServices = ["locksmith", "tire_change", "battery", "fuel"];
      if (!onSiteServices.includes(form.service_type) && !form.destination_address.trim()) errs.destination_address = "Endereço de destino é obrigatório";
      if (!onSiteServices.includes(form.service_type) && !form.destination_number.trim()) errs.destination_number = "Número de destino é obrigatório (ou S/N)";
      if (!onSiteServices.includes(form.service_type) && !form.destination_city.trim()) errs.destination_city = "Cidade de destino é obrigatória";
      if (!onSiteServices.includes(form.service_type) && !destinationCoords) errs.destination_geo = "Selecione o endereço de destino nas sugestões para geolocalização";
      const checklistError = validateChecklist();
      if (checklistError) errs.checklist = checklistError;
    } else {
      if (needsTow === null) errs.needs_tow = "Informe se precisa de reboque";
      if (needsTow && !form.destination_address.trim()) errs.destination_address = "Endereço de destino é obrigatório para reboque";
      if (needsTow && !form.destination_number.trim()) errs.destination_number = "Número de destino é obrigatório (ou S/N)";
      if (needsTow && !form.destination_city.trim()) errs.destination_city = "Cidade de destino é obrigatória";
      if (needsTow && !destinationCoords) errs.destination_geo = "Selecione o endereço de destino nas sugestões para geolocalização";
      if (needsTow) {
        const checklistError = validateChecklist();
        if (checklistError) errs.checklist = checklistError;
      }
    }
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // GPS reminder: if no coords and reminder not yet shown, prompt user
    if (!originCoords && !gpsReminderShown) {
      setGpsReminderShown(true);
      toast({
        title: "📍 Localização não compartilhada",
        description: "Você ainda não compartilhou sua localização. Toque no botão de GPS para facilitar o atendimento, ou envie assim mesmo.",
      });
      return;
    }

    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      toast({ title: "Preencha os campos obrigatórios", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/public-service-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
          body: JSON.stringify({
            requester_name: form.requester_name,
            requester_phone: form.requester_phone,
            requester_phone_secondary: form.requester_phone_secondary || null,
            vehicle_plate: form.vehicle_plate,
            vehicle_model: form.vehicle_model,
            vehicle_year: form.vehicle_year,
            vehicle_category: vehicleCategory,
            service_type: effectiveServiceType,
            event_type: attendanceType === "collision" ? "accident" : form.event_type,
            origin_address: form.origin_address,
            origin_lat: originCoords?.lat || null,
            origin_lng: originCoords?.lng || null,
            destination_address: form.destination_address,
            destination_lat: destinationCoords?.lat || null,
            destination_lng: destinationCoords?.lng || null,
            notes: form.notes || null,
            verification_answers: getVerificationAnswers(),
          }),
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao enviar solicitação");

      // If collision without tow, go to media upload step
      if (attendanceType === "collision" && !needsTow) {
        setCreatedRequestId(result.id);
        setTenantId(result.tenant_id || tenantId);
        setSubmitted({
          protocol: result.protocol,
          trackingUrl: `${window.location.origin}/tracking/${result.beneficiary_token}`,
        });
        setLoading(false);
        toast({ title: "Solicitação criada! Agora envie as mídias obrigatórias." });
        return;
      }

      setSubmitted({
        protocol: result.protocol,
        trackingUrl: `${window.location.origin}/tracking/${result.beneficiary_token}`,
      });
      toast({ title: "Solicitação enviada com sucesso!" });
    } catch (err) {
      toast({ title: "Erro", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ═══ Collision media upload step ═══
  if (createdRequestId && submitted && attendanceType === "collision" && !needsTow) {
    const hasPhotos = collisionMediaFiles.some((f) => f.file_type === "photo");
    const hasAudio = collisionMediaFiles.some((f) => f.file_type === "audio");
    const hasDocs = collisionMediaFiles.some((f) => f.file_type === "document");
    const allRequired = hasPhotos && hasAudio && hasDocs;

    return (
      <div className="min-h-screen bg-muted/30">
        <header className="bg-primary text-primary-foreground shadow-md">
          <div className="max-w-lg mx-auto px-4 py-5 flex items-center gap-3">
            <img src={logoTrilho} alt="Logo" className="h-10 w-auto rounded bg-white/90 p-1" />
            <div>
              <h1 className="text-lg font-bold">Registro de Colisão</h1>
              <p className="text-xs opacity-80">Protocolo: {submitted.protocol}</p>
            </div>
          </div>
        </header>
        <main className="max-w-lg mx-auto px-4 py-6 space-y-5">
          <PublicCollisionMedia
            serviceRequestId={createdRequestId}
            onMediaChange={setCollisionMediaFiles}
          />

          {!allRequired && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Envie todas as mídias obrigatórias (fotos, áudio e documentos) para concluir.
            </div>
          )}

          <Button
            onClick={() => setCreatedRequestId(null)}
            disabled={!allRequired}
            className="w-full h-14 text-lg font-bold shadow-lg bg-green-600 hover:bg-green-700 text-white"
          >
            <CheckCircle2 className="h-6 w-6 mr-2" />
            Concluir e Acompanhar Atendimento
          </Button>
        </main>
      </div>
    );
  }

  // ═══ Success screen ═══
  if (submitted) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="pt-8 text-center space-y-5">
            <div className="mx-auto w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="text-xl font-bold">Solicitação Enviada!</h2>
            <p className="text-muted-foreground">Seu protocolo é:</p>
            <p className="text-2xl font-mono font-bold text-primary">{submitted.protocol}</p>

            <a href={submitted.trackingUrl} className="block">
              <Button className="w-full h-14 text-lg font-bold shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                <Navigation className="h-5 w-5" />
                Acompanhar Atendimento
                <ArrowRight className="h-5 w-5" />
              </Button>
            </a>

            <p className="text-xs text-muted-foreground">
              Você poderá ver o status em tempo real e a localização do prestador quando disponível.
            </p>

            <Button
              variant="outline"
              onClick={() => {
                navigator.clipboard.writeText(submitted.trackingUrl);
                toast({ title: "Link copiado!" });
              }}
              className="w-full"
            >
              Copiar link de acompanhamento
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Whether to show checklist
  const showChecklist = attendanceType === "pane" || (attendanceType === "collision" && needsTow === true);
  // Whether destination is needed
  const onSiteServices = ["locksmith", "tire_change", "battery", "fuel"];
  const needsDestination = attendanceType === "pane" 
    ? !onSiteServices.includes(form.service_type) 
    : (attendanceType === "collision" && needsTow === true);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="bg-primary text-primary-foreground shadow-md">
        <div className="max-w-lg mx-auto px-4 py-5 flex items-center gap-3">
          <img src={logoTrilho} alt="Logo" className="h-10 w-auto rounded bg-white/90 p-1" />
          <div>
            <h1 className="text-lg font-bold">Solicitar Atendimento</h1>
            <p className="text-xs opacity-80">Preencha os dados para solicitar assistência</p>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* ═══ Tipo de Atendimento ═══ */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
                <ShieldAlert className="h-4 w-4" /> Tipo de Atendimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  variant={attendanceType === "pane" ? "default" : "outline"}
                  onClick={() => { setAttendanceType("pane"); setNeedsTow(null); }}
                  className="h-14 text-sm font-semibold flex-col gap-0.5"
                >
                  <span>🔧 Pane</span>
                  <span className="text-[10px] font-normal opacity-70">Demais problemas</span>
                </Button>
                <Button
                  type="button"
                  variant={attendanceType === "collision" ? "default" : "outline"}
                  onClick={() => { setAttendanceType("collision"); setNeedsTow(null); }}
                  className="h-14 text-sm font-semibold"
                >
                  💥 Colisão
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* ═══ Veículo ═══ */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
                <Car className="h-4 w-4" /> Veículo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Tipo de Veículo *</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["car", "motorcycle", "truck"] as VehicleCategory[]).map((cat) => (
                    <Button
                      key={cat}
                      type="button"
                      variant={vehicleCategory === cat ? "default" : "outline"}
                      onClick={() => handleCategoryChange(cat)}
                      className="text-sm h-10"
                    >
                      {cat === "car" ? "🚗 Carro" : cat === "motorcycle" ? "🏍️ Moto" : "🚛 Caminhão"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Placa do Veículo *</Label>
                <div className="relative">
                  <Input
                    value={form.vehicle_plate}
                    onChange={(e) => handlePlateChange(e.target.value)}
                    placeholder="ABC1D23"
                    maxLength={7}
                    className={`uppercase font-mono text-lg tracking-widest pr-10 ${errors.vehicle_plate ? "border-destructive" : ""}`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {plateLookupStatus === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {plateLookupStatus === "found" && <CheckCircle2 className="h-4 w-4 text-primary" />}
                    {plateLookupStatus === "not_found" && <Search className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </div>
                {errors.vehicle_plate && <p className="text-xs text-destructive">{errors.vehicle_plate}</p>}
                {plateLookupStatus === "found" && (
                  <p className="text-xs text-primary">✓ Dados encontrados: {form.vehicle_model} {form.vehicle_year}</p>
                )}
                {plateLookupStatus === "not_found" && (
                  <p className="text-xs text-muted-foreground">Veículo não encontrado. Preencha manualmente.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Modelo *</Label>
                  <Input
                    value={form.vehicle_model}
                    onChange={(e) => { update("vehicle_model", e.target.value); setErrors((p) => ({ ...p, vehicle_model: "" })); }}
                    placeholder="Ex: Gol 1.0"
                    className={errors.vehicle_model ? "border-destructive" : ""}
                  />
                  {errors.vehicle_model && <p className="text-xs text-destructive">{errors.vehicle_model}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Ano *</Label>
                  <Input
                    type="number"
                    value={form.vehicle_year}
                    onChange={(e) => { update("vehicle_year", e.target.value); setErrors((p) => ({ ...p, vehicle_year: "" })); }}
                    placeholder="2024"
                    className={errors.vehicle_year ? "border-destructive" : ""}
                  />
                  {errors.vehicle_year && <p className="text-xs text-destructive">{errors.vehicle_year}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ═══ Dados do Solicitante ═══ */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
                <User className="h-4 w-4" /> Seus Dados
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Nome Completo *</Label>
                <Input
                  value={form.requester_name}
                  onChange={(e) => { update("requester_name", e.target.value); setErrors((p) => ({ ...p, requester_name: "" })); }}
                  placeholder="Seu nome completo"
                  className={errors.requester_name ? "border-destructive" : ""}
                  maxLength={200}
                />
                {errors.requester_name && <p className="text-xs text-destructive">{errors.requester_name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Telefone *</Label>
                <Input
                  value={form.requester_phone}
                  onChange={(e) => { update("requester_phone", maskPhone(e.target.value)); setErrors((p) => ({ ...p, requester_phone: "" })); }}
                  placeholder="(00) 00000-0000"
                  className={errors.requester_phone ? "border-destructive" : ""}
                />
                {errors.requester_phone && <p className="text-xs text-destructive">{errors.requester_phone}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Telefone Secundário</Label>
                <Input
                  value={form.requester_phone_secondary}
                  onChange={(e) => update("requester_phone_secondary", maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </CardContent>
          </Card>

          {/* ═══ PANE: Motivo e Serviço (filtrado por motivo) ═══ */}
          {attendanceType === "pane" && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
                  <AlertTriangle className="h-4 w-4" /> Motivo da Pane / Serviço
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Motivo da Pane *</Label>
                  <Select value={form.event_type} onValueChange={(v) => update("event_type", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {eventTypeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Tipo de Serviço *</Label>
                  <Select value={form.service_type} onValueChange={(v) => update("service_type", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {paneServiceOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ═══ COLISÃO: Precisa de reboque? ═══ */}
          {attendanceType === "collision" && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
                  💥 Detalhes da Colisão
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">Precisa de reboque? *</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={needsTow === true ? "default" : "outline"}
                      onClick={() => { setNeedsTow(true); setErrors((p) => ({ ...p, needs_tow: "" })); }}
                      className="h-10"
                    >
                      ✅ Sim
                    </Button>
                    <Button
                      type="button"
                      variant={needsTow === false ? "default" : "outline"}
                      onClick={() => { setNeedsTow(false); setErrors((p) => ({ ...p, needs_tow: "" })); }}
                      className="h-10"
                    >
                      ❌ Não
                    </Button>
                  </div>
                  {errors.needs_tow && <p className="text-xs text-destructive">{errors.needs_tow}</p>}
                </div>

                {needsTow === false && (
                  <div className="rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900">
                    <p className="font-semibold mb-1">ℹ️ Registro de Colisão</p>
                    <p className="text-xs">Após enviar a solicitação, você precisará enviar fotos, áudio e documentos obrigatórios.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ═══ Checklist (PANE ou COLISÃO COM REBOQUE) ═══ */}
          {showChecklist && (
            <>
              <div className={vehicleCategory !== "car" ? "hidden" : ""}>
                <CarVerification
                  data={carVerification}
                  onChange={(field, value) => setCarVerification((prev) => ({ ...prev, [field]: value }))}
                />
              </div>
              <div className={vehicleCategory !== "motorcycle" ? "hidden" : ""}>
                <MotorcycleVerification
                  data={motoVerification}
                  onChange={(field, value) => setMotoVerification((prev) => ({ ...prev, [field]: value }))}
                />
              </div>
              <div className={vehicleCategory !== "truck" ? "hidden" : ""}>
                <TruckVerification
                  data={truckVerification}
                  onChange={(field, value) => setTruckVerification((prev) => ({ ...prev, [field]: value }))}
                />
              </div>
              {errors.checklist && (
                <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {errors.checklist}
                </div>
              )}
            </>
          )}

          {/* ═══ Localização ═══ */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
                <MapPin className="h-4 w-4" /> {attendanceType === "collision" ? "Local do Ocorrido" : "Localização"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* ═══ Prominent GPS Button ═══ */}
              {!originCoords && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    onClick={captureGPS}
                    disabled={gpsLoading}
                    className="w-full h-14 text-base font-semibold gap-3 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg animate-pulse hover:animate-none transition-all"
                  >
                    {gpsLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                      <Navigation className="h-6 w-6" />
                    )}
                    {gpsLoading ? "Capturando localização..." : "Toque aqui para compartilhar sua localização atual"}
                  </Button>
                  <p className="text-xs text-muted-foreground text-center px-2">
                    📍 Use este botão para enviar automaticamente sua localização. Isso ajuda o prestador a chegar mais rápido até você.
                  </p>
                </div>
              )}

              {originCoords && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-emerald-800">Localização capturada com sucesso!</p>
                    <p className="text-xs text-emerald-600">{form.origin_address || `${originCoords.lat.toFixed(5)}, ${originCoords.lng.toFixed(5)}`}</p>
                  </div>
                  <button type="button" className="text-xs text-emerald-700 underline shrink-0" onClick={() => { setOriginCoords(null); setGpsReminderShown(false); update("origin_address", ""); update("origin_number", ""); update("origin_city", ""); update("origin_uf", ""); }}>
                    Limpar
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-sm">{attendanceType === "collision" ? "Local do Ocorrido" : "Endereço de Origem"} *</Label>
                <AddressAutocomplete
                  value={form.origin_address}
                  onChange={(v) => { update("origin_address", v); setErrors((p) => ({ ...p, origin_address: "" })); }}
                  onPlaceSelect={(place) => {
                    setOriginCoords({ lat: place.lat, lng: place.lng });
                    if (place.city) update("origin_city", place.city);
                    if (place.state) update("origin_uf", place.state);
                    setErrors((p) => ({ ...p, origin_city: "" }));
                  }}
                  placeholder="Ou digite o endereço manualmente"
                  error={errors.origin_address}
                  coords={originCoords}
                  disabled={!!originCoords && gpsLoading}
                  tenantId={tenantId}
                  types="address"
                  requireStreetNumber
                />
                {errors.origin_geo && <p className="text-xs text-destructive mt-1">{errors.origin_geo}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Número *</Label>
                  <Input
                    value={form.origin_number}
                    onChange={(e) => { update("origin_number", e.target.value); setErrors((p) => ({ ...p, origin_number: "" })); }}
                    placeholder="Nº ou S/N"
                    className={errors.origin_number ? "border-destructive" : ""}
                  />
                  {errors.origin_number && <p className="text-xs text-destructive">{errors.origin_number}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Cidade *</Label>
                  <Input
                    value={form.origin_city}
                    onChange={(e) => { update("origin_city", e.target.value); setErrors((p) => ({ ...p, origin_city: "" })); }}
                    placeholder="Ex: São Paulo"
                    className={errors.origin_city ? "border-destructive" : ""}
                  />
                  {errors.origin_city && <p className="text-xs text-destructive">{errors.origin_city}</p>}
                </div>
              </div>

              {/* Destination */}
              {needsDestination && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Endereço de Destino *</Label>
                    <AddressAutocomplete
                      value={form.destination_address}
                      onChange={(v) => { update("destination_address", v); setErrors((p) => ({ ...p, destination_address: "" })); }}
                      onPlaceSelect={(place) => {
                        setDestinationCoords({ lat: place.lat, lng: place.lng });
                        if (place.city) update("destination_city", place.city);
                        if (place.state) update("destination_uf", place.state);
                        setErrors((p) => ({ ...p, destination_city: "", destination_geo: "" }));
                      }}
                      placeholder="Digite o endereço de destino"
                      error={errors.destination_address}
                      coords={destinationCoords}
                      tenantId={tenantId}
                      requireStreetNumber
                    />
                    {errors.destination_geo && <p className="text-xs text-destructive mt-1">{errors.destination_geo}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Número Destino *</Label>
                      <Input
                        value={form.destination_number}
                        onChange={(e) => { update("destination_number", e.target.value); setErrors((p) => ({ ...p, destination_number: "" })); }}
                        placeholder="Nº ou S/N"
                        className={errors.destination_number ? "border-destructive" : ""}
                      />
                      {errors.destination_number && <p className="text-xs text-destructive">{errors.destination_number}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Cidade de Destino *</Label>
                      <Input
                        value={form.destination_city}
                        onChange={(e) => { update("destination_city", e.target.value); setErrors((p) => ({ ...p, destination_city: "" })); }}
                        placeholder="Ex: Campinas"
                        className={errors.destination_city ? "border-destructive" : ""}
                      />
                      {errors.destination_city && <p className="text-xs text-destructive">{errors.destination_city}</p>}
                    </div>
                  </div>
                </>
              )}

              <RouteDistanceDisplay originCoords={originCoords} destinationCoords={destinationCoords} />
            </CardContent>
          </Card>

          {/* ═══ Observações ═══ */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
                <FileText className="h-4 w-4" /> Observações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="Informações adicionais..."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Submit */}
          <Button type="submit" className="w-full h-12 text-base font-semibold shadow-md" disabled={loading}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Send className="h-5 w-5 mr-2" />}
            {loading ? "Enviando..." : "Enviar Solicitação"}
          </Button>
        </form>
      </main>
    </div>
  );
}
