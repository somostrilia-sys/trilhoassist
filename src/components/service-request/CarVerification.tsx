import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardCheck } from "lucide-react";

interface CarVerificationData {
  wheel_locked: string;
  wheel_locked_count: string;
  steering_locked: string;
  armored: string;
  carrying_cargo: string;
  cargo_description: string;
  cargo_photo_url: string;
  easy_access: string;
  vehicle_location: string;
  vehicle_location_other: string;
  height_restriction: string;
  height_restriction_value: string;
  key_available: string;
  documents_available: string;
  has_passengers: string;
  passenger_count: string;
  had_collision: string;
  risk_area: string;
  vehicle_starts: string;
  vehicle_lowered: string;
}

interface Props {
  data: CarVerificationData;
  onChange: (field: keyof CarVerificationData, value: string) => void;
}

function YesNoToggle({ value, onChange, yesLabel = "Sim", noLabel = "Não" }: { value: string; onChange: (v: string) => void; yesLabel?: string; noLabel?: string }) {
  return (
    <div className="flex gap-2">
      <Button type="button" size="sm" variant={value === "yes" ? "default" : "outline"} onClick={() => onChange("yes")}>
        {yesLabel}
      </Button>
      <Button type="button" size="sm" variant={value === "no" ? "default" : "outline"} onClick={() => onChange("no")}>
        {noLabel}
      </Button>
    </div>
  );
}

export const defaultCarVerification: CarVerificationData = {
  wheel_locked: "",
  wheel_locked_count: "",
  steering_locked: "",
  armored: "",
  carrying_cargo: "",
  cargo_description: "",
  cargo_photo_url: "",
  easy_access: "",
  vehicle_location: "",
  vehicle_location_other: "",
  height_restriction: "",
  height_restriction_value: "",
  key_available: "",
  documents_available: "",
  has_passengers: "",
  passenger_count: "",
  had_collision: "",
  risk_area: "",
  vehicle_starts: "",
  vehicle_lowered: "",
};

export default function CarVerification({ data, onChange }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-5 w-5" /> VERIFICAÇÃO DO VEÍCULO
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-4">
          <h4 className="font-semibold text-sm text-muted-foreground">Condições do Veículo</h4>

          <div className="space-y-2">
            <Label>Alguma roda está travada ou o veículo não se movimenta?</Label>
            <YesNoToggle value={data.wheel_locked} onChange={(v) => { onChange("wheel_locked", v); if (v === "no") onChange("wheel_locked_count", ""); }} />
            {data.wheel_locked === "yes" && (
              <div className="mt-2 space-y-1">
                <Label className="text-sm">Quantas rodas estão travadas? *</Label>
                <div className="flex gap-2 flex-wrap">
                  {["1", "2", "3", "4", "nao_sei"].map((opt) => (
                    <Button
                      key={opt}
                      type="button"
                      size="sm"
                      variant={data.wheel_locked_count === opt ? "default" : "outline"}
                      onClick={() => onChange("wheel_locked_count", opt)}
                    >
                      {opt === "nao_sei" ? "Não sei" : opt}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>O veículo está com a direção travada?</Label>
            <YesNoToggle value={data.steering_locked} onChange={(v) => onChange("steering_locked", v)} />
          </div>

          <div className="space-y-2">
            <Label>O veículo é blindado?</Label>
            <YesNoToggle value={data.armored} onChange={(v) => onChange("armored", v)} />
          </div>

          <div className="space-y-2">
            <Label>O veículo é rebaixado?</Label>
            <YesNoToggle value={data.vehicle_lowered} onChange={(v) => onChange("vehicle_lowered", v)} />
          </div>

          <div className="space-y-2">
            <Label>O veículo está transportando carga ou excesso de peso?</Label>
            <YesNoToggle value={data.carrying_cargo} onChange={(v) => onChange("carrying_cargo", v)} />
            {data.carrying_cargo === "yes" && (
              <div className="mt-2 space-y-3">
                <Input placeholder="Qual tipo de carga?" value={data.cargo_description} onChange={(e) => onChange("cargo_description", e.target.value)} />
                <div className="space-y-1">
                  <Label className="text-sm">Foto da carga *</Label>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const url = URL.createObjectURL(file);
                        onChange("cargo_photo_url", url);
                      }
                    }}
                  />
                  {data.cargo_photo_url && (
                    <img src={data.cargo_photo_url} alt="Foto da carga" className="mt-2 max-h-40 rounded-md border object-cover" />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-semibold text-sm text-muted-foreground">Localização e Acesso</h4>

          <div className="space-y-2">
            <Label>O veículo está em nível de rua e local de fácil acesso?</Label>
            <YesNoToggle value={data.easy_access} onChange={(v) => onChange("easy_access", v)} />
          </div>

          <div className="space-y-2">
            <Label>O veículo está em:</Label>
            <Select value={data.vehicle_location} onValueChange={(v) => onChange("vehicle_location", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o local" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="underground_garage">Garagem subterrânea</SelectItem>
                <SelectItem value="parking">Estacionamento</SelectItem>
                <SelectItem value="highway">Rodovia</SelectItem>
                <SelectItem value="difficult_access">Local de difícil acesso (terra, lama, declive)</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
            {data.vehicle_location === "other" && (
              <Input placeholder="Descreva o local" value={data.vehicle_location_other} onChange={(e) => onChange("vehicle_location_other", e.target.value)} className="mt-2" />
            )}
          </div>

          <div className="space-y-2">
            <Label>Há restrição de altura no local (ex: garagem)?</Label>
            <YesNoToggle value={data.height_restriction} onChange={(v) => onChange("height_restriction", v)} />
            {data.height_restriction === "yes" && (
              <Input placeholder="Qual altura?" value={data.height_restriction_value} onChange={(e) => onChange("height_restriction_value", e.target.value)} className="mt-2" />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-semibold text-sm text-muted-foreground">Documentação e Segurança</h4>

          <div className="space-y-2">
            <Label>A chave do veículo está disponível?</Label>
            <YesNoToggle value={data.key_available} onChange={(v) => onChange("key_available", v)} />
          </div>

          <div className="space-y-2">
            <Label>Os documentos do veículo estão no local?</Label>
            <YesNoToggle value={data.documents_available} onChange={(v) => onChange("documents_available", v)} />
          </div>

          <div className="space-y-2">
            <Label>Há passageiros no veículo?</Label>
            <YesNoToggle value={data.has_passengers} onChange={(v) => onChange("has_passengers", v)} />
            {data.has_passengers === "yes" && (
              <Input type="number" placeholder="Quantos?" value={data.passenger_count} onChange={(e) => onChange("passenger_count", e.target.value)} className="mt-2" />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="font-semibold text-sm text-muted-foreground">Situação do Atendimento</h4>

          <div className="space-y-2">
            <Label>O veículo sofreu colisão?</Label>
            <YesNoToggle value={data.had_collision} onChange={(v) => onChange("had_collision", v)} />
          </div>

          <div className="space-y-2">
            <Label>O veículo está em área de risco ou situação emergencial?</Label>
            <YesNoToggle value={data.risk_area} onChange={(v) => onChange("risk_area", v)} />
          </div>

          <div className="space-y-2">
            <Label>O veículo liga ou está totalmente inoperante?</Label>
            <YesNoToggle value={data.vehicle_starts} onChange={(v) => onChange("vehicle_starts", v)} yesLabel="Liga" noLabel="Não liga" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
