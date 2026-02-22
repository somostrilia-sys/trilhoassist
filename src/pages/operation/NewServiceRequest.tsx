import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { maskPhone } from "@/lib/masks";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { User, Car, MapPin, Wrench, AlertTriangle } from "lucide-react";
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
  const conversationId = searchParams.get("conversation_id");

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
    origin_address: originFromCoords,
    destination_address: "",
    notes: searchParams.get("notes") || "",
  });

  const [carVerification, setCarVerification] = useState(defaultCarVerification);
  const [motoVerification, setMotoVerification] = useState(defaultMotorcycleVerification);
  const [truckVerification, setTruckVerification] = useState(defaultTruckVerification);

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  const serviceTypeOptions = vehicleCategory === "motorcycle"
    ? [{ value: "tow_motorcycle", label: "Reboque Moto" }]
    : vehicleCategory === "truck"
    ? [{ value: "tow_heavy", label: "Reboque Pesado" }]
    : [
        { value: "tow_light", label: "Reboque Leve" },
        { value: "tow_heavy", label: "Reboque Pesado" },
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
              <Input value={form.requester_name} onChange={(e) => update("requester_name", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Telefone do Solicitante *</Label>
              <Input value={form.requester_phone} onChange={(e) => update("requester_phone", maskPhone(e.target.value))} required placeholder="(00) 00000-0000" />
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
                <Input value={form.vehicle_plate} onChange={(e) => update("vehicle_plate", e.target.value.toUpperCase())} />
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
              <Select key={vehicleCategory} value={form.service_type} onValueChange={(v) => update("service_type", v)}>
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

        {/* Conditional Verification */}
        <div key={vehicleCategory}>
          {vehicleCategory === "car" && (
            <CarVerification
              data={carVerification}
              onChange={(field, value) => setCarVerification((prev) => ({ ...prev, [field]: value }))}
            />
          )}
          {vehicleCategory === "motorcycle" && (
            <MotorcycleVerification
              data={motoVerification}
              onChange={(field, value) => setMotoVerification((prev) => ({ ...prev, [field]: value }))}
            />
          )}
          {vehicleCategory === "truck" && (
            <TruckVerification
              data={truckVerification}
              onChange={(field, value) => setTruckVerification((prev) => ({ ...prev, [field]: value }))}
            />
          )}
        </div>

        {/* Addresses */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5" /> ENDEREÇOS
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Endereço de Origem *</Label>
              <Input value={form.origin_address} onChange={(e) => update("origin_address", e.target.value)} placeholder="Rua, Bairro, Cidade - UF" />
            </div>
            <div className="space-y-2">
              <Label>Endereço de Destino *</Label>
              <Input value={form.destination_address} onChange={(e) => update("destination_address", e.target.value)} placeholder="Rua, Bairro, Cidade - UF" />
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
