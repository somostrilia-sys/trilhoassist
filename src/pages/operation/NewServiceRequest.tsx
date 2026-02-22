import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { maskPhone, maskCEP, unmask } from "@/lib/masks";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { User, Car, MapPin, AlertTriangle, Search, CheckCircle2, Loader2 } from "lucide-react";
import CarVerification, { defaultCarVerification } from "@/components/service-request/CarVerification";
import MotorcycleVerification, { defaultMotorcycleVerification } from "@/components/service-request/MotorcycleVerification";
import TruckVerification, { defaultTruckVerification } from "@/components/service-request/TruckVerification";

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

  // Determine initial vehicle category from service type hint
  const initialCategory: VehicleCategory = searchParams.get("service_type") === "tow_motorcycle" ? "motorcycle" : "car";

  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>(initialCategory);

  const [form, setForm] = useState({
    requester_name: searchParams.get("name") || "",
    requester_phone: searchParams.get("phone") || "",
    requester_email: "",
    requester_phone_secondary: "",
    vehicle_plate: searchParams.get("plate") || "",
    vehicle_model: searchParams.get("model") || "",
    vehicle_year: searchParams.get("year") || "",
    vehicle_lowered: false,
    difficult_access: false,
    service_type: "tow_light" as string,
    event_type: "mechanical_failure" as string,
    origin_cep: "",
    origin_address: originFromCoords,
    origin_number: "",
    origin_complement: "",
    destination_cep: "",
    destination_address: "",
    destination_number: "",
    destination_complement: "",
    notes: searchParams.get("notes") || "",
  });

  const [carVerification, setCarVerification] = useState(defaultCarVerification);
  const [motoVerification, setMotoVerification] = useState(defaultMotorcycleVerification);
  const [truckVerification, setTruckVerification] = useState(defaultTruckVerification);

  // Beneficiary lookup
  const [beneficiaryFound, setBeneficiaryFound] = useState<{
    id: string;
    name: string;
    phone: string | null;
    cpf: string | null;
    vehicle_model: string | null;
    vehicle_year: number | null;
    client_name?: string;
    plan_name?: string;
  } | null>(null);
  const [plateSearching, setPlateSearching] = useState(false);
  const [cepLoading, setCepLoading] = useState<{ origin: boolean; destination: boolean }>({ origin: false, destination: false });
  const plateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cepDebounceRef = useRef<{ origin: ReturnType<typeof setTimeout> | null; destination: ReturnType<typeof setTimeout> | null }>({ origin: null, destination: null });

  const searchBeneficiaryByPlate = useCallback(async (plate: string) => {
    const cleanPlate = plate.replace(/[^A-Z0-9]/g, "");
    if (cleanPlate.length < 7) {
      setBeneficiaryFound(null);
      return;
    }
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
        id: data.id,
        name: data.name,
        phone: data.phone,
        cpf: data.cpf,
        vehicle_model: data.vehicle_model,
        vehicle_year: data.vehicle_year,
        client_name: clientName,
        plan_name: planName,
      });
      // Auto-fill form fields from beneficiary
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

  // Trigger plate search on mount if plate is pre-filled
  useEffect(() => {
    if (form.vehicle_plate && form.vehicle_plate.length >= 7) {
      searchBeneficiaryByPlate(form.vehicle_plate);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

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
      } else {
        toast({ title: "CEP não encontrado", description: "Verifique o CEP digitado.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao buscar CEP", variant: "destructive" });
    } finally {
      setCepLoading((prev) => ({ ...prev, [target]: false }));
    }
  }, [toast]);

  const handleCepChange = (value: string, target: "origin" | "destination") => {
    const masked = maskCEP(value);
    update(target === "origin" ? "origin_cep" : "destination_cep", masked);
    if (cepDebounceRef.current[target]) clearTimeout(cepDebounceRef.current[target]!);
    cepDebounceRef.current[target] = setTimeout(() => fetchCep(masked, target), 500);
  };

  // Auto-set service_type based on vehicle category
  const handleCategoryChange = (cat: VehicleCategory) => {
    setVehicleCategory(cat);
    if (cat === "motorcycle") update("service_type", "tow_motorcycle");
    else if (cat === "truck") update("service_type", "tow_heavy");
    else update("service_type", "tow_light");
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
    if (!form.origin_address.trim()) errs.origin_address = "Endereço de origem é obrigatório";
    if (!form.destination_address.trim()) errs.destination_address = "Endereço de destino é obrigatório";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      toast({ title: "Preencha os campos obrigatórios", description: "Verifique os campos destacados em vermelho.", variant: "destructive" });
      return;
    }
    setLoading(true);

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
      destination_address: form.destination_address || null,
      notes: form.notes || null,
      operator_id: user?.id,
      tenant_id: tenantId,
      beneficiary_id: beneficiaryFound?.id || null,
      protocol: "temp",
      vehicle_category: vehicleCategory,
      verification_answers: getVerificationAnswers() as any,
    }).select("id").single();

    if (!error && conversationId && inserted) {
      await supabase
        .from("whatsapp_conversations")
        .update({ status: "service_created", service_request_id: inserted.id })
        .eq("id", conversationId);
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
    { value: "other", label: "Outro" },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Novo Atendimento</h1>
        <p className="text-sm text-muted-foreground">Cadastre um novo atendimento de assistência</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
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
              <Label>Email do Solicitante</Label>
              <Input type="email" value={form.requester_email} onChange={(e) => update("requester_email", e.target.value)} />
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
                <Button
                  type="button"
                  variant={vehicleCategory === "car" ? "default" : "outline"}
                  onClick={() => handleCategoryChange("car")}
                  className="flex-1"
                >
                  Carro
                </Button>
                <Button
                  type="button"
                  variant={vehicleCategory === "motorcycle" ? "default" : "outline"}
                  onClick={() => handleCategoryChange("motorcycle")}
                  className="flex-1"
                >
                  Moto
                </Button>
                <Button
                  type="button"
                  variant={vehicleCategory === "truck" ? "default" : "outline"}
                  onClick={() => handleCategoryChange("truck")}
                  className="flex-1"
                >
                  Caminhão
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Placa</Label>
                <div className="relative">
                  <Input
                    value={form.vehicle_plate}
                    onChange={(e) => handlePlateChange(e.target.value)}
                    maxLength={7}
                    className="pr-9"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {plateSearching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    {!plateSearching && beneficiaryFound && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    {!plateSearching && !beneficiaryFound && form.vehicle_plate.length >= 7 && <Search className="h-4 w-4 text-muted-foreground opacity-50" />}
                  </div>
                </div>
                {beneficiaryFound && (
                  <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm space-y-1">
                    <div className="flex items-center gap-2 font-medium text-green-800">
                      <CheckCircle2 className="h-4 w-4" />
                      Beneficiário encontrado
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

        {/* Event + Service type - FIRST as per user request */}
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
                <Input value={form.origin_address} onChange={(e) => { update("origin_address", e.target.value); setErrors(prev => ({ ...prev, origin_address: "" })); }} placeholder="Rua, Bairro, Cidade - UF" className={errors.origin_address ? "border-destructive" : ""} />
                {errors.origin_address && <p className="text-xs text-destructive">{errors.origin_address}</p>}
              </div>
              <div className="space-y-2">
                <Label>Endereço de Destino *</Label>
                <Input value={form.destination_address} onChange={(e) => { update("destination_address", e.target.value); setErrors(prev => ({ ...prev, destination_address: "" })); }} placeholder="Rua, Bairro, Cidade - UF" className={errors.destination_address ? "border-destructive" : ""} />
                {errors.destination_address && <p className="text-xs text-destructive">{errors.destination_address}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Nº Origem</Label>
                <Input value={form.origin_number} onChange={(e) => update("origin_number", e.target.value)} placeholder="Nº" />
              </div>
              <div className="space-y-2">
                <Label>Complemento Origem</Label>
                <Input value={form.origin_complement} onChange={(e) => update("origin_complement", e.target.value)} placeholder="Apto, Bloco..." />
              </div>
              <div className="space-y-2">
                <Label>Nº Destino</Label>
                <Input value={form.destination_number} onChange={(e) => update("destination_number", e.target.value)} placeholder="Nº" />
              </div>
              <div className="space-y-2">
                <Label>Complemento Destino</Label>
                <Input value={form.destination_complement} onChange={(e) => update("destination_complement", e.target.value)} placeholder="Apto, Bloco..." />
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

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/operation/requests")}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Salvando..." : "Criar Atendimento"}
          </Button>
        </div>
      </form>
    </div>
  );
}
