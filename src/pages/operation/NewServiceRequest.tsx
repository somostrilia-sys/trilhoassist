import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { User, Car, MapPin, Wrench } from "lucide-react";

export default function NewServiceRequest() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    requester_name: "",
    requester_phone: "",
    requester_email: "",
    requester_phone_secondary: "",
    vehicle_plate: "",
    vehicle_model: "",
    vehicle_year: "",
    vehicle_lowered: false,
    difficult_access: false,
    service_type: "tow_light" as string,
    event_type: "mechanical_failure" as string,
    origin_address: "",
    destination_address: "",
    notes: "",
  });

  const update = (field: string, value: any) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.from("service_requests").insert({
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
      protocol: "temp", // will be overwritten by trigger
    });

    setLoading(false);

    if (error) {
      toast({ title: "Erro ao criar atendimento", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Atendimento criado com sucesso!" });
      navigate("/operation/requests");
    }
  };

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
              <Input value={form.requester_phone} onChange={(e) => update("requester_phone", e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Email do Solicitante</Label>
              <Input type="email" value={form.requester_email} onChange={(e) => update("requester_email", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone Secundário</Label>
              <Input value={form.requester_phone_secondary} onChange={(e) => update("requester_phone_secondary", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Vehicle */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Car className="h-5 w-5" /> VEÍCULO
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Checkbox checked={form.vehicle_lowered} onCheckedChange={(v) => update("vehicle_lowered", v)} id="lowered" />
                <Label htmlFor="lowered">Veículo rebaixado</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox checked={form.difficult_access} onCheckedChange={(v) => update("difficult_access", v)} id="difficult" />
                <Label htmlFor="difficult">Difícil acesso</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Service Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-5 w-5" /> SERVIÇO
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo de Serviço *</Label>
              <Select value={form.service_type} onValueChange={(v) => update("service_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tow_light">Reboque Leve</SelectItem>
                  <SelectItem value="tow_heavy">Reboque Pesado</SelectItem>
                  <SelectItem value="tow_motorcycle">Reboque Moto</SelectItem>
                  <SelectItem value="locksmith">Chaveiro</SelectItem>
                  <SelectItem value="tire_change">Troca de Pneu</SelectItem>
                  <SelectItem value="battery">Bateria</SelectItem>
                  <SelectItem value="fuel">Combustível</SelectItem>
                  <SelectItem value="lodging">Hospedagem</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Evento *</Label>
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
          </CardContent>
        </Card>

        {/* Addresses */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5" /> ENDEREÇOS
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Endereço de Origem</Label>
              <Input value={form.origin_address} onChange={(e) => update("origin_address", e.target.value)} placeholder="Rua, Bairro, Cidade - UF" />
            </div>
            <div className="space-y-2">
              <Label>Endereço de Destino</Label>
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
