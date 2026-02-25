import { useState, useCallback } from "react";
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
} from "lucide-react";
import logoTrilho from "@/assets/logo-trilho.png";
import CarVerification, { defaultCarVerification } from "@/components/service-request/CarVerification";
import MotorcycleVerification, { defaultMotorcycleVerification } from "@/components/service-request/MotorcycleVerification";
import TruckVerification, { defaultTruckVerification } from "@/components/service-request/TruckVerification";

type VehicleCategory = "car" | "motorcycle" | "truck";

const serviceTypeOptions = [
  { value: "tow_light", label: "Reboque Leve" },
  { value: "tow_heavy", label: "Reboque Pesado" },
  { value: "tow_motorcycle", label: "Reboque Moto" },
  { value: "locksmith", label: "Chaveiro" },
  { value: "tire_change", label: "Troca de Pneu" },
  { value: "battery", label: "Bateria" },
  { value: "fuel", label: "Combustível" },
  { value: "other", label: "Outro" },
];

const eventTypeOptions = [
  { value: "mechanical_failure", label: "Pane Mecânica" },
  { value: "accident", label: "Acidente" },
  { value: "theft", label: "Roubo/Furto" },
  { value: "flat_tire", label: "Pneu Furado" },
  { value: "locked_out", label: "Chave Trancada" },
  { value: "battery_dead", label: "Bateria Descarregada" },
  { value: "fuel_empty", label: "Sem Combustível" },
  { value: "other", label: "Outro" },
];

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    const data = await res.json();
    return data.display_name || `${lat}, ${lng}`;
  } catch {
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  }
}

async function lookupPlate(plate: string): Promise<{ model: string; year: string } | null> {
  const clean = plate.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (clean.length < 7) return null;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/fipe/preco/v1/${clean}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        return {
          model: item.modelo || "",
          year: item.anoModelo?.toString() || "",
        };
      }
    }
  } catch { /* fallback to manual */ }
  return null;
}

