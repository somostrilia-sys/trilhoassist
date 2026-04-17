import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { maskPhone, maskCEP, unmask } from "@/lib/masks";
import { useAuth } from "@/contexts/AuthContext";
import { sendServiceLabel } from "@/lib/serviceLabel";
import { sendAutoNotify } from "@/lib/autoNotify";
import { sendCrmEvento } from "@/lib/sendCrmEvento";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import {
  User, Car, MapPin, AlertTriangle, CheckCircle2, Loader2,
  XCircle, Share2, ShieldAlert, Bike, Truck, CalendarIcon, Clock,
} from "lucide-react";
import CarVerification, { defaultCarVerification } from "@/components/service-request/CarVerification";
import MotorcycleVerification, { defaultMotorcycleVerification } from "@/components/service-request/MotorcycleVerification";
import TruckVerification, { defaultTruckVerification } from "@/components/service-request/TruckVerification";
import CollisionMediaUpload from "@/components/collision/CollisionMediaUpload";
import AddressAutocomplete from "@/components/service-request/AddressAutocomplete";
import RouteDistanceDisplay from "@/components/service-request/RouteDistanceDisplay";
import { classifyVehicle, getCompatiblePlanCategories, PLAN_VEHICLE_CATEGORY_LABELS } from "@/lib/vehicleClassification";

type VehicleCategory = "car" | "motorcycle" | "truck";
type AttendanceType = "pane" | "collision" | "periferico";

