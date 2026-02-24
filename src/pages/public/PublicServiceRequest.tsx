import { useState, useCallback, useRef } from "react";
import { maskPhone, maskCEP, unmask } from "@/lib/masks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  User, Car, MapPin, AlertTriangle, CheckCircle2, Loader2,
  MapPinned, XCircle, Send,
} from "lucide-react";
import CarVerification, { defaultCarVerification } from "@/components/service-request/CarVerification";
import MotorcycleVerification, { defaultMotorcycleVerification } from "@/components/service-request/MotorcycleVerification";
import TruckVerification, { defaultTruckVerification } from "@/components/service-request/TruckVerification";
import logoTrilho from "@/assets/logo-trilho.png";

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=br`,
      { headers: { "Accept-Language": "pt-BR" } }
    );
    const data = await res.json();
    if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch (err) { console.error("Geocoding failed:", err); }
  return null;
}

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

export default function PublicServiceRequest() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<{ protocol: string; trackingUrl: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>("car");

  const [form, setForm] = useState({
    requester_name: "",
    requester_phone: "",
    requester_phone_secondary: "",
    vehicle_plate: "",
    vehicle_model: "",
    vehicle_year: "",
    service_type: "tow_light",
    event_type: "mechanical_failure",
    origin_cep: "",
    origin_address: "",
    origin_number: "",
    destination_cep: "",
    destination_address: "",
    destination_number: "",
    notes: "",
  });

  const [carVerification, setCarVerification] = useState(defaultCarVerification);
  const [motoVerification, setMotoVerification] = useState(defaultMotorcycleVerification);
  const [truckVerification, setTruckVerification] = useState(defaultTruckVerification);

  const [cepLoading, setCepLoading] = useState<{ origin: boolean; destination: boolean }>({ origin: false, destination: false });
  const [geoStatus, setGeoStatus] = useState<{ origin: string; destination: string }>({ origin: "idle", destination: "idle" });
  const [geoCoords, setGeoCoords] = useState<{ origin: { lat: number; lng: number } | null; destination: { lat: number; lng: number } | null }>({ origin: null, destination: null });
  const geoDebounceRef = useRef<{ origin: ReturnType<typeof setTimeout> | null; destination: ReturnType<typeof setTimeout> | null }>({ origin: null, destination: null });
  const cepDebounceRef = useRef<{ origin: ReturnType<typeof setTimeout> | null; destination: ReturnType<typeof setTimeout> | null }>({ origin: null, destination: null });

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
        const num = target === "origin" ? form.origin_number : form.destination_number;
        triggerGeocode(addr, num, target);
      }
    } catch { /* ignore */ }
    finally { setCepLoading((prev) => ({ ...prev, [target]: false })); }
  }, [form.origin_number, form.destination_number, triggerGeocode]);

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

  const getVerificationAnswers = () => {
    if (vehicleCategory === "car") return { category: "car", ...carVerification };
    if (vehicleCategory === "motorcycle") return { category: "motorcycle", ...motoVerification };
    return { category: "truck", ...truckVerification };
  };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!form.requester_name.trim()) errs.requester_name = "Nome é obrigatório";
    if (!form.requester_phone.trim()) errs.requester_phone = "Telefone é obrigatório";
    if (!form.origin_address.trim()) errs.origin_address = "Endereço de origem é obrigatório";
    if (!form.destination_address.trim()) errs.destination_address = "Endereço de destino é obrigatório";
    return errs;
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

    const fullOrigin = [form.origin_address, form.origin_number].filter(Boolean).join(", ");
    const fullDest = [form.destination_address, form.destination_number].filter(Boolean).join(", ");
    const [originGeo, destGeo] = await Promise.all([
      geoCoords.origin ? Promise.resolve(geoCoords.origin) : geocodeAddress(fullOrigin),
      geoCoords.destination ? Promise.resolve(geoCoords.destination) : geocodeAddress(fullDest),
    ]);

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
            origin_lat: originGeo?.lat || null,
            origin_lng: originGeo?.lng || null,
            destination_address: form.destination_address,
            destination_lat: destGeo?.lat || null,
            destination_lng: destGeo?.lng || null,
            notes: form.notes,
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
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 text-center space-y-4">
            <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
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
      <header className="bg-card border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <img src={logoTrilho} alt="Logo" className="h-10 w-auto" />
          <div>
            <h1 className="text-lg font-bold">Solicitar Atendimento</h1>
            <p className="text-xs text-muted-foreground">Preencha os dados abaixo para solicitar assistência</p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Dados do Solicitante */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-5 w-5" /> SEUS DADOS
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome Completo *</Label>
                <Input
                  value={form.requester_name}
                  onChange={(e) => { update("requester_name", e.target.value); setErrors((p) => ({ ...p, requester_name: "" })); }}
                  className={errors.requester_name ? "border-destructive" : ""}
                  maxLength={200}
                />
                {errors.requester_name && <p className="text-xs text-destructive">{errors.requester_name}</p>}
              </div>
              <div className="space-y-2">
                <Label>Telefone *</Label>
                <Input
                  value={form.requester_phone}
                  onChange={(e) => { update("requester_phone", maskPhone(e.target.value)); setErrors((p) => ({ ...p, requester_phone: "" })); }}
                  placeholder="(00) 00000-0000"
                  className={errors.requester_phone ? "border-destructive" : ""}
                />
                {errors.requester_phone && <p className="text-xs text-destructive">{errors.requester_phone}</p>}
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Telefone Secundário</Label>
                <Input
                  value={form.requester_phone_secondary}
                  onChange={(e) => update("requester_phone_secondary", maskPhone(e.target.value))}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </CardContent>
          </Card>

          {/* Veículo */}
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
                  <Input value={form.vehicle_plate} onChange={(e) => update("vehicle_plate", e.target.value.toUpperCase())} maxLength={7} />
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

          {/* Motivo */}
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
                    {serviceTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Verificação condicional */}
          <div className={vehicleCategory !== "car" ? "hidden" : ""}>
            <CarVerification data={carVerification} onChange={(field, value) => setCarVerification((prev) => ({ ...prev, [field]: value }))} />
          </div>
          <div className={vehicleCategory !== "motorcycle" ? "hidden" : ""}>
            <MotorcycleVerification data={motoVerification} onChange={(field, value) => setMotoVerification((prev) => ({ ...prev, [field]: value }))} />
          </div>
          <div className={vehicleCategory !== "truck" ? "hidden" : ""}>
            <TruckVerification data={truckVerification} onChange={(field, value) => setTruckVerification((prev) => ({ ...prev, [field]: value }))} />
          </div>

          {/* Endereços */}
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
                    <Input
                      value={form.origin_address}
                      onChange={(e) => { update("origin_address", e.target.value); setErrors((p) => ({ ...p, origin_address: "" })); }}
                      onBlur={() => scheduleGeocode("origin")}
                      placeholder="Rua, Bairro, Cidade - UF"
                      className={`pr-9 ${errors.origin_address ? "border-destructive" : ""}`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {geoStatus.origin === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      {geoStatus.origin === "success" && <MapPinned className="h-4 w-4 text-green-600" />}
                      {geoStatus.origin === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                    </div>
                  </div>
                  {errors.origin_address && <p className="text-xs text-destructive">{errors.origin_address}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Endereço de Destino *</Label>
                  <div className="relative">
                    <Input
                      value={form.destination_address}
                      onChange={(e) => { update("destination_address", e.target.value); setErrors((p) => ({ ...p, destination_address: "" })); }}
                      onBlur={() => scheduleGeocode("destination")}
                      placeholder="Rua, Bairro, Cidade - UF"
                      className={`pr-9 ${errors.destination_address ? "border-destructive" : ""}`}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {geoStatus.destination === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                      {geoStatus.destination === "success" && <MapPinned className="h-4 w-4 text-green-600" />}
                      {geoStatus.destination === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                    </div>
                  </div>
                  {errors.destination_address && <p className="text-xs text-destructive">{errors.destination_address}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Nº Origem</Label>
                  <Input value={form.origin_number} onChange={(e) => update("origin_number", e.target.value)} onBlur={() => scheduleGeocode("origin")} placeholder="Nº" />
                </div>
                <div className="space-y-2">
                  <Label>Nº Destino</Label>
                  <Input value={form.destination_number} onChange={(e) => update("destination_number", e.target.value)} onBlur={() => scheduleGeocode("destination")} placeholder="Nº" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observações */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => update("notes", e.target.value)}
                  placeholder="Informações adicionais sobre o atendimento..."
                  rows={3}
                  maxLength={2000}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
            {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Send className="h-5 w-5 mr-2" />}
            {loading ? "Enviando..." : "Enviar Solicitação"}
          </Button>
        </form>
      </main>
    </div>
  );
}