export default function PublicServiceRequest() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{ protocol: string; trackingUrl: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>("car");
  const [plateLookupStatus, setPlateLookupStatus] = useState<"idle" | "loading" | "found" | "not_found">("idle");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [carVerification, setCarVerification] = useState(defaultCarVerification);
  const [motoVerification, setMotoVerification] = useState(defaultMotorcycleVerification);
  const [truckVerification, setTruckVerification] = useState(defaultTruckVerification);

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
    destination_address: "",
    notes: "",
  });

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const handlePlateChange = useCallback(async (value: string) => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
    update("vehicle_plate", upper);
    setErrors((p) => ({ ...p, vehicle_plate: "" }));

    if (upper.length === 7) {
      setPlateLookupStatus("loading");
      const result = await lookupPlate(upper);
      if (result) {
        setPlateLookupStatus("found");
        setForm((f) => ({ ...f, vehicle_model: result.model, vehicle_year: result.year }));
      } else {
        setPlateLookupStatus("not_found");
      }
    } else {
      setPlateLookupStatus("idle");
    }
  }, []);

  const handleCategoryChange = (cat: VehicleCategory) => {
    setVehicleCategory(cat);
    if (cat === "motorcycle") update("service_type", "tow_motorcycle");
    else if (cat === "truck") update("service_type", "tow_heavy");
    else update("service_type", "tow_light");
  };

  const captureGPS = async () => {
    if (!navigator.geolocation) {
      toast({ title: "GPS não disponível", description: "Seu dispositivo não suporta geolocalização.", variant: "destructive" });
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setOriginCoords({ lat: latitude, lng: longitude });
        const address = await reverseGeocode(latitude, longitude);
        setForm((f) => ({ ...f, origin_address: address }));
        setErrors((p) => ({ ...p, origin_address: "" }));
        setGpsLoading(false);
        toast({ title: "Localização capturada!" });
      },
      (err) => {
        setGpsLoading(false);
        toast({ title: "Erro ao capturar localização", description: err.message, variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const validateChecklist = (): string | null => {
    const requiredByCategory: Record<VehicleCategory, { fields: string[]; data: Record<string, string> }> = {
      car: {
        fields: ["wheel_locked", "steering_locked", "armored", "vehicle_lowered", "carrying_cargo", "easy_access", "vehicle_location", "key_available", "documents_available", "has_passengers", "had_collision", "risk_area", "vehicle_starts"],
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
    return missing.length > 0 ? "Preencha todos os campos obrigatórios do checklist de verificação do veículo." : null;
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!form.requester_name.trim()) errs.requester_name = "Nome é obrigatório";
    if (!form.requester_phone.trim()) errs.requester_phone = "Telefone é obrigatório";
    if (!form.vehicle_plate.trim() || form.vehicle_plate.length < 7) errs.vehicle_plate = "Placa é obrigatória (7 caracteres)";
    if (!form.service_type) errs.service_type = "Serviço é obrigatório";
    if (!form.origin_address.trim()) errs.origin_address = "Endereço de origem é obrigatório";
    if (!form.destination_address.trim()) errs.destination_address = "Endereço de destino é obrigatório";
    const checklistError = validateChecklist();
    if (checklistError) errs.checklist = checklistError;
    return errs;
  };

  const getVerificationAnswers = () => {
    if (vehicleCategory === "car") return { category: "car", ...carVerification };
    if (vehicleCategory === "motorcycle") return { category: "motorcycle", ...motoVerification };
    return { category: "truck", ...truckVerification };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
            service_type: form.service_type,
            event_type: form.event_type,
            origin_address: form.origin_address,
            origin_lat: originCoords?.lat || null,
            origin_lng: originCoords?.lng || null,
            destination_address: form.destination_address,
            notes: form.notes || null,
            verification_answers: getVerificationAnswers(),
          }),
        }
      );

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Erro ao enviar solicitação");

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

  if (submitted) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="pt-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Solicitação Enviada!</h2>
            <p className="text-muted-foreground">Seu protocolo é:</p>
            <p className="text-2xl font-mono font-bold text-primary">{submitted.protocol}</p>
            <p className="text-sm text-muted-foreground">
              Acompanhe o status do seu atendimento pelo link abaixo:
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
            <a href={submitted.trackingUrl} className="block">
              <Button className="w-full">Acompanhar Atendimento</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

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
          {/* Dados do Solicitante */}
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

          {/* Veículo */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
                <Car className="h-4 w-4" /> Veículo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Categoria *</Label>
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
                  <p className="text-xs text-primary">✓ Veículo encontrado: {form.vehicle_model} {form.vehicle_year}</p>
                )}
                {plateLookupStatus === "not_found" && (
                  <p className="text-xs text-muted-foreground">Veículo não encontrado. Preencha manualmente abaixo.</p>
                )}
              </div>

              {(plateLookupStatus === "not_found" || plateLookupStatus === "idle") && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">Modelo</Label>
                    <Input
                      value={form.vehicle_model}
                      onChange={(e) => update("vehicle_model", e.target.value)}
                      placeholder="Ex: Gol 1.0"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">Ano</Label>
                    <Input
                      type="number"
                      value={form.vehicle_year}
                      onChange={(e) => update("vehicle_year", e.target.value)}
                      placeholder="2024"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Motivo da Pane / Serviço */}
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
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o motivo" />
                  </SelectTrigger>
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
                  <SelectTrigger className={errors.service_type ? "border-destructive" : ""}>
                    <SelectValue placeholder="Selecione o serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.service_type && <p className="text-xs text-destructive">{errors.service_type}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Checklist de Verificação do Veículo */}
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

          {/* Endereços */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-primary">
                <MapPin className="h-4 w-4" /> Localização
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Endereço de Origem *</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.origin_address}
                    onChange={(e) => { update("origin_address", e.target.value); setErrors((p) => ({ ...p, origin_address: "" })); }}
                    placeholder="Capture pelo GPS ou digite"
                    className={`flex-1 ${errors.origin_address ? "border-destructive" : ""}`}
                    readOnly={!!originCoords}
                  />
                  <Button
                    type="button"
                    variant={originCoords ? "default" : "outline"}
                    onClick={captureGPS}
                    disabled={gpsLoading}
                    className="shrink-0 px-3"
                    title="Usar minha localização"
                  >
                    {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                  </Button>
                </div>
                {originCoords && (
                  <button
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => { setOriginCoords(null); update("origin_address", ""); }}
                  >
                    Limpar e digitar manualmente
                  </button>
                )}
                {errors.origin_address && <p className="text-xs text-destructive">{errors.origin_address}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Endereço de Destino *</Label>
                <Input
                  value={form.destination_address}
                  onChange={(e) => { update("destination_address", e.target.value); setErrors((p) => ({ ...p, destination_address: "" })); }}
                  placeholder="Rua, Bairro, Cidade - UF"
                  className={errors.destination_address ? "border-destructive" : ""}
                />
                {errors.destination_address && <p className="text-xs text-destructive">{errors.destination_address}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Observações */}
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
                placeholder="Informações adicionais sobre o atendimento..."
                rows={4}
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