export default function NewServiceRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tenantId, setTenantId] = useState<string | null>(null);

  const conversationId = searchParams.get("conversation_id");

  useEffect(() => {
    if (user?.id) {
      supabase
        .from("user_tenants")
        .select("tenant_id")
        .eq("user_id", user.id)
        .limit(1)
        .single()
        .then(({ data }) => { if (data) setTenantId(data.tenant_id); });
    }
  }, [user?.id]);

  // Fetch clients for manual client selection
  useEffect(() => {
    if (tenantId) {
      supabase.from("clients").select("id, name").eq("tenant_id", tenantId).eq("active", true).order("name")
        .then(({ data }) => setAllClients(data || []));
    }
  }, [tenantId]);

  const originCoords = searchParams.get("origin_coords");
  const destinationCoords = searchParams.get("destination_coords");

  const allowedServiceTypes = [
    "tow_light",
    "tow_heavy",
    "tow_motorcycle",
    "tow_utility",
    "locksmith",
    "tire_change",
    "battery",
    "fuel",
    "lodging",
    "other",
    "collision",
  ] as const;

  const normalizeServiceType = (value: string | null) => {
    const normalized = value?.trim();
    return normalized && allowedServiceTypes.includes(normalized as (typeof allowedServiceTypes)[number])
      ? normalized
      : null;
  };

  const paramCategory = searchParams.get("vehicle_category") as VehicleCategory | null;
  const paramServiceType = normalizeServiceType(searchParams.get("service_type"));
  const initialCategory: VehicleCategory = paramCategory || (paramServiceType === "tow_motorcycle" ? "motorcycle" : paramServiceType === "tow_heavy" ? "truck" : "car");

  // ═══ Top-level: Pane vs Colisão vs Periféricos ═══
  const [attendanceType, setAttendanceType] = useState<AttendanceType>(
    paramServiceType === "collision" ? "collision" : "pane"
  );
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>(initialCategory);
  const [needsTow, setNeedsTow] = useState<boolean | null>(null); // collision only


  const [form, setForm] = useState({
    requester_name: searchParams.get("name") || "",
    requester_phone: searchParams.get("phone") || "",
    requester_phone_secondary: "",
    vehicle_plate: searchParams.get("plate") || "",
    vehicle_model: searchParams.get("model") || "",
    vehicle_year: searchParams.get("year") || "",
    vehicle_lowered: searchParams.get("vehicle_lowered") === "true",
    difficult_access: searchParams.get("difficult_access") === "true",
    service_type: paramServiceType || (initialCategory === "motorcycle" ? "tow_motorcycle" : initialCategory === "truck" ? "tow_heavy" : "tow_light"),
    event_type: searchParams.get("event_type") || "mechanical_failure",
    origin_address: "",
    origin_number: "",
    origin_complement: "",
    origin_city: "",
    origin_uf: "",
    destination_address: "",
    destination_number: "",
    destination_complement: "",
    destination_city: "",
    destination_uf: "",
    notes: searchParams.get("notes") || "",
    estimated_km: "",
  });

  // Verification checklists
  const [carVerification, setCarVerification] = useState(() => {
    const raw = searchParams.get("car_verification");
    if (!raw) return defaultCarVerification;
    try { return { ...defaultCarVerification, ...JSON.parse(raw) }; } catch { return defaultCarVerification; }
  });
  const [motoVerification, setMotoVerification] = useState(() => {
    const raw = searchParams.get("moto_verification");
    if (!raw) return defaultMotorcycleVerification;
    try { return { ...defaultMotorcycleVerification, ...JSON.parse(raw) }; } catch { return defaultMotorcycleVerification; }
  });
  const [truckVerification, setTruckVerification] = useState(() => {
    const raw = searchParams.get("truck_verification");
    if (!raw) return defaultTruckVerification;
    try { return { ...defaultTruckVerification, ...JSON.parse(raw) }; } catch { return defaultTruckVerification; }
  });

  // Usage control
  const [usageCheck, setUsageCheck] = useState<any>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [exceptionDialogOpen, setExceptionDialogOpen] = useState(false);
  const [exceptionJustification, setExceptionJustification] = useState("");
  const [exceptionSaving, setExceptionSaving] = useState(false);

  // Avulso (99) authorization
  const [avulsoDialogOpen, setAvulsoDialogOpen] = useState(false);
  const [avulsoAuthorizer, setAvulsoAuthorizer] = useState("");
  const [avulsoJustification, setAvulsoJustification] = useState("");
  const [avulsoAuthorized, setAvulsoAuthorized] = useState(false);

  // Beneficiary lookup
  const [beneficiaryFound, setBeneficiaryFound] = useState<{
    id: string; name: string; phone: string | null; cpf: string | null;
    vehicle_model: string | null; vehicle_year: number | null;
    client_id?: string; client_name?: string; plan_name?: string;
  } | null>(null);
  const [plateSearching, setPlateSearching] = useState(false);
  const [fipeSearching, setFipeSearching] = useState(false);
  const [giaData, setGiaData] = useState<{
    plano?: string; mensalidade?: number; eventos?: { data: string; tipo: string }[];
  } | null>(null);
  const [giaSearching, setGiaSearching] = useState(false);

  // Geo coords from AddressAutocomplete
  const [geoCoords, setGeoCoords] = useState<{ origin: { lat: number; lng: number } | null; destination: { lat: number; lng: number } | null }>({
    origin: originCoords ? { lat: parseFloat(originCoords.split(",")[0]), lng: parseFloat(originCoords.split(",")[1]) } : null,
    destination: destinationCoords ? { lat: parseFloat(destinationCoords.split(",")[0]), lng: parseFloat(destinationCoords.split(",")[1]) } : null,
  });

  const plateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Collision state
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);

  // Driver (condutor) state
  const [driverIsBeneficiary, setDriverIsBeneficiary] = useState(true);
  const [driverName, setDriverName] = useState("");

  // Client selection (manual for avulso)
  const [allClients, setAllClients] = useState<{id: string, name: string}[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Scheduling state (Imediato / Agendado)
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [scheduledTime, setScheduledTime] = useState("08:00");

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  // ═══ Plate search: beneficiary then FIPE + GIA ═══
  const searchBeneficiaryByPlate = useCallback(async (plate: string) => {
    const cleanPlate = plate.replace(/[^A-Z0-9]/g, "");
    if (cleanPlate.length < 7) { setBeneficiaryFound(null); setGiaData(null); setAvulsoAuthorized(false); setAvulsoAuthorizer(""); setAvulsoJustification(""); return; }
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
        client_id: data.client_id, client_name: clientName, plan_name: planName,
      });
      setSelectedClientId(data.client_id || null);
      setForm((f) => ({
        ...f,
        requester_name: f.requester_name || data.name,
        requester_phone: f.requester_phone || (data.phone ? maskPhone(data.phone) : ""),
        vehicle_model: f.vehicle_model || data.vehicle_model || "",
        vehicle_year: f.vehicle_year || (data.vehicle_year ? String(data.vehicle_year) : ""),
      }));
      setAvulsoAuthorized(false);
      setAvulsoAuthorizer("");
      setAvulsoJustification("");
      // Also try FIPE to fill any missing data
      if (!data.vehicle_model || !data.vehicle_year) {
        searchFipe(cleanPlate);
      }
      searchGia(cleanPlate, data.cpf || undefined);
    } else {
      setBeneficiaryFound(null);
      setAvulsoAuthorized(false);
      setAvulsoAuthorizer("");
      setAvulsoJustification("");
      // Always try FIPE lookup for non-registered plates
      searchFipe(cleanPlate);
      searchGia(cleanPlate);
    }
  }, []);

  const searchFipe = async (plate: string) => {
    setFipeSearching(true);
    try {
      // Call our edge function for plate lookup
      const { data, error } = await supabase.functions.invoke("plate-lookup", {
        body: { plate },
      });
      if (!error && data && data.found) {
        setForm((f) => ({
          ...f,
          vehicle_model: f.vehicle_model || (data.brand && data.model ? `${data.brand} ${data.model}`.trim() : data.model || ""),
          vehicle_year: f.vehicle_year || (data.year ? String(data.year) : ""),
        }));
        // Auto-detect vehicle category from API
        if (data.category === "motorcycle") {
          setVehicleCategory("motorcycle");
        } else if (data.category === "truck") {
          setVehicleCategory("truck");
        }
      }
    } catch {
      // FIPE lookup failed silently - user fills manually
    } finally {
      setFipeSearching(false);
    }
  };

  const searchGia = async (plate?: string, cpf?: string) => {
    if (!plate && !cpf) return;
    setGiaSearching(true);
    setGiaData(null);
    try {
      const body: Record<string, string> = {};
      if (plate) body.placa = plate;
      if (cpf) body.cpf_cnpj = cpf.replace(/\D/g, "");
      const res = await fetch(
        "https://yrjiegtqfngdliwclpzo.supabase.co/functions/v1/gia-associado-buscar",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization:
              "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlyamllZ3RxZm5nZGxpd2NscHpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDUyNTUyODIsImV4cCI6MjA2MDgzMTI4Mn0.1yWTPl3PYoV6NVMvfZCfI5K9P8L-RA8MFbnBaLBaQ2U",
          },
          body: JSON.stringify(body),
        }
      );
      if (res.ok) {
        const json = await res.json();
        if (json && (json.plano || json.mensalidade || json.eventos)) {
          setGiaData({
            plano: json.plano,
            mensalidade: json.mensalidade,
            eventos: json.eventos,
          });
        }
      }
    } catch {
      // GIA lookup failed silently
    } finally {
      setGiaSearching(false);
    }
  };

  const handlePlateChange = (value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    update("vehicle_plate", upper);
    if (plateDebounceRef.current) clearTimeout(plateDebounceRef.current);
    plateDebounceRef.current = setTimeout(() => searchBeneficiaryByPlate(upper), 500);
  };

  useEffect(() => {
    if (form.vehicle_plate && form.vehicle_plate.length >= 7) {
      searchBeneficiaryByPlate(form.vehicle_plate);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCategoryChange = (cat: VehicleCategory) => {
    setVehicleCategory(cat);
    if (attendanceType === "pane") {
      if (cat === "motorcycle") update("service_type", "tow_motorcycle");
      else if (cat === "truck") update("service_type", "tow_heavy");
      else update("service_type", "tow_light");
    }
  };

  // Usage check
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

  const validateChecklist = (): string | null => {
    // Checklist NOT required for collision without tow or non-tow pane services
    if (attendanceType === "collision" && !needsTow) return null;
    if (attendanceType === "pane" && ["locksmith", "tire_change", "battery", "fuel"].includes(form.service_type)) return null;

    const fieldLabels: Record<string, string> = {
      wheel_locked: "Roda travada",
      steering_locked: "Direção travada",
      armored: "Blindado",
      vehicle_lowered: "Rebaixado",
      carrying_cargo: "Transportando carga",
      easy_access: "Fácil acesso",
      key_available: "Chave disponível",
      documents_available: "Documentos no local",
      has_passengers: "Passageiros",
      had_collision: "Sofreu colisão",
      risk_area: "Área de risco",
      vehicle_starts: "Veículo liga",
      docs_key_available: "Documentos e chave",
      truck_type: "Tipo de caminhão",
      loaded: "Carregado",
      moves: "Se movimenta",
    };
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
    if (missing.length > 0) {
      const missingLabels = missing.slice(0, 3).map(f => fieldLabels[f] || f).join(", ");
      const extra = missing.length > 3 ? ` e mais ${missing.length - 3}` : "";
      return `Checklist incompleto: ${missingLabels}${extra}`;
    }
    
    // Conditional: if wheel_locked=yes, wheel_locked_count is required (car only)
    if (vehicleCategory === "car" && (carVerification as any).wheel_locked === "yes" && !(carVerification as any).wheel_locked_count) {
      return "Informe quantas rodas estão travadas.";
    }
    
    return null;
  };

  const getPaneServiceType = () => {
    const options = getServiceOptionsForEvent();
    const current = form.service_type?.trim();

    if (current && options.some((option) => option.value === current)) {
      return current;
    }

    return options[0]?.value ?? getTowTypeForCategory();
  };

  const getEffectiveServiceType = () => {
    if (attendanceType === "periferico") return "other";
    if (attendanceType === "collision") {
      return needsTow
        ? (vehicleCategory === "motorcycle" ? "tow_motorcycle" : vehicleCategory === "truck" ? "tow_heavy" : "tow_light")
        : "collision";
    }

    return getPaneServiceType();
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!form.vehicle_plate.trim() || form.vehicle_plate.replace(/[^A-Z0-9]/g, "").length < 7)
      errs.vehicle_plate = "Placa do veículo é obrigatória (7 caracteres)";
    if (!form.requester_name.trim()) errs.requester_name = "Nome do solicitante é obrigatório";
    if (!form.requester_phone.trim()) errs.requester_phone = "Telefone do solicitante é obrigatório";
    if (!form.vehicle_model.trim()) errs.vehicle_model = "Modelo do veículo é obrigatório";
    if (!form.vehicle_year.trim()) errs.vehicle_year = "Ano do veículo é obrigatório";
    if (!form.origin_address.trim())
      errs.origin_address = (attendanceType === "collision" || attendanceType === "periferico") ? "Local do ocorrido é obrigatório" : "Endereço de origem é obrigatório";
    if (!form.origin_city.trim()) errs.origin_city = "Cidade de origem é obrigatória";
    if (!geoCoords.origin) errs.origin_geo = "Selecione o endereço nas sugestões para obter geolocalização";

    if (attendanceType === "pane") {
      const selectedServiceType = getPaneServiceType();
      if (!form.service_type?.trim()) {
        errs.service_type = "Tipo de serviço é obrigatório";
      }

      const onSiteServices = ["locksmith", "tire_change", "battery", "fuel"];
      if (!onSiteServices.includes(selectedServiceType) && !form.destination_address.trim())
        errs.destination_address = "Endereço de destino é obrigatório";
      if (!onSiteServices.includes(selectedServiceType) && !form.destination_city.trim())
        errs.destination_city = "Cidade de destino é obrigatória";
      if (!onSiteServices.includes(selectedServiceType) && !geoCoords.destination)
        errs.destination_geo = "Selecione o endereço de destino nas sugestões para geolocalização";
      const checklistError = validateChecklist();
      if (checklistError) errs.checklist = checklistError;
    } else if (attendanceType === "collision") {
      if (needsTow === null) errs.needs_tow = "Informe se precisa de reboque";
      if (needsTow && !form.destination_address.trim()) errs.destination_address = "Endereço de destino é obrigatório para reboque";
      if (needsTow && !form.destination_city.trim()) errs.destination_city = "Cidade de destino é obrigatória";
      if (needsTow && !geoCoords.destination) errs.destination_geo = "Selecione o endereço de destino para geolocalização";
      if (needsTow) {
        const checklistError = validateChecklist();
        if (checklistError) errs.checklist = checklistError;
      }
    }
    // periferico: no destination, no checklist, no tow

    // Avulso (99) validation: require authorization when no beneficiary found
    if (!beneficiaryFound && form.vehicle_plate.replace(/[^A-Z0-9]/g, "").length >= 7 && !avulsoAuthorized) {
      errs.avulso = "Atendimento avulso requer autorização. Preencha a permissão e justificativa.";
    }

    // Scheduling validation
    if (isScheduled && isTowService && attendanceType === "pane") {
      if (!scheduledDate) errs.scheduled_date = "Selecione a data do agendamento";
      if (!scheduledTime) errs.scheduled_time = "Informe o horário do agendamento";
    }

    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      const errorMessages = Object.values(validationErrors);
      toast({ title: "Preencha os campos obrigatórios", description: errorMessages.slice(0, 3).join(" • "), variant: "destructive" });
      // Scroll to first error
      setTimeout(() => {
        const firstErrorEl = document.querySelector(".text-destructive");
        if (firstErrorEl) firstErrorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
      return;
    }
    setLoading(true);

    const effectiveServiceType = getEffectiveServiceType();
    const beneficiaryToken = crypto.randomUUID();
    const isAutoComplete = (attendanceType === "collision" && !needsTow) || attendanceType === "periferico";

    const { data: inserted, error } = await supabase.from("service_requests").insert({
      requester_name: form.requester_name,
      requester_phone: form.requester_phone,
      requester_phone_secondary: form.requester_phone_secondary || null,
      vehicle_plate: form.vehicle_plate || null,
      vehicle_model: form.vehicle_model || null,
      vehicle_year: form.vehicle_year ? parseInt(form.vehicle_year) : null,
      vehicle_lowered: form.vehicle_lowered,
      difficult_access: form.difficult_access,
      service_type: effectiveServiceType as any,
      event_type: (attendanceType === "collision" ? "accident" : attendanceType === "periferico" ? "periferico" : form.event_type) as any,
      origin_address: form.origin_address || null,
      origin_lat: geoCoords.origin?.lat || null,
      origin_lng: geoCoords.origin?.lng || null,
      destination_address: form.destination_address || null,
      destination_lat: geoCoords.destination?.lat || null,
      destination_lng: geoCoords.destination?.lng || null,
      notes: avulsoAuthorized
        ? `[AVULSO 99] Autorizado por: ${avulsoAuthorizer}. Justificativa: ${avulsoJustification}.${form.notes ? `\n${form.notes}` : ""}`
        : (form.notes || null),
      provider_cost: 0,
      estimated_km: form.estimated_km ? parseFloat(String(form.estimated_km)) : null,
      charged_amount: 0,
      operator_id: user?.id,
      tenant_id: tenantId,
      client_id: beneficiaryFound?.client_id || selectedClientId || null,
      beneficiary_id: beneficiaryFound?.id || null,
      protocol: "temp",
      vehicle_category: vehicleCategory,
      verification_answers: (attendanceType === "pane" || (attendanceType === "collision" && needsTow)) ? getVerificationAnswers() as any : {} as any,
      beneficiary_token: beneficiaryToken,
      scheduled_date: isScheduled && scheduledDate ? format(scheduledDate, "yyyy-MM-dd") : null,
      scheduled_time: isScheduled && scheduledTime ? scheduledTime : null,
      driver_name: driverIsBeneficiary ? null : (driverName.trim() || null),

      ...(isAutoComplete ? { status: "completed" as any, completed_at: new Date().toISOString() } : {}),
    } as any).select("id").single();

    if (!error && inserted) {
      await supabase.from("service_request_events").insert({
        service_request_id: inserted.id,
        event_type: "creation",
        description: attendanceType === "collision"
          ? "Registro de colisão criado — finalizado automaticamente"
          : attendanceType === "periferico"
          ? "Registro de periféricos criado — finalizado automaticamente"
          : "Atendimento criado — aguardando acionamento de prestador",
        user_id: user?.id || null,
      });

      sendServiceLabel(inserted.id, "creation");
      const beneficiaryTrackingUrl = `${window.location.origin}/tracking/${beneficiaryToken}`;
      sendAutoNotify(inserted.id, "beneficiary_creation", { beneficiary_tracking_url: beneficiaryTrackingUrl });

      // Send to CRM Eventos for collision/periferico (Objetivo Auto only — server-filtered)
      if (attendanceType === "collision" || attendanceType === "periferico") {
        sendCrmEvento({ serviceRequestId: inserted.id, attendanceType });
      }

      if (conversationId) {
        await supabase
          .from("whatsapp_conversations")
          .update({ status: "service_created", service_request_id: inserted.id })
          .eq("id", conversationId);
      }

      if (attendanceType === "collision" || attendanceType === "periferico") {
        const { data: reqData } = await supabase
          .from("service_requests")
          .select("share_token")
          .eq("id", inserted.id)
          .single();
        setCreatedRequestId(inserted.id);
        setShareToken(reqData?.share_token || null);
        setLoading(false);
        toast({ title: attendanceType === "periferico" ? "Registro de periféricos criado!" : "Registro de colisão criado!", description: "Agora anexe as mídias obrigatórias." });
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

  const getTowUtilityOption = () => ({ value: "tow_utility", label: "Reboque Utilitário" });

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
      case "accident":
        // Colisão → only tow options
        return [towOption, getTowUtilityOption()];
      default:
        // mechanical_failure, theft, other → tow options
        return [towOption, getTowUtilityOption()];
    }
  };

  // Auto-select service when event_type changes
  useEffect(() => {
    if (attendanceType !== "pane") return;
    const options = getServiceOptionsForEvent();
    // If current service is not in the new options, auto-select first
    if (!options.find(o => o.value === form.service_type)) {
      update("service_type", options[0].value);
    }
  }, [form.event_type, vehicleCategory, attendanceType]);

  // Also skip checklist validation for non-tow pane services
  const isTowService = ["tow_light", "tow_heavy", "tow_motorcycle", "tow_utility"].includes(form.service_type);

  const paneServiceOptions = getServiceOptionsForEvent();

  const isCollision = attendanceType === "collision";
  const isPeriferico = attendanceType === "periferico";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Novo Atendimento</h1>
        <p className="text-sm text-muted-foreground">Cadastre um novo atendimento de assistência</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ═══════════════ TIPO: PANE vs COLISÃO vs PERIFÉRICOS ═══════════════ */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">TIPO DE ATENDIMENTO</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button
                type="button"
                variant={attendanceType === "pane" ? "default" : "outline"}
                onClick={() => { setAttendanceType("pane"); setNeedsTow(null); update("service_type", getPaneServiceType()); }}
                className="flex-1 h-14 text-base gap-2 flex-col py-2"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Pane
                </div>
                <span className="text-xs font-normal opacity-70">Demais problemas</span>
              </Button>
              <Button
                type="button"
                variant={attendanceType === "collision" ? "default" : "outline"}
                onClick={() => { setAttendanceType("collision"); setNeedsTow(null); }}
                className="flex-1 h-14 text-base gap-2"
              >
                <ShieldAlert className="h-5 w-5" />
                Colisão
              </Button>
              <Button
                type="button"
                variant={attendanceType === "periferico" ? "default" : "outline"}
                onClick={() => { setAttendanceType("periferico"); setNeedsTow(null); }}
                className="flex-1 h-14 text-base gap-2 flex-col py-2"
              >
                <div className="flex items-center gap-2">
                  <Car className="h-5 w-5" />
                  Periféricos
                </div>
                <span className="text-xs font-normal opacity-70">Troca de Vidros</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════ PLACA + VEÍCULO ═══════════════ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="h-5 w-5" /> VEÍCULO
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Category */}
            <div className="space-y-2">
              <Label>Tipo de Veículo *</Label>
              <div className="flex gap-2">
                {([
                  { cat: "car" as VehicleCategory, label: "Carro", icon: Car },
                  { cat: "motorcycle" as VehicleCategory, label: "Moto", icon: Bike },
                  { cat: "truck" as VehicleCategory, label: "Caminhão", icon: Truck },
                ]).map(({ cat, label, icon: Icon }) => (
                  <Button key={cat} type="button" variant={vehicleCategory === cat ? "default" : "outline"} onClick={() => handleCategoryChange(cat)} className="flex-1 gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Plate - REQUIRED */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Placa do Veículo *</Label>
                <div className="relative">
                  <Input
                    value={form.vehicle_plate}
                    onChange={(e) => handlePlateChange(e.target.value)}
                    maxLength={7}
                    placeholder="ABC1D23"
                    className={`pr-9 uppercase ${errors.vehicle_plate ? "border-destructive" : ""}`}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {(plateSearching || fipeSearching) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {!plateSearching && !fipeSearching && beneficiaryFound && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {!plateSearching && !fipeSearching && !beneficiaryFound && form.vehicle_plate.length >= 7 && <XCircle className="h-4 w-4 text-amber-500" />}
                  </div>
                </div>
                {errors.vehicle_plate && <p className="text-xs text-destructive">{errors.vehicle_plate}</p>}

                {!plateSearching && !fipeSearching && !beneficiaryFound && form.vehicle_plate.length >= 7 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-3">
                    <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      Associado não encontrado na base
                      <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:text-amber-400">Avulso (99)</Badge>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-500">
                      Este é um atendimento avulso. É necessário informar a autorização para prosseguir.
                    </p>
                    {!avulsoAuthorized ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400"
                        onClick={() => setAvulsoDialogOpen(true)}
                      >
                        <ShieldAlert className="h-4 w-4 mr-2" />
                        Informar Autorização
                      </Button>
                    ) : (
                      <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-950/20 p-2 text-sm space-y-1">
                        <div className="flex items-center gap-2 font-medium text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-4 w-4" />
                          Autorização concedida
                        </div>
                        <p className="text-xs text-green-600 dark:text-green-500">
                          Autorizado por: <strong>{avulsoAuthorizer}</strong>
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-500">
                          Justificativa: {avulsoJustification}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-xs text-muted-foreground p-0 h-auto"
                          onClick={() => setAvulsoDialogOpen(true)}
                        >
                          Editar
                        </Button>
                      </div>
                    )}
                    {errors.avulso && <p className="text-xs text-destructive">{errors.avulso}</p>}
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
                        {form.vehicle_model && (
                          <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                            {PLAN_VEHICLE_CATEGORY_LABELS[classifyVehicle(form.vehicle_model, vehicleCategory)] || "Automóvel"}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* GIA data */}
                {giaSearching && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Consultando GIA…
                  </div>
                )}
                {!giaSearching && giaData && (
                  <div className="rounded-md border border-purple-200 bg-purple-50 p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2 font-medium text-purple-800">
                      <Badge className="text-xs bg-purple-600 text-white">GIA ✅</Badge>
                    </div>
                    {giaData.plano && <p className="text-purple-700 text-xs">Plano: <strong>{giaData.plano}</strong></p>}
                    {giaData.mensalidade != null && (
                      <p className="text-purple-700 text-xs">Mensalidade: <strong>R$ {Number(giaData.mensalidade).toFixed(2)}</strong></p>
                    )}
                    {giaData.eventos && giaData.eventos.length > 0 && (
                      <div className="text-xs text-purple-700">
                        <p className="font-medium">Últimos eventos:</p>
                        <ul className="mt-0.5 space-y-0.5">
                          {giaData.eventos.slice(0, 3).map((ev, i) => (
                            <li key={i}>{ev.data} — {ev.tipo}</li>
                          ))}
                        </ul>
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
                <Label>Modelo *</Label>
                <Input value={form.vehicle_model} onChange={(e) => { update("vehicle_model", e.target.value); setErrors(prev => ({ ...prev, vehicle_model: "" })); }} className={errors.vehicle_model ? "border-destructive" : ""} />
                {errors.vehicle_model && <p className="text-xs text-destructive">{errors.vehicle_model}</p>}
                {fipeSearching && <p className="text-xs text-muted-foreground">Buscando na FIPE...</p>}
              </div>
              <div className="space-y-2">
                <Label>Ano *</Label>
                <Input type="number" value={form.vehicle_year} onChange={(e) => { update("vehicle_year", e.target.value); setErrors(prev => ({ ...prev, vehicle_year: "" })); }} className={errors.vehicle_year ? "border-destructive" : ""} />
                {errors.vehicle_year && <p className="text-xs text-destructive">{errors.vehicle_year}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════ DADOS DO SOLICITANTE ═══════════════ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-5 w-5" /> DADOS DO SOLICITANTE
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              {/* Empresa / Associação */}
              {!beneficiaryFound && (
                <div className="space-y-2">
                  <Label>Empresa / Associação *</Label>
                  <Select value={selectedClientId || ""} onValueChange={(v) => { setSelectedClientId(v); setErrors(prev => ({ ...prev, client_id: "" })); }}>
                    <SelectTrigger className={errors.client_id ? "border-destructive" : ""}>
                      <SelectValue placeholder="Selecione a empresa" />
                    </SelectTrigger>
                    <SelectContent>
                      {allClients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.client_id && <p className="text-xs text-destructive">{errors.client_id}</p>}
                </div>
              )}
              {beneficiaryFound?.client_name && (
                <div className="space-y-2">
                  <Label>Empresa / Associação</Label>
                  <Input value={beneficiaryFound.client_name} disabled className="bg-muted" />
                </div>
              )}
            </div>

            {/* Condutor */}
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Condutor</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="driver-is-beneficiary"
                    checked={driverIsBeneficiary}
                    onCheckedChange={(checked) => {
                      setDriverIsBeneficiary(!!checked);
                      if (checked) setDriverName("");
                    }}
                  />
                  <label htmlFor="driver-is-beneficiary" className="text-sm cursor-pointer">
                    Próprio associado
                  </label>
                </div>
              </div>
              {!driverIsBeneficiary && (
                <div className="space-y-2">
                  <Label>Nome do Condutor</Label>
                  <Input
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="Nome de quem está conduzindo o veículo"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ═══════════════ PANE: MOTIVO + SERVIÇO ═══════════════ */}
        {attendanceType === "pane" && (
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
                    <SelectItem value="accident">Colisão</SelectItem>
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
                <Select
                  value={form.service_type}
                  onValueChange={(v) => {
                    if (!v?.trim()) return;
                    update("service_type", v);
                    setErrors((prev) => ({ ...prev, service_type: "" }));
                  }}
                >
                  <SelectTrigger className={errors.service_type ? "border-destructive" : ""}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paneServiceOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.service_type && <p className="text-xs text-destructive">{errors.service_type}</p>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══════════════ AGENDAMENTO (apenas reboque) ═══════════════ */}
        {attendanceType === "pane" && isTowService && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-5 w-5" /> AGENDAMENTO
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-sm font-medium">Tipo de atendimento</Label>
                  <p className="text-xs text-muted-foreground">
                    {isScheduled ? "O atendimento será agendado para a data e horário informados" : "O atendimento será realizado imediatamente"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn("text-sm font-medium", !isScheduled && "text-primary")}>Imediato</span>
                  <Switch checked={isScheduled} onCheckedChange={setIsScheduled} />
                  <span className={cn("text-sm font-medium", isScheduled && "text-primary")}>Agendado</span>
                </div>
              </div>

              {isScheduled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                  <div className="space-y-2">
                    <Label>Data do Agendamento *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !scheduledDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {scheduledDate ? format(scheduledDate, "dd/MM/yyyy") : "Selecione a data"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={scheduledDate}
                          onSelect={setScheduledDate}
                          disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    {errors.scheduled_date && <p className="text-xs text-destructive">{errors.scheduled_date}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Horário *</Label>
                    <Input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══════════════ COLISÃO: PRECISA DE REBOQUE? ═══════════════ */}
        {attendanceType === "collision" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="h-5 w-5" /> DETALHES DA COLISÃO
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Precisa de reboque? *</Label>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant={needsTow === true ? "default" : "outline"}
                    onClick={() => { setNeedsTow(true); setErrors(prev => ({ ...prev, needs_tow: "" })); }}
                    className="flex-1"
                  >
                    Sim, precisa de reboque
                  </Button>
                  <Button
                    type="button"
                    variant={needsTow === false ? "default" : "outline"}
                    onClick={() => { setNeedsTow(false); setErrors(prev => ({ ...prev, needs_tow: "" })); }}
                    className="flex-1"
                  >
                    Não, apenas registro
                  </Button>
                </div>
                {errors.needs_tow && <p className="text-xs text-destructive">{errors.needs_tow}</p>}
              </div>
              {needsTow === false && (
                <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  Será criado apenas o registro de colisão com fotos e documentos. O atendimento será finalizado automaticamente.
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ═══════════════ PERIFÉRICOS: INSTRUÇÕES ═══════════════ */}
        {attendanceType === "periferico" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Car className="h-5 w-5" /> PERIFÉRICOS (TROCA DE VIDROS)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 space-y-2">
                <p className="font-semibold">📸 Mídias obrigatórias: Foto + Áudio</p>
                <p>Tire uma foto próxima do vidro quebrado e uma foto distante mostrando a placa do veículo.</p>
                <p className="text-xs opacity-80">O atendimento será finalizado automaticamente após o envio das mídias.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══════════════ VERIFICAÇÃO DO VEÍCULO (pane com reboque OU colisão com reboque — NÃO periféricos) ═══════════════ */}
        {((attendanceType === "pane" && !["locksmith", "tire_change", "battery", "fuel"].includes(form.service_type)) || (isCollision && needsTow)) && (
          <>
            <div className={vehicleCategory !== "car" ? "hidden" : ""}>
              <CarVerification data={carVerification} onChange={(field, value) => setCarVerification((prev) => ({ ...prev, [field]: value }))} />
            </div>
            <div className={vehicleCategory !== "motorcycle" ? "hidden" : ""}>
              <MotorcycleVerification data={motoVerification} onChange={(field, value) => setMotoVerification((prev) => ({ ...prev, [field]: value }))} />
            </div>
            <div className={vehicleCategory !== "truck" ? "hidden" : ""}>
              <TruckVerification data={truckVerification} onChange={(field, value) => setTruckVerification((prev) => ({ ...prev, [field]: value }))} />
            </div>
            {errors.checklist && (
              <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {errors.checklist}
              </div>
            )}
          </>
        )}

        {/* ═══════════════ ENDEREÇOS ═══════════════ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5" /> ENDEREÇOS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{(isCollision || isPeriferico) ? "Local do Ocorrido *" : "Endereço de Origem *"}</Label>
                <AddressAutocomplete
                  value={form.origin_address}
                  onChange={(v) => { update("origin_address", v); setErrors(prev => ({ ...prev, origin_address: "" })); }}
                  onPlaceSelect={(place) => {
                    setGeoCoords(prev => ({ ...prev, origin: { lat: place.lat, lng: place.lng } }));
                    if (place.city) { update("origin_city", place.city); setErrors(prev => ({ ...prev, origin_city: "" })); }
                    if (place.state) update("origin_uf", place.state);
                  }}
                  placeholder={(isCollision || isPeriferico) ? "Local do ocorrido" : "Digite o endereço de origem"}
                  error={errors.origin_address}
                  tenantId={tenantId}
                   coords={geoCoords.origin}
                   types="address"
                />
                {errors.origin_geo && <p className="text-xs text-destructive mt-1">{errors.origin_geo}</p>}
              </div>
              {/* Destination: show when pane (non-on-site) or collision with tow */}
              {((attendanceType === "pane" && !["locksmith", "tire_change", "battery", "fuel"].includes(form.service_type)) || (isCollision && needsTow)) && (
                <div className="space-y-2">
                  <Label>Endereço de Destino *</Label>
                  <AddressAutocomplete
                    value={form.destination_address}
                    onChange={(v) => { update("destination_address", v); setErrors(prev => ({ ...prev, destination_address: "" })); }}
                    onPlaceSelect={(place) => {
                      setGeoCoords(prev => ({ ...prev, destination: { lat: place.lat, lng: place.lng } }));
                      if (place.city) { update("destination_city", place.city); setErrors(prev => ({ ...prev, destination_city: "" })); }
                      if (place.state) update("destination_uf", place.state);
                    }}
                    placeholder="Digite o endereço de destino"
                    error={errors.destination_address}
                    tenantId={tenantId}
                     coords={geoCoords.destination}
                  />
                  {errors.destination_geo && <p className="text-xs text-destructive mt-1">{errors.destination_geo}</p>}
                </div>
              )}
            </div>

            {/* Origin details */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Referência Origem</Label>
                <Input value={form.origin_complement} onChange={(e) => update("origin_complement", e.target.value)} placeholder="Próximo a..." />
              </div>
              <div className="space-y-2">
                <Label>Cidade Origem *</Label>
                <Input
                  value={form.origin_city}
                  onChange={(e) => { update("origin_city", e.target.value); setErrors(prev => ({ ...prev, origin_city: "" })); }}
                  placeholder="Cidade"
                  className={errors.origin_city ? "border-destructive" : ""}
                />
                {errors.origin_city && <p className="text-xs text-destructive">{errors.origin_city}</p>}
              </div>
              <div className="space-y-2">
                <Label>UF Origem</Label>
                <Input value={form.origin_uf} onChange={(e) => update("origin_uf", e.target.value.toUpperCase())} placeholder="UF" maxLength={2} />
              </div>
            </div>

            {/* Destination details */}
            {((attendanceType === "pane" && !["locksmith", "tire_change", "battery", "fuel"].includes(form.service_type)) || (isCollision && needsTow)) && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Referência Destino</Label>
                  <Input value={form.destination_complement} onChange={(e) => update("destination_complement", e.target.value)} placeholder="Próximo a..." />
                </div>
                <div className="space-y-2">
                  <Label>Cidade Destino *</Label>
                  <Input
                    value={form.destination_city}
                    onChange={(e) => { update("destination_city", e.target.value); setErrors(prev => ({ ...prev, destination_city: "" })); }}
                    placeholder="Cidade"
                    className={errors.destination_city ? "border-destructive" : ""}
                  />
                  {errors.destination_city && <p className="text-xs text-destructive">{errors.destination_city}</p>}
                </div>
                <div className="space-y-2">
                  <Label>UF Destino</Label>
                  <Input value={form.destination_uf} onChange={(e) => update("destination_uf", e.target.value.toUpperCase())} placeholder="UF" maxLength={2} />
                </div>
              </div>
            )}

            {/* Route Distance */}
            {geoCoords.origin && geoCoords.destination && (
              <RouteDistanceDisplay
                originCoords={geoCoords.origin}
                destinationCoords={geoCoords.destination}
                onDistanceCalculated={(km) => update("estimated_km", km)}
              />
            )}

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

        {/* Notes */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} placeholder="Informações adicionais sobre o atendimento..." rows={4} />
            </div>
          </CardContent>
        </Card>

        {/* Collision/Periferico Media Upload (shown after creation) */}
        {(isCollision || isPeriferico) && createdRequestId && (
          <div className="space-y-4">
            <CollisionMediaUpload serviceRequestId={createdRequestId} />
            {isPeriferico && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <p className="font-semibold mb-1">📸 Instruções para Periféricos</p>
                <p>Tire uma foto próxima do vidro quebrado e uma foto distante mostrando a placa do veículo.</p>
                <p className="text-xs mt-1 opacity-80">Obrigatório: foto + áudio</p>
              </div>
            )}
            {shareToken && (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <Share2 className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Link público:</p>
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
                  <span>Tipo:</span><span className="font-medium text-foreground">{isCollision ? "Colisão" : isPeriferico ? "Periféricos (Troca de Vidros)" : "Pane / Assistência"}</span>
                  <span>Solicitante:</span><span className="font-medium text-foreground">{form.requester_name || "—"}</span>
                  <span>Veículo:</span><span className="font-medium text-foreground">{form.vehicle_plate || "—"} {form.vehicle_model}</span>
                  <span>Categoria:</span><span className="font-medium text-foreground">{vehicleCategory === "car" ? "Carro" : vehicleCategory === "motorcycle" ? "Moto" : "Caminhão"}</span>
                   {!isCollision && !isPeriferico && (
                    <>
                      <span>Serviço:</span><span className="font-medium text-foreground">{paneServiceOptions.find(o => o.value === form.service_type)?.label || "—"}</span>
                    </>
                  )}
                  {isCollision && needsTow !== null && (
                    <>
                      <span>Reboque:</span><span className="font-medium text-foreground">{needsTow ? "Sim" : "Não"}</span>
                    </>
                  )}
                  <span>Status:</span><span className="font-medium text-foreground">{(isCollision || isPeriferico) ? "Finalizado automaticamente" : "Aguardando acionamento"}</span>
                  {isScheduled && isTowService && attendanceType === "pane" && scheduledDate && (
                    <>
                      <span>Agendamento:</span>
                      <span className="font-medium text-foreground">
                        {format(scheduledDate, "dd/MM/yyyy")} às {scheduledTime}
                      </span>
                    </>
                  )}
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
              {loading ? "Salvando..." : isCollision ? "Criar Registro de Colisão" : isPeriferico ? "Criar Registro de Periféricos" : "Criar Atendimento"}
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

      {/* Avulso (99) Authorization Dialog */}
      <Dialog open={avulsoDialogOpen} onOpenChange={setAvulsoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Autorização para Atendimento Avulso (99)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Associado <strong>não encontrado</strong> na base de dados para a placa <strong>{form.vehicle_plate}</strong>.
              Para prosseguir com o atendimento avulso, informe quem autorizou e a justificativa.
            </p>
            <div className="space-y-2">
              <Label>Quem autorizou? *</Label>
              <Input
                value={avulsoAuthorizer}
                onChange={(e) => setAvulsoAuthorizer(e.target.value)}
                placeholder="Nome do supervisor/gestor que autorizou"
              />
            </div>
            <div className="space-y-2">
              <Label>Justificativa *</Label>
              <Textarea
                value={avulsoJustification}
                onChange={(e) => setAvulsoJustification(e.target.value)}
                placeholder="Descreva o motivo do atendimento avulso..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvulsoDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (avulsoAuthorizer.trim() && avulsoJustification.trim()) {
                  setAvulsoAuthorized(true);
                  setAvulsoDialogOpen(false);
                  setErrors((prev) => ({ ...prev, avulso: "" }));
                }
              }}
              disabled={!avulsoAuthorizer.trim() || !avulsoJustification.trim()}
            >
              Confirmar Autorização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
